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

The production smoke-test follow-up below supersedes the roadmap dead-end list in this section.

Twelve first-choice smoke paths still have no compatible terminal tool in the
current data. They now display an incomplete state correctly. Verify the catalog
against manufacturer references before changing connections or available parts:

| Roadmap | Mode |
| --- | --- |
| 5427 | Backreamer |
| 5609 | Backreamer |
| 5621 | Backreamer |
| 5818 | Backreamer |
| 6803 | Backreamer |
| 6804 | Backreamer |
| 6805 | Backreamer |
| 6821 | Backreamer |
| 6842 | Bit and Backreamer |
| 6970 | Bit and Backreamer |

### Data corrections (`tools/fix_catalog.mjs`)

`node tools/fix_catalog.mjs` applies these to `data/roadmaps/` and is safe to re-run
(run it after any re-fetch; `js/catalog-fixes.test.mjs` fails if they are missing):

- `3.25M` → `3.25 M`, `3.44M` → `3.44 M`, `2.25-6F EZ3` → `2.25 F EZ3` (spacing/typo; parts could not mate).
- Hawkeye starter rods 918-2437 / 918-3046 / 918-3047: `350 F` / `390 F` → `Hawkeye®  350 F` / `Hawkeye®  390 F`.
- Tricones 400-2521 / 400-2315: `3.5 API M` → `3.5 M API R` (3-1/2 API Reg pin; matches the housings offered in those slots). Unblocks 6088/Bit.
- All Terrain 3.25SS pipe 355-1258: box `3.25 F` → `3.25SS F` (matches its own pin), old `3.25 F` kept as `cr2`.
- #200 Switch-Connect starter rod 400-10264 removed from the JT9 1.30-pipe roadmaps (kept on #200-pipe roadmaps).
- AT120 TCI tricones 400-3368..3371 `4.5 M API IF` → `4.5 M API R`, and their Rockmaster housings 400-10099/10101/10277/10278 `4.5 F API IF` → `4.5 F API R` (DW names say API-R; Radius 2022 catalog p.24 confirms 4-1/2 Reg).
- 400-2287 `1.63 M EZ3` → `1.63 M EZ2` (1.63 is only ever EZ2; Radius catalog pp.10-12).

Deliberately **not** changed (need a manufacturer reference):

- 908-4311 / 918-2492 starter rods on JT2720 Mach 1 have a `1.69 M` rig side; the pipe is 2.11. Radius uses 1.69-6 only for JT1720, so these are likely JT1720 parts listed on the wrong roadmap (the solver already hides them).
- 908-4233 (`#602 F`), 908-5194 (`#802 F`), 190-1396 backreamer (`3.5 API M`).
- `2.0 API IF` is Radius's `2" IF` (catalog pp.11, 14, 21), distinct from 2-3/8" IF.

### Radius alternates

`node tools/radius_catalog.mjs --pdf "<Radius catalog.pdf>"` rebuilds `data/radius/parts.json` and `crossref.json`
from the 2022 print catalog, merging product URLs/photos from `data/radius/web.json` (radiushdd.com scrape).
No prices are published. Radius photos are off (`RADIUS_IMAGES_ENABLED` in `js/radius.mjs`) until Radius grants permission.

## Production smoke-test follow-up

The seven Vermeer rigs in the smoke test now have a catalog path to an end tool.
The D7X11 pullback slots follow rig-to-tool order. D23X30, D24X26 and D33X44 can
use 2.38 API Reg connectors, D33X44 and D40X40 can use the listed 2.59 Rockmaster
reamers, and D60X90 and D80X120 use their #900 and #1000 connectors. The
2.59, 2.38 API Reg and 3.5 API IF connections remain distinct. Sources include
the [Ditch Witch HDD Parts Book](https://www.ditchwitch.com/wp-content/uploads/2025/10/HDD-Parts-Book_10_2025_JJ.pdf)
and the [Vermeer Borestore tooling catalog](https://www.vermeer.com/getmedia/faa6c533-943c-4c44-b4ac-53063d3556dd/borestore-hdd-tooling-catalog-volume-9.pdf).

### Catalog gaps

- The D7X11 pilot roadmap carried a JT5/JT520 saver sub. D7X11 drive hardware depends on variant and serial number. The pilot parts list starts at the pipe.
- AT100 `355-1254` uses the catalog's 3.44 tooling path. The removed `400-2169` SaverLok is listed for 3.44SS. The correct rig-side saver hardware for the non-SS setup still needs a manufacturer part reference.
- The D33X44 `#700` path comes from the Ditch Witch Advisor roadmap and exact thread matches. Vermeer's rod table lists `#650` for D33X44 and `#700` for D36X50. Confirm the installed pipe and rig-side hardware for the `#700` setup before ordering.
- D23X30/D24X26 2.59 connector options remain in the source data. The working 2.38 API Reg paths use different connector SKUs. The 2.59 branches still need a reamer or crossover confirmed for those 24K rigs.

### Next production torture test for Gemini

Run this after deploying the frontend and completing the [Supabase reset template and redirect setup](emails/README.md#deploy-the-bdht-recovery-change). Use a disposable crew account and report browser, viewport, rig, pipe SKU, mode, selected parts, and expected versus actual outcome for each failure. Redact recovery credentials and personal account data.

1. Request a password reset in browser profile A. Open the new email link in a clean profile B, then repeat with a fresh link on a phone. Verify **Set a new password** appears and the URL becomes `#/account?m=reset`. Refresh and click **My rigs** before submitting. The reset form should persist. Save a new password, sign in with it in profile A, then replay the used link in profile B. Verify the inline error and request a new link from its button. Repeat the error check with `/?auth=reset` and a fake hash.
2. At **375 × 812**, exercise **Swap** and **Add or remove** on JT20, JT60 and JT4020 All Terrain with skipped slots visible. Click the first modal option and its info button. Check that skipped slots sit below the drawers, keyboard **Skip to content** focuses the main area, and the builder route stays open.
3. Compare the Step 02 and Step 03 pipe SKUs in both modes for JT2720 All Terrain `355-1225`, JT25 `355-1350`, JT20 and JT30 `355-1350-PU`, AT100 `355-1254`, and D7X11 `355-1121 PD`. Share a complete build, reopen it in a clean profile, and confirm the same SKU. Check the D36X50 HIWS1 pipe cards for placeholder images and JT40 Forged HD `355-1303` for SaverLok before its collar.
4. Finish D7X11 in both modes and test both pullback starter rods. Test every offered pullback starter rod for D23X30 and D24X26 `#400`, D33X44 `#650` and `#700`, and D40X40 `#600`. Finish pullback on D60X90 `#900` and D80X120 `#1000`. Check that D16X20 and D20X22 offer active reamers.
5. Turn on **Other brands**. Check JT25 Forged HD 2.11 for the absence of `953-0553` and `953-0401` in the drawer, and JT20 HDX `#600` pin-up for the absence of `PIP-0010`. Add a Radius starter rod to a pending slot. Verify the alternate appears in the list, the guidance appears, and the next slot opens only after equipping a Ditch Witch part.
6. Review incomplete and complete builds at **375 × 812**. Compare `document.documentElement.scrollWidth` and `document.body.scrollWidth` to `innerWidth`. Incomplete summaries should show **Incomplete draft**, offer **Save draft**, and omit share, email, text and copy controls. Complete summaries should share and print. Leave a guest draft on the device and sign in ordinarily, then repeat through **Sign in and save**. Only the explicit save flow should put it on a rig.

