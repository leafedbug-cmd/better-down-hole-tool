/**
 * Source definitions for all 18 BDHT email templates + 5 Supabase Auth Go-template variants.
 * Voice: plain, short, jobsite-practical (like a good dealer parts counter).
 * Rules:
 *  - Call them "machines", never "operators".
 *  - Free plan includes 3 machines per company.
 *  - Paid plan: "The Better Down Hole Tool — Unlimited" at $2.99/month USD.
 *  - No emoji in subject lines. No exclamation-mark spam. No OEM trademarks.
 */

// This Supabase project serves more than one app. Keep ConfirmationURL for
// requests that did not come from the loadout builder's recovery callback.
const bdhtRecoveryRequest = '{{ if or (eq .RedirectTo "https://thebetterdownholetool.com/?auth=reset") (eq .RedirectTo "https://leafedbug-cmd.github.io/better-down-hole-tool/?auth=reset") (eq .RedirectTo "http://localhost:8765/?auth=reset") (eq .RedirectTo "http://127.0.0.1:8765/?auth=reset") }}';
const recoveryUrl = (separator) => `${bdhtRecoveryRequest}{{ .RedirectTo }}${separator}token_hash={{ .TokenHash }}{{ else }}{{ .ConfirmationURL }}{{ end }}`;

export const SAMPLE_DATA = {
  logo_url: '../../brand/email/email-logo-dark@2x.png',
  app_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/',
  garage_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage',
  manage_billing_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage',
  account_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/account',
  support_email: 'support@example.com',
  unsubscribe_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/garage',
  first_name: 'Jake',
  employee_name: 'Jake Mercer',
  user_email: 'jake@ozarkboring.example',
  new_email: 'j.mercer@ozarkboring.example',
  old_email: 'jake@ozarkboring.example',
  company_name: 'Ozark Boring LLC',
  company_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  invite_code: 'OZRK7429',
  invited_by: 'Cole Harlan',
  confirmation_url: 'https://rdyhhszmfpomixaoehgy.supabase.co/auth/v1/verify?token=pkce_sample_token&type=signup',
  magic_link_url: 'https://rdyhhszmfpomixaoehgy.supabase.co/auth/v1/verify?token=pkce_sample_magic&type=magiclink',
  reset_password_url: 'https://thebetterdownholetool.com/?auth=reset&token_hash=sample_recovery',
  invite_url: 'https://leafedbug-cmd.github.io/better-down-hole-tool/#/account',
  email_change_url: 'https://rdyhhszmfpomixaoehgy.supabase.co/auth/v1/verify?token=pkce_sample_email_change&type=email_change',
  otp_code: '482910',
  machine_count: '3',
  free_machine_limit: '3',
  plan_name: 'The Better Down Hole Tool — Unlimited',
  amount: '$2.99',
  currency: 'USD',
  billing_interval: 'month',
  renewal_date: 'Dec 20, 2026',
  period_end: 'Dec 20, 2026',
  payment_date: 'Nov 20, 2026',
  card_brand: 'Visa',
  card_last4: '4242',
  card_exp_month: '12',
  card_exp_year: '2026',
  invoice_id: 'in_1UYXlp5HCaoEY4se99201',
  charge_id: 'ch_3UYXlp5HCaoEY4se00184',
  dispute_id: 'dp_1UYXlp5HCaoEY4se77120',
  dispute_reason: 'unrecognized',
  dispute_due_date: 'Nov 29, 2026',
  fraud_warning_id: 'issfr_1UYXlp5HCaoEY4se44109',
  fraud_type: 'made_with_stolen_card',
  refund_amount: '$2.99',
  refund_date: 'Nov 20, 2026',
  stripe_dashboard_url: 'https://dashboard.stripe.com/payments',
};

export const TEMPLATES = [
  // =========================================================================
  // 1-5: ACCOUNT (SUPABASE AUTH)
  // =========================================================================
  {
    id: 1,
    slug: '01-confirm-email',
    supabaseSlug: '01-confirm-signup',
    category: 'Account (Supabase Auth)',
    title: 'Confirm your email',
    transactional: true,
    subject: 'Confirm your email for The Better Down Hole Tool',
    preheader: 'Tap the link inside to confirm your email and finish setting up your company.',
    variables: ['first_name', 'user_email', 'confirmation_url', 'otp_code', 'app_url', 'support_email'],
    supabaseVariables: ['{{ .ConfirmationURL }}', '{{ .Token }}', '{{ .TokenHash }}', '{{ .SiteURL }}', '{{ .Email }}', '{{ .Data.employee_name }}'],
    kicker: 'Account setup',
    heading: 'Confirm your email address',
    ctaLabel: 'Confirm email',
    ctaUrlVar: 'confirmation_url',
    supabaseCtaUrl: '{{ .ConfirmationURL }}',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Use the button below to confirm <strong>{{user_email}}</strong> and finish setting up your crew account on The Better Down Hole Tool.</p>
      <p>Once confirmed, sign in to add your company and save loadouts on up to 3 machines for free.</p>
    `,
    supabaseBodyHtml: `
      <p>Hello{{ if .Data.employee_name }} {{ .Data.employee_name }}{{ end }},</p>
      <p>Use the button below to confirm <strong>{{ .Email }}</strong> and finish setting up your crew account on The Better Down Hole Tool.</p>
      <p>Once confirmed, sign in to add your company and save loadouts on up to 3 machines for free.</p>
    `,
    details: [
      ['Account email', '{{user_email}}', '{{ .Email }}'],
      ['One-time code (if prompted)', '{{otp_code}}', '{{ .Token }}'],
    ],
    footnoteHtml: `If you did not create an account on The Better Down Hole Tool, you can ignore this email.`,
    bodyText: `Hello {{first_name}},

Confirm {{user_email}} to finish setting up your crew account on The Better Down Hole Tool:

{{confirmation_url}}

One-time code (if prompted): {{otp_code}}

Once confirmed, sign in to add your company and save loadouts on up to 3 machines for free.

If you did not create an account, you can ignore this email.`,
    supabaseBodyText: `Hello{{ if .Data.employee_name }} {{ .Data.employee_name }}{{ end }},

Confirm {{ .Email }} to finish setting up your crew account on The Better Down Hole Tool:

{{ .ConfirmationURL }}

One-time code (if prompted): {{ .Token }}

Once confirmed, sign in to add your company and save loadouts on up to 3 machines for free.

If you did not create an account, you can ignore this email.`,
  },

  {
    id: 2,
    slug: '02-magic-link',
    supabaseSlug: '02-magic-link',
    category: 'Account (Supabase Auth)',
    title: 'Magic link sign-in',
    transactional: true,
    subject: 'Your sign-in link for The Better Down Hole Tool',
    preheader: 'Use this single-use link to open My rigs.',
    variables: ['user_email', 'magic_link_url', 'otp_code', 'app_url', 'support_email'],
    supabaseVariables: ['{{ .ConfirmationURL }}', '{{ .Token }}', '{{ .TokenHash }}', '{{ .SiteURL }}', '{{ .Email }}'],
    kicker: 'Sign in',
    heading: 'Sign in to My rigs',
    ctaLabel: 'Sign in to BDHT',
    ctaUrlVar: 'magic_link_url',
    supabaseCtaUrl: '{{ .ConfirmationURL }}',
    bodyHtml: `
      <p>Tap the button below to sign in to The Better Down Hole Tool as <strong>{{user_email}}</strong>.</p>
      <p>This link works once and expires shortly.</p>
    `,
    supabaseBodyHtml: `
      <p>Tap the button below to sign in to The Better Down Hole Tool as <strong>{{ .Email }}</strong>.</p>
      <p>This link works once and expires shortly.</p>
    `,
    details: [
      ['Account', '{{user_email}}', '{{ .Email }}'],
      ['One-time code', '{{otp_code}}', '{{ .Token }}'],
    ],
    footnoteHtml: `If you did not request this sign-in link, you can safely ignore this message.`,
    bodyText: `Sign in to The Better Down Hole Tool as {{user_email}}:

{{magic_link_url}}

One-time code: {{otp_code}}

This link works once and expires shortly. If you did not request it, ignore this email.`,
    supabaseBodyText: `Sign in to The Better Down Hole Tool as {{ .Email }}:

{{ .ConfirmationURL }}

One-time code: {{ .Token }}

This link works once and expires shortly. If you did not request it, ignore this email.`,
  },

  {
    id: 3,
    slug: '03-reset-password',
    supabaseSlug: '03-reset-password',
    category: 'Account (Supabase Auth)',
    title: 'Reset password',
    transactional: true,
    subject: 'Reset your password for The Better Down Hole Tool',
    preheader: 'Follow this link to set a new 8+ character password.',
    variables: ['user_email', 'reset_password_url', 'app_url', 'support_email'],
    supabaseVariables: ['{{ .RedirectTo }}', '{{ .TokenHash }}', '{{ .ConfirmationURL }}', '{{ .SiteURL }}', '{{ .Email }}'],
    kicker: 'Password reset',
    heading: 'Set a new password',
    ctaLabel: 'Reset password',
    ctaUrlVar: 'reset_password_url',
    supabaseCtaUrl: recoveryUrl('&amp;'),
    bodyHtml: `
      <p>We received a request to reset the password for <strong>{{user_email}}</strong>.</p>
      <p>Use the button below to choose a new password (at least 8 characters).</p>
    `,
    supabaseBodyHtml: `
      <p>We received a request to reset the password for <strong>{{ .Email }}</strong>.</p>
      <p>Use the button below to choose a new password (at least 8 characters).</p>
    `,
    details: [
      ['Account', '{{user_email}}', '{{ .Email }}'],
    ],
    footnoteHtml: `If you did not ask to reset your password, leave this email alone. Your current password will keep working.`,
    bodyText: `We received a request to reset the password for {{user_email}} on The Better Down Hole Tool.

Set a new password (8+ characters):
{{reset_password_url}}

If you did not ask to reset your password, ignore this email. Your current password will keep working.`,
    supabaseBodyText: `We received a request to reset the password for {{ .Email }} on The Better Down Hole Tool.

Set a new password (8+ characters):
${recoveryUrl('&')}

If you did not ask to reset your password, ignore this email. Your current password will keep working.`,
  },

  {
    id: 4,
    slug: '04-invite-crew-member',
    supabaseSlug: '04-invite-user',
    category: 'Account (Supabase Auth)',
    title: 'Invite a crew member to a company',
    transactional: true,
    subject: 'Join {{company_name}} on The Better Down Hole Tool',
    supabaseSubject: 'You have been invited to The Better Down Hole Tool',
    preheader: 'Use your company invite code to open shared machines and loadouts.',
    variables: ['company_name', 'invited_by', 'invite_code', 'invite_url', 'user_email', 'app_url', 'support_email'],
    supabaseVariables: ['{{ .ConfirmationURL }}', '{{ .Token }}', '{{ .SiteURL }}', '{{ .Email }}', '{{ .Data.company_name }}', '{{ .Data.invite_code }}'],
    kicker: 'Crew invite',
    heading: 'Join your crew on BDHT',
    ctaLabel: 'Accept invite & join crew',
    ctaUrlVar: 'invite_url',
    supabaseCtaUrl: '{{ .ConfirmationURL }}',
    bodyHtml: `
      <p><strong>{{invited_by}}</strong> invited you to join <strong>{{company_name}}</strong> on The Better Down Hole Tool.</p>
      <p>Once you join, you can view and build named drill-string loadouts for your company's machines.</p>
      <p>If prompted during signup, pick <strong>Join my company</strong> and enter the invite code below.</p>
    `,
    supabaseBodyHtml: `
      <p>You have been invited to join your crew{{ if .Data.company_name }} at <strong>{{ .Data.company_name }}</strong>{{ end }} on The Better Down Hole Tool.</p>
      <p>Tap the button below to set your password and open your company's machines and saved loadouts.</p>
    `,
    details: [
      ['Company', '{{company_name}}', '{{ if .Data.company_name }}{{ .Data.company_name }}{{ else }}Your company{{ end }}'],
      ['Crew invite code', '{{invite_code}}', '{{ if .Data.invite_code }}{{ .Data.invite_code }}{{ else }}Ask your account owner{{ end }}'],
      ['Invited email', '{{user_email}}', '{{ .Email }}'],
    ],
    footnoteHtml: `Anyone can also build and share a loadout as a guest without an account.`,
    bodyText: `{{invited_by}} invited you to join {{company_name}} on The Better Down Hole Tool.

Open the app and sign up:
{{invite_url}}

When prompted, choose "Join my company" and enter this crew invite code:
{{invite_code}}

Once you join, you can open and edit drill-string loadouts for your company's machines.`,
    supabaseBodyText: `You have been invited to join your crew{{ if .Data.company_name }} at {{ .Data.company_name }}{{ end }} on The Better Down Hole Tool.

Accept the invite and set up your login:
{{ .ConfirmationURL }}

Invited email: {{ .Email }}
{{ if .Data.invite_code }}Crew invite code: {{ .Data.invite_code }}{{ end }}`,
  },

  {
    id: 5,
    slug: '05-email-change',
    supabaseSlug: '05-change-email',
    category: 'Account (Supabase Auth)',
    title: 'Email address change confirmation',
    transactional: true,
    subject: 'Confirm your new email address for The Better Down Hole Tool',
    preheader: 'Confirm this change to update your sign-in email.',
    variables: ['first_name', 'old_email', 'new_email', 'email_change_url', 'otp_code', 'app_url', 'support_email'],
    supabaseVariables: ['{{ .ConfirmationURL }}', '{{ .Token }}', '{{ .TokenHash }}', '{{ .SiteURL }}', '{{ .Email }}', '{{ .NewEmail }}'],
    kicker: 'Account security',
    heading: 'Confirm your email change',
    ctaLabel: 'Confirm new email',
    ctaUrlVar: 'email_change_url',
    supabaseCtaUrl: '{{ .ConfirmationURL }}',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>We received a request to change your sign-in email from <strong>{{old_email}}</strong> to <strong>{{new_email}}</strong>.</p>
      <p>Tap the button below to confirm the new address.</p>
    `,
    supabaseBodyHtml: `
      <p>We received a request to change your sign-in email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.</p>
      <p>Tap the button below to confirm the new address.</p>
    `,
    details: [
      ['Current email', '{{old_email}}', '{{ .Email }}'],
      ['New email', '{{new_email}}', '{{ .NewEmail }}'],
      ['Confirmation code', '{{otp_code}}', '{{ .Token }}'],
    ],
    footnoteHtml: `If you did not request this change, do not click the button and contact support at {{support_email}}.`,
    bodyText: `Hello {{first_name}},

Confirm changing your sign-in email on The Better Down Hole Tool from {{old_email}} to {{new_email}}:

{{email_change_url}}

Confirmation code: {{otp_code}}

If you did not request this change, do not open the link and contact {{support_email}}.`,
    supabaseBodyText: `Confirm changing your sign-in email on The Better Down Hole Tool from {{ .Email }} to {{ .NewEmail }}:

{{ .ConfirmationURL }}

Confirmation code: {{ .Token }}

If you did not request this change, do not open the link.`,
  },

  // =========================================================================
  // 6-16: SUBSCRIPTION & BILLING (APP MESSAGES)
  // =========================================================================
  {
    id: 6,
    slug: '06-welcome-company-created',
    category: 'Subscription & Billing',
    title: 'Welcome / company created (Free plan)',
    transactional: false,
    subject: '{{company_name}} is set up on The Better Down Hole Tool',
    preheader: 'Your free crew account includes up to 3 machines and your crew invite code.',
    variables: ['first_name', 'company_name', 'invite_code', 'free_machine_limit', 'garage_url', 'app_url', 'support_email', 'unsubscribe_url'],
    kicker: 'Crew account ready',
    heading: '{{company_name}} is ready',
    ctaLabel: 'Open My rigs',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Your company account for <strong>{{company_name}}</strong> is set up on the Free plan, which includes up to <strong>{{free_machine_limit}} machines</strong> and named loadouts for each rig.</p>
      <p><strong>How to set up your first rig:</strong></p>
      <ol style="margin:0 0 16px 0;padding-left:20px;color:#07090d;">
        <li style="margin-bottom:6px;">Open <strong>My rigs</strong> and tap <strong>+ Add machine</strong> (or pick a machine you added at signup).</li>
        <li style="margin-bottom:6px;">Tap <strong>+ New loadout</strong>, lock the drill pipe, and equip each slot from the rig out to the bit or backreamer.</li>
        <li style="margin-bottom:0;">Save the preset (for example, <em>Rock setup</em> or <em>Sand pilot</em>) so everyone at {{company_name}} can pull the exact part numbers.</li>
      </ol>
      <p>Share the invite code below with coworkers so they can pick <strong>Join my company</strong> when they sign up.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Current plan', 'Free (up to {{free_machine_limit}} machines)'],
      ['Crew invite code', '{{invite_code}}'],
      ['Upgrade option', 'The Better Down Hole Tool — Unlimited ($2.99/month)'],
    ],
    footnoteHtml: `Need more than {{free_machine_limit}} machines later? The company owner can upgrade to Unlimited for $2.99/month from My rigs.`,
    bodyText: `Hello {{first_name}},

{{company_name}} is set up on The Better Down Hole Tool.

Your Free plan includes up to {{free_machine_limit}} machines.

How to set up your first rig:
1. Open My rigs ({{garage_url}}) and add a machine.
2. Tap "+ New loadout", lock the drill pipe, and equip each slot from the rig out to the bit or backreamer.
3. Save the preset so your whole crew can pull the part numbers.

Crew invite code: {{invite_code}}
(Coworkers choose "Join my company" at signup and enter that code.)

Need more than {{free_machine_limit}} machines later? The company owner can upgrade to The Better Down Hole Tool — Unlimited for $2.99/month in My rigs.`,
  },

  {
    id: 7,
    slug: '07-free-limit-reached',
    category: 'Subscription & Billing',
    title: 'Hit the free limit (3 machines)',
    transactional: false,
    subject: '{{company_name}} is at the 3-machine free limit',
    preheader: 'Upgrade to The Better Down Hole Tool — Unlimited for $2.99/month to add more machines.',
    variables: ['first_name', 'company_name', 'machine_count', 'free_machine_limit', 'plan_name', 'amount', 'garage_url', 'app_url', 'support_email', 'unsubscribe_url'],
    kicker: 'Plan limit reached',
    heading: '3 of 3 free machines saved',
    ctaLabel: 'Upgrade in My rigs · $2.99/mo',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Someone at <strong>{{company_name}}</strong> tried to add a 4th machine. The Free plan includes up to <strong>{{free_machine_limit}} machines</strong>, and your existing {{machine_count}} machines and loadouts are still saved and ready to use.</p>
      <p>To add a 4th machine—or as many rigs as your crew runs—upgrade to <strong>{{plan_name}}</strong> for <strong>{{amount}}/month</strong> USD.</p>
      <p>Open <strong>My rigs</strong> and tap <strong>Upgrade · $2.99/mo</strong> to check out through Stripe. Unlimited machines turn on as soon as Stripe confirms the payment.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Machines saved', '{{machine_count}} of {{free_machine_limit}} (Free limit)'],
      ['Unlimited plan', '{{plan_name}} ({{amount}}/month USD)'],
    ],
    footnoteHtml: `Only the company owner can start or change billing. Cancel anytime at the end of the billing period through Manage billing.`,
    bodyText: `Hello {{first_name}},

{{company_name}} is at the 3-machine limit on the Free plan ({{machine_count}} of {{free_machine_limit}} machines saved). Your existing machines and loadouts are untouched.

To add more machines, upgrade to {{plan_name}} for {{amount}}/month USD:
{{garage_url}}

Only the company owner can start checkout. Unlimited machines turn on as soon as Stripe confirms the payment.`,
  },

  {
    id: 8,
    slug: '08-unlimited-active',
    category: 'Subscription & Billing',
    title: 'Unlimited is active',
    transactional: true,
    subject: 'Unlimited machines are active for {{company_name}}',
    preheader: 'Stripe confirmed your subscription. The 3-machine cap is removed.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'renewal_date', 'garage_url', 'manage_billing_url', 'app_url', 'support_email'],
    kicker: 'Subscription active',
    heading: 'Unlimited machines are on',
    ctaLabel: 'Open My rigs',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Stripe confirmed the subscription for <strong>{{company_name}}</strong>. Your crew is now on <strong>{{plan_name}}</strong>.</p>
      <p><strong>What changed:</strong></p>
      <ul style="margin:0 0 16px 0;padding-left:20px;color:#07090d;">
        <li style="margin-bottom:6px;">The 3-machine cap is removed for your whole company.</li>
        <li style="margin-bottom:6px;">Every crew member at {{company_name}} can add machines and save loadouts on them.</li>
        <li style="margin-bottom:0;">You can update your card, download invoices, or cancel at period end anytime using the <strong>Manage billing</strong> button in My rigs.</li>
      </ul>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Plan', '{{plan_name}}'],
      ['Rate', '{{amount}}/month USD'],
      ['Next renewal date', '{{renewal_date}}'],
    ],
    footnoteHtml: `To manage your payment method or view invoices, open <a href="{{manage_billing_url}}" style="color:#07090d;font-weight:700;">My rigs</a> and select <strong>Manage billing</strong>.`,
    bodyText: `Hello {{first_name}},

Stripe confirmed the subscription for {{company_name}}. Your company is now on {{plan_name}} ({{amount}}/month USD).

What changed:
- The 3-machine cap is removed for your whole company.
- Crew members at {{company_name}} can add machines and save loadouts on them.
- Next renewal date: {{renewal_date}}.

Open My rigs: {{garage_url}}
To update your card, view invoices, or cancel at period end, use the "Manage billing" button in My rigs ({{manage_billing_url}}).`,
  },

  {
    id: 9,
    slug: '09-payment-failed',
    category: 'Subscription & Billing',
    title: 'Payment failed, action needed',
    transactional: true,
    subject: 'Payment failed for {{company_name}} on The Better Down Hole Tool',
    preheader: 'Update your card in Manage billing. Existing machines stay saved; new machines are capped at 3.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'card_brand', 'card_last4', 'manage_billing_url', 'garage_url', 'app_url', 'support_email'],
    kicker: 'Action needed · Billing',
    heading: 'We could not process your {{amount}} payment',
    ctaLabel: 'Open Manage billing',
    ctaUrlVar: 'manage_billing_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>The monthly renewal charge of <strong>{{amount}}</strong> for <strong>{{company_name}}</strong> ({{card_brand}} ending in <strong>{{card_last4}}</strong>) did not go through.</p>
      <p><strong>What this means for your crew right now:</strong></p>
      <ul style="margin:0 0 16px 0;padding-left:20px;color:#07090d;">
        <li style="margin-bottom:6px;"><strong>Existing machines are kept.</strong> Every machine and loadout already saved in My rigs stays intact.</li>
        <li style="margin-bottom:6px;"><strong>New machines are capped at 3</strong> while the subscription is past due.</li>
        <li style="margin-bottom:0;">To restore unlimited machine creation, open <strong>My rigs</strong>, tap <strong>Manage billing</strong>, and update the card on file.</li>
      </ul>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Plan', '{{plan_name}}'],
      ['Amount due', '{{amount}} USD'],
      ['Card tried', '{{card_brand}} •••• {{card_last4}}'],
      ['Current machine limit', 'Capped at 3 for new machines (existing machines kept)'],
    ],
    footnoteHtml: `Once the payment succeeds in Stripe, Unlimited access turns back on automatically.`,
    bodyText: `Hello {{first_name}},

The monthly charge of {{amount}} USD for {{company_name}} ({{card_brand}} ending in {{card_last4}}) failed.

What this means right now:
- Existing machines and loadouts already saved in My rigs are kept.
- New machines are capped at 3 until billing is active again.

To update your card, open My rigs and click "Manage billing":
{{manage_billing_url}}

Unlimited machine creation turns back on as soon as Stripe confirms the payment.`,
  },

  {
    id: 10,
    slug: '10-payment-recovered',
    category: 'Subscription & Billing',
    title: 'Payment recovered / plan restored',
    transactional: true,
    subject: 'Payment received — Unlimited is restored for {{company_name}}',
    preheader: 'Your subscription is active again and the 3-machine cap is lifted.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'renewal_date', 'garage_url', 'manage_billing_url', 'app_url', 'support_email'],
    kicker: 'Plan restored',
    heading: 'Payment confirmed — Unlimited is back on',
    ctaLabel: 'Open My rigs',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Stripe processed the <strong>{{amount}}</strong> payment for <strong>{{company_name}}</strong>. Your <strong>{{plan_name}}</strong> subscription is active again.</p>
      <p>The past-due notice in My rigs has been cleared, and your crew can add new machines without the 3-machine cap.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Plan status', 'Active · Unlimited machines'],
      ['Amount paid', '{{amount}} USD'],
      ['Next renewal date', '{{renewal_date}}'],
    ],
    footnoteHtml: `Invoices and payment methods can be reviewed anytime via <strong>Manage billing</strong> in <a href="{{manage_billing_url}}" style="color:#07090d;font-weight:700;">My rigs</a>.`,
    bodyText: `Hello {{first_name}},

Stripe confirmed the {{amount}} USD payment for {{company_name}}.

{{plan_name}} is active again, and the 3-machine cap is removed.
Next renewal date: {{renewal_date}}.

Open My rigs: {{garage_url}}`,
  },

  {
    id: 11,
    slug: '11-renewal-reminder',
    category: 'Subscription & Billing',
    title: 'Renewal reminder',
    transactional: false,
    subject: 'Upcoming {{amount}} renewal for {{company_name}} on {{renewal_date}}',
    preheader: 'Your Unlimited plan renews on {{renewal_date}}.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'renewal_date', 'card_brand', 'card_last4', 'manage_billing_url', 'app_url', 'support_email', 'unsubscribe_url'],
    kicker: 'Renewal notice',
    heading: '{{plan_name}} renews on {{renewal_date}}',
    ctaLabel: 'Manage billing',
    ctaUrlVar: 'manage_billing_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>This is a heads-up that <strong>{{plan_name}}</strong> for <strong>{{company_name}}</strong> will renew automatically on <strong>{{renewal_date}}</strong> for <strong>{{amount}}</strong> USD.</p>
      <p>No action is needed if you want to keep Unlimited machines on for your crew. To update your card or cancel before renewal, open <strong>My rigs</strong> and select <strong>Manage billing</strong>.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Plan', '{{plan_name}}'],
      ['Renewal amount', '{{amount}} USD'],
      ['Renewal date', '{{renewal_date}}'],
      ['Payment method', '{{card_brand}} •••• {{card_last4}}'],
    ],
    footnoteHtml: `If you cancel in Manage billing, your crew keeps Unlimited machines through {{renewal_date}}, then returns to the 3-machine free cap for new machines.`,
    bodyText: `Hello {{first_name}},

{{plan_name}} for {{company_name}} is scheduled to renew on {{renewal_date}} for {{amount}} USD ({{card_brand}} ending in {{card_last4}}).

No action is needed to stay on Unlimited. To update your card or cancel at period end, open My rigs and select "Manage billing":
{{manage_billing_url}}`,
  },

  {
    id: 12,
    slug: '12-card-expiring-soon',
    category: 'Subscription & Billing',
    title: 'Card expiring soon',
    transactional: true,
    subject: 'Card ending in {{card_last4}} expires soon for {{company_name}}',
    preheader: 'Update your card in Manage billing so your Unlimited plan does not lapse.',
    variables: ['first_name', 'company_name', 'plan_name', 'card_brand', 'card_last4', 'card_exp_month', 'card_exp_year', 'renewal_date', 'manage_billing_url', 'app_url', 'support_email'],
    kicker: 'Payment method notice',
    heading: 'Your {{card_brand}} card expires {{card_exp_month}}/{{card_exp_year}}',
    ctaLabel: 'Update card in Manage billing',
    ctaUrlVar: 'manage_billing_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>The <strong>{{card_brand}}</strong> card ending in <strong>{{card_last4}}</strong> on file for <strong>{{company_name}}</strong> expires at the end of <strong>{{card_exp_month}}/{{card_exp_year}}</strong>.</p>
      <p>To avoid an interrupted renewal on <strong>{{renewal_date}}</strong>, open <strong>My rigs</strong>, tap <strong>Manage billing</strong>, and save your updated card details in the Stripe Customer Portal.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Expiring card', '{{card_brand}} •••• {{card_last4}} (exp. {{card_exp_month}}/{{card_exp_year}})'],
      ['Next renewal date', '{{renewal_date}}'],
    ],
    footnoteHtml: `Even if a renewal fails, your existing saved machines are never deleted—only adding new machines above 3 is paused until the card is updated.`,
    bodyText: `Hello {{first_name}},

The {{card_brand}} card ending in {{card_last4}} on file for {{company_name}} expires {{card_exp_month}}/{{card_exp_year}}.

Update your card before the next renewal ({{renewal_date}}) via "Manage billing" in My rigs:
{{manage_billing_url}}`,
  },

  {
    id: 13,
    slug: '13-cancellation-scheduled',
    category: 'Subscription & Billing',
    title: 'Cancellation scheduled',
    transactional: true,
    subject: 'Cancellation scheduled for {{company_name}} on {{period_end}}',
    preheader: 'Unlimited machines remain active until {{period_end}}.',
    variables: ['first_name', 'company_name', 'plan_name', 'period_end', 'machine_count', 'manage_billing_url', 'garage_url', 'app_url', 'support_email'],
    kicker: 'Subscription update',
    heading: 'Unlimited ends on {{period_end}}',
    ctaLabel: 'Manage billing',
    ctaUrlVar: 'manage_billing_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>As requested, <strong>{{plan_name}}</strong> for <strong>{{company_name}}</strong> is set to cancel at the end of your current billing period on <strong>{{period_end}}</strong>. You will not be charged again.</p>
      <p><strong>What happens next:</strong></p>
      <ul style="margin:0 0 16px 0;padding-left:20px;color:#07090d;">
        <li style="margin-bottom:6px;">Your crew keeps <strong>Unlimited</strong> machine access through <strong>{{period_end}}</strong>.</li>
        <li style="margin-bottom:6px;">After {{period_end}}, your company moves back to the Free plan (capped at 3 machines for adding <strong>new</strong> machines).</li>
        <li style="margin-bottom:0;"><strong>All machines and loadouts already saved stay on your company</strong>—even if you have more than 3 saved.</li>
      </ul>
      <p>Changed your mind? You can resume the subscription before {{period_end}} in <strong>Manage billing</strong>.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Plan', '{{plan_name}}'],
      ['Unlimited access until', '{{period_end}}'],
      ['Machines currently saved', '{{machine_count}} (all kept after cancellation)'],
    ],
    footnoteHtml: `Open <a href="{{garage_url}}" style="color:#07090d;font-weight:700;">My rigs</a> anytime to view your machines or reopen <strong>Manage billing</strong>.`,
    bodyText: `Hello {{first_name}},

{{plan_name}} for {{company_name}} is scheduled to end on {{period_end}}. You will not be billed again.

What happens next:
- Unlimited machine access stays active through {{period_end}}.
- After {{period_end}}, your company drops back to the 3-machine Free cap for NEW machines.
- Every machine and loadout already saved ({{machine_count}} currently) stays on your company.

If you want to keep Unlimited on, open My rigs and select "Manage billing" before {{period_end}}:
{{manage_billing_url}}`,
  },

  {
    id: 14,
    slug: '14-plan-ended-free',
    category: 'Subscription & Billing',
    title: 'Plan ended, back on Free',
    transactional: true,
    subject: '{{company_name}} is back on the Free plan',
    preheader: 'Existing machines are kept. New machines are capped at 3 unless you resubscribe.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'machine_count', 'free_machine_limit', 'garage_url', 'app_url', 'support_email'],
    kicker: 'Plan ended',
    heading: '{{company_name}} is now on the Free plan',
    ctaLabel: 'Open My rigs',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>The <strong>{{plan_name}}</strong> subscription for <strong>{{company_name}}</strong> has ended, and your account is back on the Free plan.</p>
      <p><strong>How your account works on Free:</strong></p>
      <ul style="margin:0 0 16px 0;padding-left:20px;color:#07090d;">
        <li style="margin-bottom:6px;"><strong>All {{machine_count}} saved machines and their loadouts are still in My rigs.</strong> Your crew can keep opening, editing, and sharing loadouts on them.</li>
        <li style="margin-bottom:6px;">Adding a <strong>new</strong> machine requires fewer than {{free_machine_limit}} total machines on the company, or an active Unlimited subscription.</li>
        <li style="margin-bottom:0;">The company owner can turn Unlimited back on anytime for <strong>{{amount}}/month</strong> from My rigs.</li>
      </ul>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Current plan', 'Free ({{free_machine_limit}}-machine cap for new machines)'],
      ['Machines currently saved', '{{machine_count}} (kept intact)'],
      ['Resubscribe rate', '{{amount}}/month USD'],
    ],
    footnoteHtml: `Remember: starting Checkout again unlocks Unlimited as soon as Stripe confirms the payment.`,
    bodyText: `Hello {{first_name}},

The {{plan_name}} subscription for {{company_name}} has ended, and your company is back on the Free plan.

How your account works now:
- All {{machine_count}} machines and loadouts already saved stay in My rigs.
- New machines are capped at {{free_machine_limit}} unless you resubscribe.
- To turn Unlimited back on ({{amount}}/month USD), open My rigs and choose Upgrade:
{{garage_url}}`,
  },

  {
    id: 15,
    slug: '15-refund-issued',
    category: 'Subscription & Billing',
    title: 'Refund issued',
    transactional: true,
    subject: 'Refund of {{refund_amount}} issued for {{company_name}}',
    preheader: 'We processed a {{refund_amount}} refund to your {{card_brand}} ending in {{card_last4}}.',
    variables: ['first_name', 'company_name', 'refund_amount', 'refund_date', 'card_brand', 'card_last4', 'charge_id', 'garage_url', 'manage_billing_url', 'app_url', 'support_email'],
    kicker: 'Refund confirmation',
    heading: '{{refund_amount}} refund issued',
    ctaLabel: 'Open My rigs',
    ctaUrlVar: 'garage_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>A refund of <strong>{{refund_amount}}</strong> USD has been issued for <strong>{{company_name}}</strong> back to your <strong>{{card_brand}}</strong> ending in <strong>{{card_last4}}</strong>.</p>
      <p>Most banks post refunds within 5 to 10 business days. Note that machine access in My rigs continues to follow your subscription status.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Refund amount', '{{refund_amount}} USD'],
      ['Refund date', '{{refund_date}}'],
      ['Refunded to', '{{card_brand}} •••• {{card_last4}}'],
      ['Charge reference', '{{charge_id}}'],
    ],
    footnoteHtml: `You can view your full billing history anytime via <strong>Manage billing</strong> in <a href="{{manage_billing_url}}" style="color:#07090d;font-weight:700;">My rigs</a>.`,
    bodyText: `Hello {{first_name}},

A refund of {{refund_amount}} USD was issued on {{refund_date}} for {{company_name}} to {{card_brand}} ending in {{card_last4}} (charge {{charge_id}}).

Banks typically post refunds within 5 to 10 business days. Machine access in My rigs continues to follow your subscription status.

Open My rigs: {{garage_url}}`,
  },

  {
    id: 16,
    slug: '16-payment-receipt',
    category: 'Subscription & Billing',
    title: 'Receipt / payment confirmation',
    transactional: true,
    subject: 'Payment receipt ({{amount}}) for {{company_name}}',
    preheader: 'Receipt for {{plan_name}} — {{amount}} paid on {{payment_date}}.',
    variables: ['first_name', 'company_name', 'plan_name', 'amount', 'payment_date', 'renewal_date', 'card_brand', 'card_last4', 'invoice_id', 'manage_billing_url', 'garage_url', 'app_url', 'support_email'],
    kicker: 'Payment receipt',
    heading: 'Paid {{amount}} for {{plan_name}}',
    ctaLabel: 'View invoices in Manage billing',
    ctaUrlVar: 'manage_billing_url',
    bodyHtml: `
      <p>Hello {{first_name}},</p>
      <p>Thanks for your payment. Here is the receipt for <strong>{{company_name}}</strong> on <strong>{{plan_name}}</strong>.</p>
      <p>You can download official Stripe invoice and receipt PDFs anytime from the <strong>Manage billing</strong> button in My rigs.</p>
    `,
    details: [
      ['Company', '{{company_name}}'],
      ['Description', '{{plan_name}} (Monthly subscription)'],
      ['Amount paid', '{{amount}} USD'],
      ['Date paid', '{{payment_date}}'],
      ['Payment method', '{{card_brand}} •••• {{card_last4}}'],
      ['Next renewal', '{{renewal_date}}'],
      ['Invoice ID', '{{invoice_id}}'],
    ],
    footnoteHtml: `Open <a href="{{garage_url}}" style="color:#07090d;font-weight:700;">My rigs</a> to manage machines and loadouts.`,
    bodyText: `Hello {{first_name}},

Payment receipt for {{company_name}}:

Plan: {{plan_name}}
Amount paid: {{amount}} USD
Date paid: {{payment_date}}
Payment method: {{card_brand}} ending in {{card_last4}}
Next renewal: {{renewal_date}}
Invoice ID: {{invoice_id}}

Download official PDF invoices or update billing details via "Manage billing" in My rigs:
{{manage_billing_url}}`,
  },

  // =========================================================================
  // 17-18: INTERNAL ALERTS TO OWNER / ADMIN (PLAIN & MINIMAL)
  // =========================================================================
  {
    id: 17,
    slug: '17-admin-dispute-opened',
    category: 'Internal Admin Alerts',
    title: 'Dispute opened on a charge',
    transactional: true,
    subject: '[BDHT Alert] Dispute {{dispute_id}} opened for {{company_name}}',
    preheader: 'Charge {{charge_id}} ({{amount}}) was disputed. Evidence due {{dispute_due_date}}.',
    variables: ['company_name', 'company_id', 'dispute_id', 'charge_id', 'amount', 'dispute_reason', 'dispute_due_date', 'stripe_dashboard_url', 'app_url', 'support_email'],
    kicker: 'Internal alert · Dispute',
    heading: 'Charge dispute opened',
    ctaLabel: 'Open Stripe Dashboard',
    ctaUrlVar: 'stripe_dashboard_url',
    bodyHtml: `
      <p>A dispute was received by the webhook (<code>charge.dispute.created</code>) and recorded on <code>bdht_billing.open_dispute_id</code>.</p>
      <p>Review the dispute in the Stripe Dashboard before the response deadline.</p>
    `,
    details: [
      ['Company', '{{company_name}} ({{company_id}})'],
      ['Dispute ID', '{{dispute_id}}'],
      ['Charge ID', '{{charge_id}}'],
      ['Amount', '{{amount}} USD'],
      ['Reason', '{{dispute_reason}}'],
      ['Evidence due', '{{dispute_due_date}}'],
    ],
    footnoteHtml: `The dispute banner in My rigs will clear automatically when <code>charge.dispute.closed</code> arrives.`,
    bodyText: `[BDHT Internal Alert] Charge dispute opened

Company: {{company_name}} ({{company_id}})
Dispute ID: {{dispute_id}}
Charge ID: {{charge_id}}
Amount: {{amount}} USD
Reason: {{dispute_reason}}
Evidence due: {{dispute_due_date}}

Review in Stripe Dashboard:
{{stripe_dashboard_url}}`,
  },

  {
    id: 18,
    slug: '18-admin-fraud-warning',
    category: 'Internal Admin Alerts',
    title: 'Early fraud warning on a charge',
    transactional: true,
    subject: '[BDHT Alert] Early fraud warning {{fraud_warning_id}} for {{company_name}}',
    preheader: 'Radar flagged charge {{charge_id}} ({{fraud_type}}). Review in Stripe.',
    variables: ['company_name', 'company_id', 'fraud_warning_id', 'charge_id', 'amount', 'fraud_type', 'stripe_dashboard_url', 'app_url', 'support_email'],
    kicker: 'Internal alert · Radar EFW',
    heading: 'Early fraud warning received',
    ctaLabel: 'Review in Stripe Radar',
    ctaUrlVar: 'stripe_dashboard_url',
    bodyHtml: `
      <p>The card network issued an early fraud warning (<code>radar.early_fraud_warning.created</code>), recorded on <code>bdht_billing.fraud_warning_id</code>.</p>
      <p><strong>Note:</strong> The webhook does not refund the charge or cancel the subscription automatically. Inspect the charge in Stripe Radar and refund/cancel manually if appropriate to prevent a formal dispute.</p>
    `,
    details: [
      ['Company', '{{company_name}} ({{company_id}})'],
      ['Fraud warning ID', '{{fraud_warning_id}}'],
      ['Charge ID', '{{charge_id}}'],
      ['Amount', '{{amount}} USD'],
      ['Fraud type', '{{fraud_type}}'],
    ],
    footnoteHtml: `Internal administrative notice for The Better Down Hole Tool.`,
    bodyText: `[BDHT Internal Alert] Radar early fraud warning received

Company: {{company_name}} ({{company_id}})
Fraud warning ID: {{fraud_warning_id}}
Charge ID: {{charge_id}}
Amount: {{amount}} USD
Fraud type: {{fraud_type}}

The webhook does not cancel or refund automatically. Review in Stripe Radar:
{{stripe_dashboard_url}}`,
  },
];
