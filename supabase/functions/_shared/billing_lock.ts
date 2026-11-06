import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

/** Serialize Stripe reads and billing writes for a company across Edge workers. */
export async function withBillingLock<T>(admin: SupabaseClient, companyId: string, work: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  const key = `company:${companyId}`;
  const { data, error } = await admin.rpc('bdht_claim_billing_lock', { p_key: key, p_token: token });
  if (error) throw error;
  if (data !== true) {
    throw Object.assign(new Error('Billing is being updated. Please try again shortly.'), { status: 503 });
  }
  try {
    return await work();
  } finally {
    const { error: releaseError } = await admin.from('bdht_billing_locks').delete().eq('lock_key', key).eq('token', token);
    if (releaseError) console.error('billing lock release', releaseError.message);
  }
}
