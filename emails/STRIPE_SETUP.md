# Stripe Branding & Customer Email Setup — The Better Down Hole Tool

Stripe's built-in customer emails (receipts, invoices, failed-payment notices, upcoming-renewal notices, expiring-card notices, and Customer Portal magic links) do not accept custom HTML templates. Instead, Stripe renders them from your **Branding settings**, **Public business details**, and **Billing / Customer email toggles** in the Stripe Dashboard.

Apply the settings below in live mode on account `acct_1ThaUY5HCaoEY4se`.

---

## 1. Branding Settings

**Dashboard location:** [Settings → Business → Branding](https://dashboard.stripe.com/settings/branding)  
**Stripe docs reference:** [Customize your brand settings](https://docs.stripe.com/customize/branding)

### Asset Requirements (confirmed from Stripe docs)
- **File format:** PNG or JPG (SVG is not supported)
- **File size:** Less than **512 KB**
- **Dimensions:** Equal to or greater than **128px × 128px**

### What to Upload & Set

| Setting | Value / File in this Repo | Where Stripe Uses It |
| :--- | :--- | :--- |
| **Icon** | `brand/stripe/stripe-icon.png` (`512×512 px`, PNG) | Customer emails, Checkout, Payment Links, Customer Portal, Hosted Invoice Page, Invoice PDFs |
| **Logo** | `brand/stripe/stripe-logo-light.png` (`780×144 px`, PNG) | Checkout, Payment Links, Customer Portal header, Invoice PDFs *(overrides Icon where wide logos fit)* |
| **Brand color** | `#07090d` | Customer emails, Customer Portal, Hosted Invoice Page, Invoice PDFs |
| **Accent color** | `#f0b429` | Customer emails (highlight/button), Checkout primary button, Customer Portal, Hosted Invoice Page |

> **Why `#07090d` for Brand color and `#f0b429` for Accent color:** Stripe uses the Brand color for dark header accents and invoice bars, and the Accent color for primary buttons in Checkout and the Customer Portal. Stripe automatically switches button label text on `#f0b429` to dark ink for contrast.

---

## 2. Public Business Details

**Dashboard location:** [Settings → Business → Account details / Public details](https://dashboard.stripe.com/settings/public)

| Field | Value to Set |
| :--- | :--- |
| **Public business name** | `The Better Down Hole Tool` |
| **Support email** | Your live support address (corresponds to `{{support_email}}` in app templates) |
| **Support phone** | Required by Stripe if enabled on receipts/checkout |
| **Support website** | `https://leafedbug-cmd.github.io/better-down-hole-tool/` |
| **Statement descriptor** | `BDHT UNLIMITED` |
| **Shortened descriptor** | `BDHT` |

---

## 3. Built-In Stripe Customer Emails to Turn On

Stripe splits automated customer emails across two Dashboard pages: **Customer emails** (for payment receipts and refunds) and **Subscriptions and emails** (for subscription renewals, failed payments, and expiring cards).

### A. Receipts & Refunds
**Dashboard location:** [Settings → Business → Customer emails](https://dashboard.stripe.com/settings/emails)  
**Stripe docs reference:** [Customer emails / Receipts](https://docs.stripe.com/receipts)

Under **Email customers about**:
- [x] **Successful payments** — Turn **ON** (sends a receipt whenever the $2.99/month subscription charge succeeds)
- [x] **Refunds** — Turn **ON** (sends a refund confirmation whenever a charge is refunded)

### B. Subscription Lifecycle & Revenue Recovery Emails
**Dashboard location:** [Settings → Billing → Subscriptions and emails](https://dashboard.stripe.com/settings/billing/automatic) (also mirrored under [Revenue recovery](https://dashboard.stripe.com/revenue_recovery))  
**Stripe docs reference:** [Configure customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)

#### Section: *Prevent failed payments*
- [x] **Send emails about upcoming renewals** — Turn **ON**
  - Set reminder lead time to **7 days** before renewal.
  - *Note:* Stripe's built-in upcoming-renewal email is primarily sent for annual or multi-month billing intervals. If you want a reminder before a monthly renewal, send our own template `11-renewal-reminder` from the app.
- [x] **Send emails about expiring cards** — Turn **ON**
  - Automatically emails the company owner at the start of the month in which their saved card expires.
  - Set the **Link destination** to **Stripe-hosted page** (Customer Portal) so the owner can update the card immediately.

#### Section: *Manage failed payments*
- [x] **Use Smart Retries for subscriptions** — Turn **ON**
- [x] **Send emails when card payments fail** — Turn **ON**
  - Automatically emails the company owner whenever a renewal payment attempt fails.
  - Set the **Link destination** to **Stripe-hosted page** (Customer Portal) so the link opens card update controls.
- **Subscription status when all retries for a payment fail:** Select **Cancel subscription** or **Mark subscription as unpaid**.
  - Both statuses cause `bdht-stripe-webhook` to set `bdht_billing.entitled = false`, which drops the company back to the 3-machine free cap for **new** machines while keeping all machines already saved.

#### Section: *Manage invoices sent to customers*
- [ ] **Send finalized invoices and credit notes to customers** — Leave **OFF** for standard card subscriptions (the **Successful payments** receipt above already confirms payment without sending a separate "payment due" invoice email).

---

## 4. Customer Portal Configuration

**Dashboard location:** [Settings → Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)  
**Stripe docs reference:** [Configure the customer portal](https://docs.stripe.com/customer-management/configure-portal)

1. **Activate link / Save default configuration:** Click **Save** at least once so a default portal configuration exists for `bdht-create-portal`.
2. **Customer information:** Allow customers to update email and billing address.
3. **Payment methods:** Turn **ON** (required so failed-payment and expiring-card email links allow card updates).
4. **Invoice history:** Turn **ON**.
5. **Subscriptions → Cancellations:** Turn **ON**, and choose **Cancel at end of billing period**.
   - Unlimited machines remain active until `current_period_end`, after which `customer.subscription.deleted` clears `bdht_billing.entitled`.
6. **Subscriptions → Plan switching:** Leave **OFF** (there is only one paid price: `price_1UYXlp5HCaoEY4setSBdQtHh` at $2.99/month USD).
7. **Default redirect link:** `https://leafedbug-cmd.github.io/better-down-hole-tool/?billing=portal#/garage`

---

## 5. Summary Matrix: Stripe Built-In vs. BDHT App Emails

| Lifecycle Event | Stripe Built-In Email | BDHT App Template (`emails/dist/`) | Recommended Setup |
| :--- | :--- | :--- | :--- |
| Email confirmation / signup | — | `01-confirm-email` (`supabase-auth/`) | Send via Supabase Auth |
| Magic link sign-in | — | `02-magic-link` (`supabase-auth/`) | Send via Supabase Auth |
| Password reset | — | `03-reset-password` (`supabase-auth/`) | Send via Supabase Auth |
| Crew member invite | — | `04-invite-crew-member` (`supabase-auth/`) | Send via Supabase Auth or app |
| Email address change | — | `05-email-change` (`supabase-auth/`) | Send via Supabase Auth |
| Company created (Free plan) | — | `06-welcome-company-created` | Send from app after `bdht_create_company` |
| Hit 3-machine free limit | — | `07-free-limit-reached` | Optional app nudge when 4th machine is blocked |
| Unlimited activated | — | `08-unlimited-active` | Send from `bdht-stripe-webhook` when `entitled` turns `true` |
| Payment failed | **Send emails when card payments fail** | `09-payment-failed` | Turn on Stripe's email **and/or** send `09-payment-failed` on `invoice.payment_failed` to explain the 3-machine cap rule |
| Payment recovered | — | `10-payment-recovered` | Send from `bdht-stripe-webhook` when `invoice.paid` clears `payment_failed_at` |
| Upcoming renewal | **Send emails about upcoming renewals** | `11-renewal-reminder` | Turn on Stripe's toggle; use `11-renewal-reminder` if sending custom reminders |
| Card expiring soon | **Send emails about expiring cards** | `12-card-expiring-soon` | Turn on Stripe's toggle; `12-card-expiring-soon` available if handled via webhook |
| Cancellation scheduled | — | `13-cancellation-scheduled` | Send from `bdht-stripe-webhook` when `cancel_at_period_end` turns `true` |
| Plan ended (back on Free) | — | `14-plan-ended-free` | Send from `bdht-stripe-webhook` on `customer.subscription.deleted` |
| Refund issued | **Refunds** | `15-refund-issued` | Turn on Stripe's toggle or send `15-refund-issued` on `charge.refunded` |
| Payment receipt | **Successful payments** | `16-payment-receipt` | Turn on Stripe's receipt; `16-payment-receipt` ready if custom receipts are needed |
| Dispute opened (Admin alert) | Stripe Dashboard notification | `17-admin-dispute-opened` | Send to `{{admin_email}}` on `charge.dispute.created` |
| Early fraud warning (Admin) | Stripe Radar notification | `18-admin-fraud-warning` | Send to `{{admin_email}}` on `radar.early_fraud_warning.created` |
