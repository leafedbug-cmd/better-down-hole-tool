export const PAGES_ORIGIN = 'https://leafedbug-cmd.github.io';
export const SITE = `${PAGES_ORIGIN}/better-down-hole-tool/`;

export const SUCCESS_URL =
  `${SITE}?billing=success&session_id={CHECKOUT_SESSION_ID}#/garage`;
export const CANCEL_URL = `${SITE}?billing=cancel#/garage`;
export const PORTAL_RETURN_URL = `${SITE}?billing=portal#/garage`;

/** Stable Checkout integration label. The last 8 characters are the required random suffix. */
export const INTEGRATION_IDENTIFIER = 'bdht_unlimited_hkwqzmpl';

const ALLOWED_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = origin === PAGES_ORIGIN || ALLOWED_ORIGIN.test(origin)
    ? origin
    : PAGES_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function priceId(): string {
  const price = Deno.env.get('STRIPE_PRICE_ID') ?? '';
  if (!price.startsWith('price_')) {
    throw new Error('STRIPE_PRICE_ID is not set');
  }
  return price;
}
