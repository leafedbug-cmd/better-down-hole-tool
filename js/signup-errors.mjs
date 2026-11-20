/** Crew-facing auth copy. Raw provider text stays in logs, not on the form. */
export function friendlyAuthError(error) {
  const raw = (typeof error === 'string' ? error : (error?.message || String(error || '')))
    .replace(/^.*?:\s*(?=Invite|You already|Sign in)/, '')
    .trim();
  if (/signups? not allowed/i.test(raw)) {
    return 'New accounts can’t be created right now. Wait a few minutes and try again.';
  }
  if (/already registered|already been registered|user already exists|email_exists|already exists/i.test(raw)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (/too many signup|too many attempts|rate limit/i.test(raw)) {
    return 'Too many signup attempts. Wait a little while and try again.';
  }
  if (/invite code/i.test(raw)) {
    return 'That invite code was not found. Check it with the company owner.';
  }
  if (/you already belong/i.test(raw)) {
    return 'This email already belongs to a company. Sign in to open it.';
  }
  if (/email not confirmed/i.test(raw)) {
    return 'Confirm your email first. Check your inbox for the link.';
  }
  if (/invalid login|invalid credentials/i.test(raw)) {
    return 'That email or password does not match.';
  }
  if (/failed to send a request|function not found|failed to fetch|edge function returned a non-2xx/i.test(raw)) {
    return 'Account creation is unavailable right now. Try again shortly.';
  }
  if (!raw || raw === '[object Object]') {
    return 'We couldn’t create the account. Check the form and try again.';
  }
  return raw;
}
