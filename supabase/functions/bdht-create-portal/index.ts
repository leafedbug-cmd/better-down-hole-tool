import { adminClient } from '../_shared/supabase_admin.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { requireOwner } from '../_shared/owner.ts';
import { PORTAL_RETURN_URL, corsHeaders, isAllowedOrigin, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST only' });
  if (!isAllowedOrigin(req)) return json(req, 403, { error: 'Origin not allowed' });

  try {
    const admin = adminClient();
    const owner = await requireOwner(admin, req);
    const { data: billing, error } = await admin
      .from('bdht_billing')
      .select('stripe_customer_id')
      .eq('company_id', owner.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!billing?.stripe_customer_id) {
      return json(req, 409, { error: 'Subscribe before managing billing.', code: 'no_customer' });
    }

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: PORTAL_RETURN_URL,
    });
    return json(req, 200, { url: session.url });
  } catch (error) {
    const explicitStatus = typeof error === 'object' && error && 'status' in error
      ? Number((error as { status: number }).status) || 0
      : 0;
    const status = explicitStatus >= 400 && explicitStatus < 600 ? explicitStatus : 500;
    const rawMessage = error instanceof Error ? error.message : 'Portal failed';
    console.error('bdht-create-portal', rawMessage);
    const clientMessage = explicitStatus >= 400 && explicitStatus < 600
      ? rawMessage
      : 'Billing portal is temporarily unavailable. Please try again.';
    return json(req, status, { error: clientMessage });
  }
});
