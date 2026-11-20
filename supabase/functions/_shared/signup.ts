export const SIGNUP_FREE_LIMIT = 3;
export const SIGNUP_MACHINE_CAP = 25;

const BRANDS = new Set(['Ditch Witch', 'Vermeer']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[A-Z0-9]{6,12}$/;
const CONTROL = /[\u0000-\u001F\u007F]/;

export type SignupMachine = {
  machine_type_id: number;
  brand: string;
  model: string;
  nickname: string;
};

export type SignupInput = {
  mode: 'new' | 'join';
  company: string;
  code: string;
  employee: string;
  email: string;
  password: string;
  machines: SignupMachine[];
};

export type SignupResult =
  | { ok: true; value: SignupInput }
  | { ok: false; error: string };

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || CONTROL.test(trimmed)) return null;
  return trimmed;
}

function fail(error: string): SignupResult {
  return { ok: false, error };
}

export function parseSignup(body: unknown): SignupResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('The sign-up form was incomplete. Try again.');
  }
  const raw = body as Record<string, unknown>;
  const mode = raw.mode === 'join' ? 'join' : raw.mode === 'new' ? 'new' : null;
  if (!mode) return fail('Choose new company or join a company.');

  const employee = text(raw.employee, 120);
  if (!employee) return fail('Enter your name.');

  if (typeof raw.email !== 'string') return fail('Enter a valid email.');
  const email = raw.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return fail('Enter a valid email.');

  if (typeof raw.password !== 'string') return fail('Password needs at least 8 characters.');
  if (raw.password.length < 8) return fail('Password needs at least 8 characters.');
  if (raw.password.length > 72) return fail('Password must be 72 characters or fewer.');
  if (CONTROL.test(raw.password)) return fail('Password needs at least 8 characters.');

  const company = typeof raw.company === 'string' ? raw.company.trim() : '';
  if (company.length > 120 || CONTROL.test(company)) return fail('Enter your company name.');
  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  if (mode === 'new' && !company) return fail('Enter your company name.');
  if (mode === 'join' && !CODE.test(code)) return fail('Enter the invite code from your company owner.');

  if (!Array.isArray(raw.machines)) return fail('Add the machines this crew runs.');
  if (raw.machines.length > SIGNUP_MACHINE_CAP) return fail(`Add up to ${SIGNUP_MACHINE_CAP} machines in one signup.`);

  const machines: SignupMachine[] = [];
  for (const item of raw.machines) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('Pick a drill from the list.');
    const row = item as Record<string, unknown>;
    const id = row.machine_type_id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 1_000_000_000) {
      return fail('Pick a drill from the list.');
    }
    if (typeof row.brand !== 'string' || !BRANDS.has(row.brand)) return fail('Pick a drill from the list.');
    const model = text(row.model, 80);
    if (!model) return fail('Pick a drill from the list.');
    const nickname = typeof row.nickname === 'string' ? row.nickname.trim() : '';
    if (nickname.length > 60 || CONTROL.test(nickname)) return fail('Unit names can be 60 characters or fewer.');
    machines.push({ machine_type_id: id, brand: row.brand, model, nickname });
  }

  if (mode === 'new' && machines.length < 1) return fail('Pick at least one drill.');
  if (mode === 'new' && machines.length > SIGNUP_FREE_LIMIT) {
    return fail('A free company can add 3 machines. Upgrade after signup for unlimited.');
  }
  return {
    ok: true,
    value: { mode, company, code, employee, email, password: raw.password, machines },
  };
}

export function createUserMessage(error: { message?: string; code?: string } | null): string {
  const message = error?.message || '';
  const code = error?.code || '';
  if (/already|registered|exists/i.test(`${message} ${code}`)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (/signups? not allowed/i.test(message)) {
    return 'New accounts can’t be created right now. Wait a few minutes and try again.';
  }
  if (/password/i.test(message)) return 'Password needs at least 8 characters.';
  return 'We couldn’t create the account. Check the email and password and try again.';
}

export function provisionMessage(message: string): { status: number; error: string } {
  if (/invite code not found/i.test(message)) {
    return { status: 400, error: 'That invite code was not found. Check it with the company owner.' };
  }
  if (/already belong/i.test(message)) {
    return { status: 409, error: 'This email already belongs to a company. Sign in to open it.' };
  }
  if (/free plan includes 3|free company can add 3/i.test(message)) {
    return { status: 400, error: 'A free company can save 3 machines. Remove one and try again.' };
  }
  if (/pick at least one drill/i.test(message)) return { status: 400, error: 'Pick at least one drill.' };
  if (/pick a drill from the list/i.test(message)) return { status: 400, error: 'Pick a drill from the list.' };
  if (/enter your company name/i.test(message)) return { status: 400, error: 'Enter your company name.' };
  if (/enter your name/i.test(message)) return { status: 400, error: 'Enter your name.' };
  if (/enter the invite code/i.test(message)) return { status: 400, error: 'Enter the invite code from your company owner.' };
  if (/unit names/i.test(message)) return { status: 400, error: 'Unit names can be 60 characters or fewer.' };
  if (/up to 25 machines/i.test(message)) return { status: 400, error: 'Add up to 25 machines in one signup.' };
  return { status: 400, error: 'We couldn’t finish setting up the company. Nothing was saved. Try again.' };
}
