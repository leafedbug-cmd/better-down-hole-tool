import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.119.0';

export interface OwnerContext {
  user: User;
  companyId: string;
  companyName: string;
  email: string | null;
}

export async function requireOwner(admin: SupabaseClient, req: Request): Promise<OwnerContext> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Sign in first'), { status: 401 });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sign in first'), { status: 401 });

  const { data: member, error: memberError } = await admin
    .from('bdht_members')
    .select('role, company_id, company:bdht_companies(name)')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw Object.assign(new Error('Finish setting up your company first'), { status: 403 });
  if (member.role !== 'owner') {
    throw Object.assign(new Error('Only the company owner can change billing'), { status: 403 });
  }

  const company = member.company as { name?: string } | { name?: string }[] | null;
  const companyName = Array.isArray(company) ? company[0]?.name : company?.name;
  return {
    user: data.user,
    companyId: member.company_id as string,
    companyName: companyName || 'Company',
    email: data.user.email ?? null,
  };
}
