import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { adminClient } from '../_shared/supabase_admin.ts';
import { entitledFor, keepStoredSubscription } from '../_shared/entitlement.ts';
import { priceId } from '../_shared/http.ts';
import { idOf, stripeClient, stripeCryptoProvider, type Stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const signature = req.headers.get('Stripe-Signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !secret) return new Response('Webhook is not configured', { status: 500 });

  const body = await req.text();
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      stripeCryptoProvider,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid signature';
    console.error('bdht-stripe-webhook signature', message);
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = adminClient();
  const claimed = await claimEvent(admin, event);
  if (!claimed) return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });

  try {
    const companyId = await dispatch(stripe, admin, event);
    if (companyId) {
      await admin.from('bdht_stripe_events').update({ company_id: companyId }).eq('id', event.id);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await admin.from('bdht_stripe_events').delete().eq('id', event.id);
    const message = error instanceof Error ? error.message : 'Webhook failed';
    console.error('bdht-stripe-webhook', event.type, event.id, message);
    return new Response('Webhook handler failed', { status: 500 });
  }
});

async function claimEvent(admin: SupabaseClient, event: Stripe.Event): Promise<boolean> {
  const { error } = await admin.from('bdht_stripe_events').insert({
    id: event.id,
    event_type: event.type,
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function dispatch(stripe: Stripe, admin: SupabaseClient, event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
      return syncCheckoutSession(stripe, admin, event.data.object as Stripe.Checkout.Session);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return applySubscription(admin, event.data.object as Stripe.Subscription);
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return syncInvoice(stripe, admin, event.data.object as Stripe.Invoice, event.type === 'invoice.payment_failed');
    case 'charge.dispute.created':
      return flagDispute(stripe, admin, event.data.object as Stripe.Dispute, false);
    case 'charge.dispute.closed':
      return flagDispute(stripe, admin, event.data.object as Stripe.Dispute, true);
    case 'charge.refunded':
      return flagRefund(stripe, admin, event.data.object as Stripe.Charge);
    case 'radar.early_fraud_warning.created':
      return flagFraud(stripe, admin, event.data.object as Stripe.Radar.EarlyFraudWarning);
    default:
      return null;
  }
}

async function syncCheckoutSession(
  stripe: Stripe,
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  if (session.mode !== 'subscription') return null;
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return applySubscription(admin, subscription);
}

async function syncInvoice(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
  failed: boolean,
): Promise<string | null> {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const companyId = await applySubscription(admin, subscription);
  if (!companyId) return null;
  const patch: Record<string, unknown> = {
    latest_invoice_id: invoice.id,
    latest_invoice_status: invoice.status,
    updated_at: new Date().toISOString(),
  };
  if (failed) patch.payment_failed_at = new Date().toISOString();
  else if (invoice.status === 'paid') patch.payment_failed_at = null;
  const { error } = await admin.from('bdht_billing').update(patch).eq('company_id', companyId);
  if (error) throw error;
  return companyId;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== 'subscription_details') return null;
  return idOf(parent.subscription_details?.subscription);
}

async function applySubscription(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<string | null> {
  const expected = priceId();
  const customerId = idOf(subscription.customer);
  const item = subscription.items?.data?.[0];
  const incomingPrice = idOf(item?.price);
  const incomingEntitled = entitledFor(subscription.status, incomingPrice, expected);
  const companyId = await companyIdForCustomer(admin, customerId)
    ?? await companyIdFromMetadata(admin, subscription.metadata?.company_id);
  if (!companyId) return null;

  const { data: stored, error: readError } = await admin
    .from('bdht_billing')
    .select('stripe_subscription_id, entitled')
    .eq('company_id', companyId)
    .maybeSingle();
  if (readError) throw readError;
  if (keepStoredSubscription(stored?.stripe_subscription_id, stored?.entitled === true, subscription.id, incomingEntitled)) {
    return companyId;
  }

  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const { error } = await admin.from('bdht_billing').upsert({
    company_id: companyId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    price_id: incomingPrice,
    entitled: incomingEntitled,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  if (error) throw error;
  return companyId;
}

async function flagDispute(
  stripe: Stripe,
  admin: SupabaseClient,
  dispute: Stripe.Dispute,
  closed: boolean,
): Promise<string | null> {
  const companyIds = await companiesForPayment(stripe, admin, idOf(dispute.payment_intent), idOf(dispute.charge));
  let first: string | null = null;
  for (const companyId of companyIds) {
    first ??= companyId;
    if (closed) {
      const { error } = await admin.from('bdht_billing').update({
        open_dispute_id: null,
        dispute_opened_at: null,
        updated_at: new Date().toISOString(),
      }).eq('company_id', companyId).eq('open_dispute_id', dispute.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('bdht_billing').update({
        open_dispute_id: dispute.id,
        dispute_opened_at: new Date((dispute.created ?? Date.now() / 1000) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('company_id', companyId);
      if (error) throw error;
    }
  }
  return first;
}

async function flagRefund(stripe: Stripe, admin: SupabaseClient, charge: Stripe.Charge): Promise<string | null> {
  const companyIds = await companiesForPayment(stripe, admin, idOf(charge.payment_intent), charge.id);
  let first: string | null = null;
  for (const companyId of companyIds) {
    first ??= companyId;
    const { error } = await admin.from('bdht_billing').update({
      last_refunded_charge_id: charge.id,
      last_refunded_at: new Date().toISOString(),
      last_refund_amount: charge.amount_refunded ?? null,
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId);
    if (error) throw error;
  }
  return first;
}

async function flagFraud(
  stripe: Stripe,
  admin: SupabaseClient,
  warning: Stripe.Radar.EarlyFraudWarning,
): Promise<string | null> {
  const companyIds = await companiesForPayment(stripe, admin, idOf(warning.payment_intent), idOf(warning.charge));
  let first: string | null = null;
  for (const companyId of companyIds) {
    first ??= companyId;
    const { error } = await admin.from('bdht_billing').update({
      fraud_warning_id: warning.id,
      fraud_warning_at: new Date((warning.created ?? Date.now() / 1000) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId);
    if (error) throw error;
  }
  return first;
}

async function companiesForPayment(
  stripe: Stripe,
  admin: SupabaseClient,
  paymentIntentId: string | null,
  chargeId: string | null,
): Promise<string[]> {
  let intentId = paymentIntentId;
  if (!intentId && chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    intentId = idOf(charge.payment_intent);
  }
  if (!intentId) return [];

  const subscriptionIds = new Set<string>();
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    const list = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: intentId },
      status: 'paid',
      limit: 100,
      starting_after: startingAfter,
    });
    for (const payment of list.data) {
      const invoiceId = idOf(payment.invoice);
      if (!invoiceId) continue;
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) subscriptionIds.add(subscriptionId);
    }
    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1]?.id;
  }

  const companyIds: string[] = [];
  for (const subscriptionId of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const companyId = await applySubscription(admin, subscription);
    if (companyId) companyIds.push(companyId);
  }
  return companyIds;
}

async function companyIdForCustomer(admin: SupabaseClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data, error } = await admin
    .from('bdht_billing')
    .select('company_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  return (data?.company_id as string | undefined) ?? null;
}

async function companyIdFromMetadata(admin: SupabaseClient, companyId: string | undefined): Promise<string | null> {
  if (!companyId) return null;
  const { data, error } = await admin.from('bdht_companies').select('id').eq('id', companyId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
