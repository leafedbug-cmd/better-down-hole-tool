import { adminClient } from '../_shared/supabase_admin.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { createUserMessage, parseSignup, provisionMessage } from '../_shared/signup.ts';

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim().slice(0, 64) ?? '';
  return ip || 'unknown';
}

// Public email sign-ups are disabled on this shared project. The admin API
// still creates a user. Do not set app_metadata.role: the other app provisions
// a portal profile when that claim is admin or member.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Use the sign-up form to create an account.' });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 20000) return json(req, 413, { error: 'That signup is too large. Try fewer machines.' });
    body = JSON.parse(text);
  } catch {
    return json(req, 400, { error: 'The sign-up form was incomplete. Try again.' });
  }

  const parsed = parseSignup(body);
  if (!parsed.ok) return json(req, 400, { error: parsed.error });

  try {
    const admin = adminClient();
    const ipHash = await sha256(`bdht-signup-ip:${clientIp(req)}`);
    const emailHash = await sha256(`bdht-signup-email:${parsed.value.email}`);
    const limit = await admin.rpc('bdht_take_signup_attempt', { p_ip_hash: ipHash, p_email_hash: emailHash });
    if (limit.error) {
      console.error('signup rate limit', limit.error.message);
      return json(req, 503, { error: 'Account creation is unavailable right now. Try again shortly.' });
    }
    if (limit.data === 'ip' || limit.data === 'email') {
      return json(req, 429, { error: 'Too many signup attempts. Wait a little while and try again.' });
    }

    const created = await admin.auth.admin.createUser({
      email: parsed.value.email,
      password: parsed.value.password,
      email_confirm: true,
      user_metadata: { employee_name: parsed.value.employee, source: 'bdht' },
    });
    const userId = created.data?.user?.id;
    if (created.error || !userId) {
      const text = `${created.error?.message ?? ''} ${created.error?.code ?? ''}`;
      return json(req, /already|registered|exists/i.test(text) ? 409 : 400, {
        error: createUserMessage(created.error),
      });
    }

    const provision = await admin.rpc('bdht_provision_signup', {
      p_user: userId,
      p_mode: parsed.value.mode,
      p_company: parsed.value.company,
      p_code: parsed.value.code,
      p_employee: parsed.value.employee,
      p_email: parsed.value.email,
      p_machines: parsed.value.machines,
    });
    if (provision.error) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) console.error('signup rollback failed', removed.error.message);
      const mapped = provisionMessage(provision.error.message || '');
      if (mapped.error.startsWith('We couldn’t finish')) console.error('signup provision', provision.error.message);
      return json(req, mapped.status, { error: mapped.error });
    }

    const capped = provision.data?.capped === true;
    return json(req, 200, { ok: true, capped });
  } catch (error) {
    console.error('signup failed', error instanceof Error ? error.message : 'unknown');
    return json(req, 500, { error: 'We couldn’t create the account. Try again in a few minutes.' });
  }
});
