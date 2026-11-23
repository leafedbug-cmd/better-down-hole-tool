# The Better Down Hole Tool (BDHT) — Email Templates

This directory contains the complete HTML and plain-text (`.txt`) email template system for **The Better Down Hole Tool (BDHT)**, built from a single shared layout (`emails/build.mjs` + `emails/src/templates.mjs`).

See [STRIPE_SETUP.md](STRIPE_SETUP.md) for the exact Stripe Dashboard branding and built-in customer email settings.

---

## 1. Folder Structure

| Path | Role |
| :--- | :--- |
| `emails/src/templates.mjs` | Single source of truth for all 18 email templates, subjects, preheaders, variables, and sample data |
| `emails/build.mjs` | Node build script that compiles the shared layout into `dist/`, `supabase-auth/`, `manifest.json`, and `preview/index.html` |
| `emails/dist/*.html` & `*.txt` | Built provider-neutral HTML and plain-text templates (18 pairs, `01` through `18`) using `{{snake_case}}` variables |
| `emails/supabase-auth/*.html` & `*.txt` | Paste-ready Supabase Auth templates (`01` through `05`) using Supabase Go-template variables (`{{ .ConfirmationURL }}`, etc.) |
| `emails/manifest.json` | Machine-readable index of all 18 templates, their subjects, preheaders, variables, and file paths |
| `emails/preview/index.html` | Single-tab browser preview of all 18 templates with Desktop (`600px`), Mobile (`375px`), Light/Dark mode, and HTML/TXT toggles |
| `emails/STRIPE_SETUP.md` | Exact Stripe Dashboard setup guide for Branding, Customer Portal, and built-in Stripe customer email toggles |

---

## 2. How to Build & Preview

No external npm packages are required. Run with Node.js:

```bash
node emails/build.mjs
```

To review all 18 templates at desktop (`600px`) and mobile (`375px`) widths in light or dark mode, open `emails/preview/index.html` in any browser (or serve the repo locally and visit `/emails/preview/`).

---

## 3. Template Catalog (18 Templates)

### Account (Supabase Auth — `emails/dist/` & `emails/supabase-auth/`)
1. `01-confirm-email` (`supabase-auth/01-confirm-signup.html`) — Confirm your email / finish creating your company account
2. `02-magic-link` (`supabase-auth/02-magic-link.html`) — Magic link sign-in
3. `03-reset-password` (`supabase-auth/03-reset-password.html`) — Reset password
4. `04-invite-crew-member` (`supabase-auth/04-invite-user.html`) — Invite a crew member to a company
5. `05-email-change` (`supabase-auth/05-change-email.html`) — Email address change confirmation

### Subscription & Billing (`emails/dist/`)
6. `06-welcome-company-created` — Welcome / company created (Free plan: 3 machines, how to add your first rig)
7. `07-free-limit-reached` — Hit the free limit (tried to add a 4th machine; Unlimited is $2.99/mo)
8. `08-unlimited-active` — Unlimited is active (thank-you, what changed, Manage billing link)
9. `09-payment-failed` — Payment failed, action needed (update card in Manage billing; new machines capped at 3 until fixed, existing machines kept)
10. `10-payment-recovered` — Payment recovered / plan restored
11. `11-renewal-reminder` — Renewal reminder (upcoming charge of $2.99 on `{{renewal_date}}`)
12. `12-card-expiring-soon` — Card expiring soon
13. `13-cancellation-scheduled` — Cancellation scheduled (stays Unlimited until `{{period_end}}`)
14. `14-plan-ended-free` — Plan ended, back on Free (what that means for machines; resubscribe link)
15. `15-refund-issued` — Refund issued (confirmation with amount)
16. `16-payment-receipt` — Receipt / payment confirmation (our own version, if sent instead of Stripe's)

### Internal Admin Alerts (`emails/dist/`)
17. `17-admin-dispute-opened` — Dispute opened on a charge (`charge.dispute.created`)
18. `18-admin-fraud-warning` — Early fraud warning on a charge (`radar.early_fraud_warning.created`)

---

## 4. Variable Reference

### A. App Variables (`{{snake_case}}` in `emails/dist/`)

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{logo_url}}` | Public HTTPS URL to `brand/email/email-logo-dark@2x.png` | `https://leafedbug-cmd.github.io/better-down-hole-tool/brand/email/email-logo-dark@2x.png` |
| `{{app_url}}` | Base application URL | `https://leafedbug-cmd.github.io/better-down-hole-tool/` |
| `{{garage_url}}` | "My rigs" garage URL | `https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage` |
| `{{manage_billing_url}}` | URL to My rigs (where the **Manage billing** button opens the Stripe Customer Portal) or a direct portal session URL | `https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage` |
| `{{support_email}}` | Support contact address (placeholder until chosen) | `support@yourdomain.com` |
| `{{unsubscribe_url}}` | Unsubscribe link included on non-transactional emails (`06`, `07`, `11`) | `https://.../unsubscribe?company=...` |
| `{{first_name}}` | Recipient's first name | `Jake` |
| `{{user_email}}` | Recipient's email address | `jake@ozarkboring.example` |
| `{{old_email}}` / `{{new_email}}` | Previous and requested email addresses (`05-email-change`) | `jake@...` / `j.mercer@...` |
| `{{company_name}}` | Company name in `bdht_companies.name` | `Ozark Boring LLC` |
| `{{company_id}}` | Company UUID in `bdht_companies.id` | `7c9e6679-7425-40de-944b-e07fc1f90ae7` |
| `{{invite_code}}` | 8-character crew invite code (`bdht_companies.invite_code`) | `OZRK7429` |
| `{{invited_by}}` | Name of the crew member or owner sending an invite | `Cole Harlan` |
| `{{confirmation_url}}` | Account confirmation link (`01`) | `https://...` |
| `{{magic_link_url}}` | Single-use magic sign-in link (`02`) | `https://...` |
| `{{reset_password_url}}` | Password recovery link (`03`) | `https://...` |
| `{{invite_url}}` | Crew invite signup link (`04`) | `https://.../better-down-hole-tool/#/account` |
| `{{email_change_url}}` | Email change verification link (`05`) | `https://...` |
| `{{otp_code}}` | 6-digit one-time verification code | `482910` |
| `{{machine_count}}` | Number of machines currently saved in `bdht_machines` | `3` |
| `{{free_machine_limit}}` | Free-tier machine limit | `3` |
| `{{plan_name}}` | Paid plan display name | `The Better Down Hole Tool — Unlimited` |
| `{{amount}}` | Formatted charge amount | `$2.99` |
| `{{renewal_date}}` | Next scheduled billing date | `Dec 20, 2026` |
| `{{period_end}}` | End date of the current billing period | `Dec 20, 2026` |
| `{{payment_date}}` | Date a payment was processed | `Nov 20, 2026` |
| `{{card_brand}}` / `{{card_last4}}` | Card network and last 4 digits | `Visa` / `4242` |
| `{{card_exp_month}}` / `{{card_exp_year}}` | Card expiration month and year | `12` / `2026` |
| `{{invoice_id}}` / `{{charge_id}}` | Stripe Invoice (`in_…`) and Charge (`ch_…`) IDs | `in_1UYX...` / `ch_3UYX...` |
| `{{refund_amount}}` / `{{refund_date}}` | Formatted refund amount and date (`15`) | `$2.99` / `Nov 20, 2026` |
| `{{dispute_id}}` / `{{dispute_reason}}` / `{{dispute_due_date}}` | Stripe Dispute metadata (`17`) | `dp_1...` / `unrecognized` / `Nov 29, 2026` |
| `{{fraud_warning_id}}` / `{{fraud_type}}` | Stripe Radar Early Fraud Warning metadata (`18`) | `issfr_1...` / `made_with_stolen_card` |
| `{{stripe_dashboard_url}}` | Direct link to the payment/dispute in Stripe Dashboard (`17`, `18`) | `https://dashboard.stripe.com/payments/...` |

### B. Supabase Auth Go-Template Variables (`emails/supabase-auth/`)

Confirmed against [Supabase Auth Email Templates documentation](https://supabase.com/docs/guides/auth/auth-email-templates):

| Supabase Variable | Meaning | Used In |
| :--- | :--- | :--- |
| `{{ .ConfirmationURL }}` | Full verification / action URL generated by Supabase Auth | `01`–`05` |
| `{{ .Token }}` | 6-digit OTP token | `01`, `02`, `04`, `05` |
| `{{ .TokenHash }}` | Hashed token for custom frontend verification routes | `01`–`03`, `05` |
| `{{ .RedirectTo }}` | Callback URL supplied by the app requesting a reset | `03-reset-password.html` |
| `{{ .SiteURL }}` | Project's configured Site URL (`https://leafedbug-cmd.github.io/better-down-hole-tool`) | `01`–`05` |
| `{{ .Email }}` | User's current email address | `01`–`05` |
| `{{ .NewEmail }}` | User's requested new email address | `05-change-email.html` |
| `{{ .Data.employee_name }}` | User metadata set at `signUp({ options: { data: { employee_name } } })` | `01-confirm-signup.html` |

To install in Supabase:
1. Open [Authentication → Emails](https://supabase.com/dashboard/project/rdyhhszmfpomixaoehgy/auth/templates) in the Supabase Dashboard.
2. For each template (**Confirm signup**, **Magic Link**, **Reset Password**, **Invite user**, **Change Email Address**), copy the subject line from the comment header in `emails/supabase-auth/<file>.html` and paste the file contents into the **Message body (HTML)** editor.

### Deploy the BDHT recovery change

1. Deploy the frontend before installing the new **Reset Password** HTML.
2. In [Authentication → URL Configuration](https://supabase.com/dashboard/project/rdyhhszmfpomixaoehgy/auth/url-configuration), add `https://thebetterdownholetool.com/?auth=reset` to Redirect URLs. Add `https://leafedbug-cmd.github.io/better-down-hole-tool/?auth=reset` if testing through GitHub Pages, or `http://localhost:8765/?auth=reset` or `http://127.0.0.1:8765/?auth=reset` for local email testing.
3. Install `supabase-auth/03-reset-password.html` in **Authentication → Emails → Reset Password**. It sends BDHT callbacks with `{{ .TokenHash }}` and uses `{{ .ConfirmationURL }}` for other apps on the project.
4. Request a fresh email and complete recovery in a separate browser profile.

---

## 5. Hooking Up an Email Provider (Provider-Neutral Pattern)

All templates in `emails/dist/` are plain string templates with `{{snake_case}}` tokens so they work with any transactional email API (Resend, Postmark, SendGrid, AWS SES, or Mailgun) from a Supabase Edge Function:

```ts
function renderEmail(templateText: string, vars: Record<string, string>): string {
  return templateText.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// Example with any provider HTTP API (e.g., Resend / Postmark):
async function sendBdhtEmail(opts: {
  to: string;
  subject: string;
  htmlTemplate: string;
  textTemplate: string;
  vars: Record<string, string>;
}) {
  const defaults = {
    logo_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/brand/email/email-logo-dark@2x.png',
    app_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/',
    garage_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage',
    manage_billing_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage',
    support_email: Deno.env.get('BDHT_SUPPORT_EMAIL') ?? 'support@example.com',
  };
  const merged = { ...defaults, ...opts.vars };
  const subject = renderEmail(opts.subject, merged);
  const html = renderEmail(opts.htmlTemplate, merged);
  const text = renderEmail(opts.textTemplate, merged);

  // POST { from, to: opts.to, subject, html, text } to your chosen provider endpoint
}
```
