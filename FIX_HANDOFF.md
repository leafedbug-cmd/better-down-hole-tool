# Bug-fix handoff for Grok

These changes address the nine issues from the code review. Source changes and
regression tests are committed to main. Pushing source does not apply Supabase
migrations or deploy Edge Functions.

## Changes

1. **Shared-link HTML injection:** added `js/config.mjs` to validate configuration
   shapes, IDs, selections, and quantities. Quantities are integers from 0 to 9999;
   invalid values default to 1. The summary also escapes quantity attributes.
   Drill/pipe/roadmap combinations must match the catalog.
2. **Billing CORS:** Checkout and Portal return bodyless OPTIONS responses. The
   shared JSON helper also handles status 204 without a body.
3. **Duplicate checkout:** Checkout takes a company lease, checks current Stripe
   subscriptions, reuses open sessions, and persists an attempt UUID for Stripe's
   idempotency key. Retries recover sessions after a database-save failure.
   Expired sessions can be replaced. Existing duplicate subscriptions are not
   automatically canceled or refunded.
4. **Stale subscription events:** subscription events retrieve current Stripe
   state while holding a company lease shared with Checkout. Historical snapshots
   cannot overwrite newer subscription state. Invoice events also check the
   current latest invoice and retrieve its current status.
5. **Lost webhook retries:** event rows distinguish in-progress and completed
   work. Concurrent deliveries return a retryable response. Failed work releases
   its claim; abandoned claims can be reclaimed after 15 minutes. Completion is
   recorded only after the billing writes succeed. Claim tokens prevent an old
   worker from releasing a replacement worker's claim or lease.
6. **Operator cap race:** the trigger locks the destination company before
   counting operators. It also checks changes to `company_id`, preventing transfers
   from bypassing the cap. Existing operators above the cap are retained.
7. **Incorrect completion labels:** a missing terminal tool is now `blocked` and
   shown as needing changes. It does not count as ready or trigger the completion
   toast. Incomplete drafts can still be saved and reviewed.
8. **Navigation races:** async route views discard stale responses. Builder
   configuration is assigned only after its roadmap has loaded for the current
   navigation. URL replacements also update the leave-guard's current hash.
9. **Printed quantities:** added quantity labels visible in print/PDF output.

The compatibility engine moved into `js/compatibility.mjs` so tests can exercise
the actual engine independently of DOM rendering. Manufacturer connection data
was not guessed or changed.

## Required backend deployment

1. Apply `supabase/migrations/20261106000000_bdht_billing_reliability.sql` to the
   existing project **before** deploying these functions. It adds private billing
   lock/checkout-attempt tables, recoverable event claims, and the operator trigger
   replacement. The original billing migration must already be applied.
2. Deploy `bdht-create-checkout`, `bdht-create-portal`, and `bdht-stripe-webhook`,
   including their `_shared` dependencies. Keep the existing gateway JWT settings
   in `supabase/config.toml`.
3. The restricted Stripe key must allow listing/retrieving Checkout Sessions and
   Subscriptions, in addition to the permissions already described in README.
   No new secrets are required.
4. Verify owner sign-in, OPTIONS requests, session reuse, successful payment,
   webhook delivery/retries, cancellation, and operator insertion on the deployed
   project. No live charges were made for this change.

Company leases and event claims expire after 15 minutes if a worker is terminated.
Stripe receives a failure while work is busy and can retry. Lease release normally
happens immediately. Do not run the old and new webhook implementations
concurrently during deployment: the old implementation does not honor leases.
Existing event rows are migrated as completed, matching their previous meaning.
Any events already stranded by the old handler need manual investigation before
selectively resetting their completion state and replaying them.

## Validation performed

Tested with Node 24.13.0 and Deno 2.9.6:

```sh
node --check js/app.js
node --test js/*.test.mjs supabase/tests/edge-functions.test.mjs
npx --yes deno check supabase/functions/bdht-create-checkout/index.ts supabase/functions/bdht-create-portal/index.ts supabase/functions/bdht-stripe-webhook/index.ts
npx --yes deno run supabase/functions/_shared/entitlement.test.ts
npx --yes deno test --allow-read --allow-env supabase/tests/billing-reliability.test.ts
```

- Node regression tests execute the actual frontend and Edge handlers with
  isolated DOM, Stripe, and database boundaries. The Edge tests use Node's
  `stripTypeScriptTypes` API (Node 22.13+).
- Both migrations execute successfully against an in-memory PostgreSQL engine
  (PGlite), with checks for limits, company transfers, lock ownership, expired
  claims, completed duplicates, and authenticated-role permission restrictions.
- All 136 roadmaps and their option/accessory references are checked. Both modes
  are exercised for all roadmaps, for 272 smoke paths.
- Physical multi-connection PostgreSQL contention, deployed account RLS/RPCs,
  browser/device rendering, and live Stripe payments were not tested. The original
  account-schema migrations/RPC definitions are absent from this repository.

## Catalog follow-up

Thirteen first-choice smoke paths still have no compatible terminal tool in the
current data. They now display an incomplete state correctly. Verify the catalog
against manufacturer references before changing connections or available parts:

| Roadmap | Mode |
| --- | --- |
| 5427 | Backreamer |
| 5609 | Backreamer |
| 5621 | Backreamer |
| 5818 | Backreamer |
| 6088 | Bit |
| 6803 | Backreamer |
| 6804 | Backreamer |
| 6805 | Backreamer |
| 6821 | Backreamer |
| 6842 | Bit and Backreamer |
| 6970 | Bit and Backreamer |
