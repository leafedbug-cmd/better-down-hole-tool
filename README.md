# The Better Down Hole Tool

Mobile-first HDD drill-string builder: pick a drill and pipe, build a compatible down hole tooling string, and share or export the parts list. Optional crew accounts save named loadouts per machine.

- Static site (plain HTML/CSS/JS, hash routing). It's served by GitHub Pages, so there's no build step.
- Part, roadmap and image data was compiled from public manufacturer catalog references. Equipment lines in the builder (Ditch Witch® and Vermeer®) are machine brands, not a dealership. Part numbers belong to the equipment manufacturer.
- Accounts: Supabase Auth plus Postgres with row-level security. Only the public (publishable) key is in this repo.
- Plans: a free company can save 3 machines. Unlimited machines are $2.99/month through Stripe Checkout. See [Stripe billing setup](#stripe-billing-setup).

See [FIX_HANDOFF.md](FIX_HANDOFF.md) for the earlier bug fixes. Sign-up on the shared Supabase project is below. Public email sign-ups stay off.

## Supplier catalog

Aftermarket HDD tooling from independent suppliers lives in `data/suppliers/`:

| File | What it holds |
| --- | --- |
| `brands.json` | Listed supplier brands (with an item count and a note when a brand has none), plus `skipped` suppliers and why |
| `connections.json` | Thread codes used by supplier parts (`status`: `existing` in a roadmap already, or `new`), and the raw thread wording that is not wired |
| `parts.json` | One row per product or table row: `url` (manufacturer product page), `pn`, `diameterIn`, `lengthIn`, `weightLb`, `rigClass`, `conn`, `specs`, `source`, `configurator`, `unverified` |

Rules for this data:

- A value is stored only if the manufacturer page states it. Everything else is `null` and named in the part's `unverified` list. Unit conversions are limited to fractions to decimals, kg to lb and ft to in, and are noted in `specs`.
- `conn.wired` is true only when the page says box or pin for the thread end. Only wired Bit, hole opener and reamer parts reach the fit solver. Everything else stays in the catalog.
- `url` is the plain product page. No affiliate tags or tracking parameters (the build fails if it finds one). Add referral links later by transforming `url` at render time, not in this data.
- No prices are stored.

How it reaches the builder: `loadRoadmap()` merges wired parts into each roadmap's Bit and Backreamer slots (`js/suppliers.mjs`). `compute()` in `js/compatibility.mjs` then shows a supplier part only when the part before it threads onto it, so the existing subs and adapters in each roadmap do the bridging. Supplier ids start at 900001 and are never reused.

Rebuild after editing the curated tables or `tools/suppliers/rows/*.json`:

```sh
node tools/suppliers_build.mjs          # writes data/suppliers/*.json
node tools/suppliers_build.mjs --check  # validates only
node --test js/*.test.mjs
```

## Account sign-up

`bdht_machines` is the equipment list: one row is one machine (a drill model plus a unit name). People are `bdht_members`. The free plan is 3 machines, then Unlimited at $2.99/month. The sign-up form and My rigs both add machines. They do not add people.

Public sign-ups are disabled for the whole Supabase project because it is shared with another app. Do not turn that setting on. `bdht-signup` creates the auth user with the service role (`auth.admin.createUser`, email already confirmed), then `bdht_provision_signup` writes the company, member, and machine rows in one transaction. The browser signs in with the password it just sent. The function does not set `app_metadata.role`, so the other app's portal trigger does not treat the new user as a portal member.

Join-my-company uses the same function. A wrong invite code deletes the auth user it just created. A free company that is already at 3 machines still gains the new member and skips the extra machines.

Abuse limits, enforced in `bdht_take_signup_attempt`: 20 attempts per IP per hour and 8 per email per day. The table stores SHA-256 hashes, not raw addresses. `verify_jwt` is false for this function because the caller has no session and the site uses a publishable key. The project API gateway still requires that key. No new secrets.

### Apply and deploy, in this order

The original billing migration `20261105211145_bdht_billing.sql` is already applied. These are not:

1. Apply `supabase/migrations/20261106000000_bdht_billing_reliability.sql`. It adds the billing lock and checkout-attempt tables, recoverable Stripe event claims, and the machine-cap trigger that locks the company row. The billing Edge Functions in this repo need those tables.
2. Apply `supabase/migrations/20261120151659_bdht_signup.sql`. It adds the signup rate-limit table, `bdht_take_signup_attempt`, `bdht_provision_signup`, and sets the cap message to “Free plan includes 3 machines. Upgrade for unlimited.” Both functions are executable only by `service_role`.
3. Deploy Edge Function `bdht-signup` with `verify_jwt = false` (`supabase/config.toml`). Upload `supabase/functions/bdht-signup/index.ts` and `supabase/functions/_shared/http.ts`, `supabase_admin.ts`, and `signup.ts`.
4. Deploy `bdht-create-checkout`, `bdht-create-portal`, and `bdht-stripe-webhook`, including their `_shared` files, after step 1. Keep `verify_jwt` as in `supabase/config.toml` (true, true, and false). Do not run the previous webhook and this webhook at the same time.

No auth setting changes. Do not deploy any of this to the FindIT project.

## Stripe billing setup

Live account `acct_1ThaUY5HCaoEY4se` (BuggedLab). Product `prod_VZhAn4095ltie4` (“The Better Down Hole Tool — Unlimited”), price `price_1UYXlp5HCaoEY4setSBdQtHh` ($2.99/month USD). The product tax code is already `txcd_10103001` (Software as a service (SaaS) - business use). See the [tax code guide](https://docs.stripe.com/tax/tax-codes.md).

Free companies can insert up to 3 rows in `bdht_machines`. A company is unlimited only when `bdht_billing.entitled` is true. The webhook sets that flag when the subscription status is `active` or `trialing` and the price is `STRIPE_PRICE_ID`. `past_due`, `unpaid`, `canceled`, `paused`, and `incomplete` keep the 3-machine cap for new machines. Machines already saved stay on the company.

Checkout is Stripe-hosted (`mode: subscription`, flexible billing mode). The browser never sees the secret key. Returning from Checkout does not unlock the plan. The webhook does.

### 1. Restricted API key

Create a restricted key in live mode: [API keys](https://dashboard.stripe.com/apikeys). Prefer `rk_live_…` over a secret key. Give it only what these functions call:

- Customers: write (create and retrieve)
- Checkout Sessions: write
- Billing Portal sessions: write
- Subscriptions: read
- Invoices: read
- Invoice Payments: read
- Charges: read

If a function returns a Stripe permission error, add the missing permission and retry. Supabase Edge Functions do not publish a stable egress IP, so leave IP restrictions off on this key or Checkout and the webhook will fail closed. Rotate the key when someone who could read it leaves. Do not commit the key.

### 2. Supabase function secrets

Dashboard: [Edge Function secrets](https://supabase.com/dashboard/project/rdyhhszmfpomixaoehgy/functions/secrets) for project `rdyhhszmfpomixaoehgy`.

Add these three. Paste the values there. They are not in this repo.

| Secret | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | The restricted key from step 1 |
| `STRIPE_WEBHOOK_SECRET` | The signing secret from the webhook endpoint in step 4 (`whsec_…`) |
| `STRIPE_PRICE_ID` | `price_1UYXlp5HCaoEY4setSBdQtHh` |

CLI equivalent, from a machine that already has the values. Do not put this line in git:

```bash
supabase secrets set --project-ref rdyhhszmfpomixaoehgy \
  STRIPE_SECRET_KEY="rk_live_…" \
  STRIPE_WEBHOOK_SECRET="whsec_…" \
  STRIPE_PRICE_ID="price_1UYXlp5HCaoEY4setSBdQtHh"
```

Secrets apply to deployed functions immediately. No redeploy is required after saving them.

`SUPABASE_URL` and the service key are already injected into Edge Functions. The functions read `SUPABASE_SECRET_KEYS` (`default`) and fall back to `SUPABASE_SERVICE_ROLE_KEY`. Neither belongs in the browser.

### 3. Customer Portal

Live mode: [Customer portal settings](https://dashboard.stripe.com/settings/billing/portal).

1. Turn the portal on and save. Saving creates the default configuration `bdht-create-portal` uses. There is no configuration on the account until this is saved.
2. Let customers update payment methods and see invoices.
3. Let customers cancel. Choose cancel at period end. Unlimited machines stay until the period ends, then the webhook clears `entitled`.
4. Leave plan switching off. There is one price.
5. Confirm the portal headline matches “The Better Down Hole Tool — Unlimited”.

### 4. Webhook endpoint

Live mode: [Webhooks](https://dashboard.stripe.com/webhooks) → Add endpoint.

- Endpoint URL: `https://rdyhhszmfpomixaoehgy.supabase.co/functions/v1/bdht-stripe-webhook`
- Events, and only these:

  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.paused`
  - `customer.subscription.resumed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `charge.dispute.created`
  - `charge.dispute.closed`
  - `charge.refunded`
  - `radar.early_fraud_warning.created`

`charge.dispute.closed` clears the dispute banner after `charge.dispute.created`. The handler checks the Stripe signature with `STRIPE_WEBHOOK_SECRET` and then writes `bdht_billing`. The gateway JWT check is off for this function (`verify_jwt = false` in `supabase/config.toml`) because Stripe does not send a Supabase JWT.

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

Do not subscribe to `invoice.created`. An endpoint that receives it and does not answer in time delays invoice finalization.

### 5. Revenue recovery

[Revenue recovery](https://dashboard.stripe.com/revenue_recovery) (Billing settings): turn on Smart Retries, failed-payment emails, and automatic card updates. When retries are exhausted, cancel the subscription or mark it unpaid. Both statuses clear unlimited machines. While the subscription is `past_due`, new machines are also capped at 3. Existing machines stay.

### 6. Tax

Do not turn on `automatic_tax` yet. The live account has no tax registrations, so Stripe would collect no tax and would not return an error. Checkout in this repo does not send `automatic_tax`.

The product tax code is already set. Head office address and registrations are still required before collection. Use [threshold monitoring](https://docs.stripe.com/tax/monitoring) (Dashboard → Tax → Locations → Needs attention) so Stripe can email when a jurisdiction may need attention. Monitoring is informational, covers live charges, and does not cover physical presence. Confirm any registration with a tax advisor. When a registration shows as collecting, then enable `automatic_tax` on Checkout and on the subscription. See [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes.md).

### What the code does

| Piece | Role |
| --- | --- |
| `supabase/migrations/20261105211145_bdht_billing.sql` | `bdht_billing`, `bdht_stripe_events`, RLS, and the insert trigger that enforces 3 machines |
| `bdht-create-checkout` | Owner-only Checkout Session. Reuses the Stripe Customer. `billing_mode.type = flexible`. No `payment_method_types` |
| `bdht-create-portal` | Owner-only Customer Portal session |
| `bdht-stripe-webhook` | Signature check, idempotency, subscription sync, invoice paid/failed, dispute, refund, early fraud warning |
| `bdht-signup` | Creates a confirmed auth user and the company, member, and machine rows without enabling public sign-ups |
| Garage | Plan banner, upgrade button, manage-billing button. The add-machine control opens Checkout at the free limit |

Success URL: `https://leafedbug-cmd.github.io/better-down-hole-tool/?billing=success&session_id={CHECKOUT_SESSION_ID}#/garage`

Cancel URL: `https://leafedbug-cmd.github.io/better-down-hole-tool/?billing=cancel#/garage`

Portal return URL: `https://leafedbug-cmd.github.io/better-down-hole-tool/?billing=portal#/garage`

Hosted Checkout is a full-page redirect, so the static site does not load Stripe.js.

### Test checklist

Schema (no card):

1. Sign in as a company owner and add machines until the garage shows `Free · 3 of 3 machines`.
2. The add control becomes “Upgrade for unlimited” and opens the upgrade sheet.
3. A member who is not the owner sees that the owner has to upgrade, and Checkout does not start.
4. Inserting a fourth `bdht_machines` row as that user returns `Free plan includes 3 machines. Upgrade for unlimited.` Existing machines are unchanged.

Checkout (live, charges $2.99):

5. Secrets from steps 1–2 are saved, the portal from step 3 is saved, and the webhook from step 4 is receiving.
6. As the owner, choose Upgrade. Stripe Checkout opens for “The Better Down Hole Tool — Unlimited” at $2.99/month. Pay with a card you can refund.
7. The return toast says Stripe still has to confirm. Within a few seconds, `bdht_billing.entitled` is true and `subscription_status` is `active`. A fourth machine saves.
8. Closing the tab on the success page still unlocks the company after the webhook. The success page is not the unlock.
9. Manage billing opens the Customer Portal. Cancel at period end. `cancel_at_period_end` becomes true and unlimited remains until `customer.subscription.deleted` or the status leaves `active`/`trialing`.
10. In the webhook event list, confirm `invoice.paid` for the first invoice. Refund that charge from the Dashboard and confirm `charge.refunded` sets `last_refunded_charge_id` on the company. Operator access still follows subscription status.

Failure and risk:

11. A declined renewal sends `invoice.payment_failed`. The garage says the last invoice failed and a new machine is capped at 3. Manage billing updates the card.
12. `charge.dispute.created` sets `open_dispute_id` and shows a banner. `charge.dispute.closed` clears it.
13. `radar.early_fraud_warning.created` sets `fraud_warning_id` and shows a banner. Review the warning in Radar. The webhook does not cancel the subscription on its own.

Local UI without a card: serve the repo and open `#/garage` signed out. The guest card should mention 3 machines and $2.99/month. `node --test js/billing.test.mjs js/signup.test.mjs` checks the client-side cap, the equipment form, and signup error copy.

