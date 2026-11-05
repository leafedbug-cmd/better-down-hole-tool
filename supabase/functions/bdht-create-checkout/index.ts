import { adminClient } from '../_shared/supabase_admin.ts';
import { stripeClient, idOf, type Stripe } from '../_shared/stripe.ts';
import { requireOwner } from '../_shared/owner.ts';
import {
  CANCEL_URL,
  INTEGRATION_IDENTIFIER,
  SUCCESS_URL,
  json,
  priceId,
} from '../_shared/http.ts';
import { entitledFor } from '../_shared/entitlement.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: json(req, 204, {}).headers });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST only' });

  try {
    const admin = adminClient();
    const owner = await requireOwner(admin, req);
    const stripe = stripeClient();
    const price = priceId();

    const { data: billing, error: billingError } = await admin
      .from('bdht_billing')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status, price_id, entitled')
      .eq('company_id', owner.companyId)
      .maybeSingle();
    if (billingError) throw billingError;

    if (billing?.stripe_subscription_id) {
      const existing = await retrieveSubscription(stripe, billing.stripe_subscription_id);
      if (existing) {
        const stillEntitled = entitledFor(existing.status, priceOn(existing), price);
        if (stillEntitled) {
          return json(req, 409, {
            error: 'This company already has unlimited operators. Use Manage billing.',
            code: 'already_active',
          });
        }
        if (existing.status === 'past_due' || existing.status === 'unpaid' || existing.status === 'paused') {
          return json(req, 409, {
            error: 'Update the card in Manage billing. A second subscription was not started.',
            code: 'use_portal',
          });
        }
      }
    }

    const customer = await ensureCustomer(stripe, admin, owner, billing?.stripe_customer_id ?? null, Boolean(billing?.stripe_customer_id));

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'hosted_page',
      customer,
      client_reference_id: owner.companyId,
      line_items: [{ price, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      origin_context: 'web',
      integration_identifier: INTEGRATION_IDENTIFIER,
      metadata: { company_id: owner.companyId, app: 'bdht' },
      subscription_data: {
        billing_mode: { type: 'flexible' },
        description: 'Unlimited operators for The Better Down Hole Tool',
        metadata: { company_id: owner.companyId, app: 'bdht' },
      },
    });

    if (!session.url) throw new Error('Checkout did not return a URL');
    return json(req, 200, { url: session.url });
  } catch (error) {
    return fail(req, error);
  }
});

function priceOn(subscription: Stripe.Subscription): string | null {
  const price = subscription.items?.data?.[0]?.price;
  return idOf(price);
}

async function retrieveSubscription(stripe: Stripe, id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404) return null;
    throw error;
  }
}

async function ensureCustomer(
  stripe: Stripe,
  admin: ReturnType<typeof adminClient>,
  owner: { companyId: string; companyName: string; email: string | null },
  existingId: string | null,
  replacing: boolean,
): Promise<string> {
  if (existingId) {
    try {
      const customer = await stripe.customers.retrieve(existingId);
      if (!('deleted' in customer) || !customer.deleted) return existingId;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status !== 404) throw error;
    }
  }

  const customer = await stripe.customers.create({
    email: owner.email ?? undefined,
    name: owner.companyName,
    metadata: { company_id: owner.companyId, app: 'bdht' },
  }, {
    idempotencyKey: replacing ? `bdht_cus_${owner.companyId}_${Date.now()}` : `bdht_cus_${owner.companyId}`,
  });

  const { error } = await admin.from('bdht_billing').upsert({
    company_id: owner.companyId,
    stripe_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  if (error) throw error;
  return customer.id;
}

function fail(req: Request, error: unknown): Response {
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status: number }).status) || 500
    : 500;
  const message = error instanceof Error ? error.message : 'Checkout failed';
  console.error('bdht-create-checkout', message);
  return json(req, status >= 400 && status < 600 ? status : 500, { error: message });
}
