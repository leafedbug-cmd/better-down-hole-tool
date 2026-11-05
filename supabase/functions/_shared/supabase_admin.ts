import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

function serviceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      /* fall through to the legacy service role key */
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('Supabase service key is not set');
  return legacy;
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('SUPABASE_URL is not set');
  return createClient(url, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
