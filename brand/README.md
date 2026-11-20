# The Better Down Hole Tool (BDHT) — Brand & Logo Guide

This folder contains the master vector marks (`.svg`, all text converted to `<path>` outlines) and raster exports (`.png`) for **The Better Down Hole Tool (BDHT)**.

---

## 1. The Mark & Typeface

### Icon Mark
The BDHT icon evolves the site's original `img/favicon.svg`: a dark rounded square (`#07090d`, corner radius `14/64`) housing four corner brackets—**top pair in Amber (`#f0b429`)**, **bottom pair in Cyan (`#7dffe0`)**—framing a horizontal **stepped drill-string tool sub** in Amber.
- Every bracket arm and shoulder is snapped to a 4-unit grid (`64 ÷ 16 = 4`) so the mark renders cleanly down to a `16×16` browser tab icon without half-pixel blur.
- It reads simultaneously as a **slot-rail viewfinder** and a **downhole tool joint / saver sub**.

### Wordmark Typeface
- **Typeface:** **Barlow Semi Condensed** (`Black 900` for the primary wordmark and monogram; `Bold 700` for the `LOADOUT · BDHT` kicker), designed by Jeremy Tribby.
- **License:** [SIL Open Font License 1.1 (OFL)](https://openfontlicense.org/) — free for commercial and open-source use, bundling, modification, and path conversion.
- **Why this typeface:**
  1. **Matches the app UI:** `css/app.css` uses uppercase `font-weight: 900` headings with tight tracking (`-0.02em`) and tracked-out uppercase kickers (`0.16em`).
  2. **Jobsite & equipment plate legibility:** Low-contrast grotesk strokes with slightly chamfered/rounded terminals echo stamped steel equipment data plates and rig decals without imitating any OEM logo.
  3. **Compact horizontal footprint:** Semi-condensed proportions allow all 25 characters of `THE BETTER DOWN HOLE TOOL` to read clearly inside a 200px mobile email header and Stripe Checkout header.
- **Zero font dependency:** Every SVG in `brand/` converts all characters to pure `<path>` outlines. No font files need to be installed or loaded to display the logos.

---

## 2. Color Tokens

Keep `css/app.css` as the single source of truth:

| Token | Hex | RGB | Role |
| :--- | :--- | :--- | :--- |
| `bg` | `#07090d` | `7, 9, 13` | Primary dark background & icon plate |
| `bg-2` / `panel` | `#0e131a` / `#141b24` | `14, 19, 26` / `20, 27, 36` | Dark card surfaces & structural grid |
| `line` | `#314052` | `49, 64, 82` | Hairline borders on dark surfaces |
| `ink` | `#f2f6fb` | `242, 246, 251` | Primary text & wordmark on dark |
| `mute` | `#b7c3d1` | `183, 195, 209` | Secondary text on dark |
| **`amber`** | **`#f0b429`** | `240, 180, 41` | Primary brand accent, top brackets, tool sub, CTAs |
| `amber-2` | `#ffd56a` | `255, 213, 106` | Kicker highlights & part numbers on dark |
| `amber-ink` | `#1a1303` | `26, 19, 3` | High-contrast dark text on amber buttons |
| **`cyan`** | **`#7dffe0`** | `125, 255, 224` | Secondary accent, bottom brackets |
| `ok` / `warn` / `danger` | `#9be7b8` / `#ffc14d` / `#ffb1ab` | — | Status indicators |

*Light-background contrast adjustments:* When placed directly on light surfaces (`#f2f6fb` or `#ffffff`) without the dark `#07090d` badge plate, Amber shifts to `#b87d00` and Cyan shifts to deep teal `#0d6b5c` so every element passes WCAG AA contrast.

---

## 3. Clear Space & Minimum Sizes

- **Clear space:** Maintain a clear zone around all lockups and icons equal to at least **25% of the icon's height** ($0.25 \times H$, or $16\text{ units}$ on the $64\text{ unit}$ grid). Keep borders, text, and other graphics outside this margin.
- **Minimum sizes:**
  - **Icon mark (`brand/icon/`):** `16×16 px` digital (`0.25 in` / `6 mm` print).
  - **Monogram (`brand/monogram/`):** `60 px` wide digital (`0.6 in` / `15 mm` print).
  - **Horizontal lockup (`brand/horizontal/`):** `180 px` wide digital (`1.5 in` / `38 mm` print). Below `180 px` wide, switch to the **Monogram** or **Icon mark**.
  - **Stacked lockup (`brand/stacked/`):** `140 px` wide digital (`1.25 in` / `32 mm` print).

---

## 4. Do's and Don'ts

### Do
- Use the **`dark`** variant on dark surfaces (`#07090d` to `#1c2531`) and the **`light`** variant on white or light-gray surfaces (`#f2f6fb` to `#ffffff`).
- Use the **`white`** or **`black`** monochrome variants for single-color print, laser etching, embroidery, or stencil applications.
- Use the PNG assets in `brand/email/` for HTML emails and `brand/stripe/` for Stripe Dashboard uploads.

### Don't
- **Never** imply affiliation with or endorsement by Ditch Witch®, Vermeer®, Radius® HDD, or Charles Machine Works. Do not pair the BDHT mark with OEM logos, OEM machine photos, or OEM trade dress.
- **Never** stretch, skew, rotate, or add drop shadows or gradients to the icon or wordmark.
- **Never** place the raw `#7dffe0` cyan or `#ffd56a` highlight amber directly onto a white background without the `#07090d` icon plate.
- **Never** alter the proportion or spacing between the corner brackets and the center tool sub.

---

## 5. File Inventory — Which File to Use Where

| Folder / File | Dimensions | Format | Where to Use |
| :--- | :--- | :--- | :--- |
| `brand/icon/icon-dark.svg` | `64×64` viewBox | SVG | Primary site & app icon master (on dark) |
| `brand/icon/icon-light.svg` | `64×64` viewBox | SVG | App icon on light backgrounds |
| `brand/icon/icon-white.svg` | `64×64` viewBox | SVG | Single-color white knockout (print / dark merchandise) |
| `brand/icon/icon-black.svg` | `64×64` viewBox | SVG | Single-color black (invoices, fax/B&W print, forms) |
| `brand/icon/icon-maskable.svg` | `512×512` viewBox | SVG | W3C PWA maskable icon master (80% safe zone) |
| `brand/icon/icon-16.png` … `icon-1024.png` | `16`, `32`, `48`, `192`, `512`, `1024` | PNG | Favicons, PWA manifest icons, desktop/store icons |
| `brand/icon/apple-touch-icon-180.png` | `180×180` | PNG | iOS / iPadOS home-screen `apple-touch-icon` |
| `brand/icon/icon-maskable-512.png` | `512×512` | PNG | `manifest.webmanifest` `"purpose": "maskable"` icon |
| `brand/horizontal/lockup-horizontal-{dark,light,white,black}.svg` | `520×96` viewBox | SVG | Website headers, documentation headers, print banners |
| `brand/horizontal/lockup-horizontal-*@{1x,2x,3x}.png` | `520×96`, `1040×192`, `1560×288` | PNG | Raster horizontal lockups at 1x, 2x, and 3x |
| `brand/stacked/lockup-stacked-{dark,light,white,black}.svg` | `360×220` viewBox | SVG | Square placements, splash screens, cover pages |
| `brand/stacked/lockup-stacked-*@{1x,2x,3x}.png` | `360×220`, `720×440`, `1080×660` | PNG | Raster stacked lockups at 1x, 2x, and 3x |
| `brand/monogram/monogram-{dark,light,white,black}.svg` | `200×64` viewBox | SVG | Compact `BDHT` badge for tight toolbars and stamps |
| `brand/monogram/monogram-*@{1x,2x,3x}.png` | `200×64`, `400×128`, `600×192` | PNG | Raster monogram badges at 1x, 2x, and 3x |
| `brand/stripe/stripe-icon.png` | `512×512` | PNG | Stripe Branding **Icon** upload |
| `brand/stripe/stripe-logo-dark.png` | `780×144` | PNG | Stripe Branding **Logo** (dark plate) |
| `brand/stripe/stripe-logo-light.png` | `780×144` | PNG | Stripe Branding **Logo** (for light Checkout / invoice PDFs) |
| `brand/email/email-logo-dark@2x.png` (`@1x`) | `416×76` (`208×38`) | PNG | Email header logo on `#07090d` dark header band (display at `208×38`) |
| `brand/email/email-logo-light@2x.png` (`@1x`) | `416×76` (`208×38`) | PNG | Email header logo on light backgrounds (display at `208×38`) |
| `brand/social/og-1200x630.png` (`.svg`) | `1200×630` | PNG / SVG | Open Graph (`og:image`) and social link preview card |

---

## 6. Stripe Branding Requirements & Recommended Values

Per Stripe's official documentation ([Customize your brand settings](https://docs.stripe.com/customize/branding)):
- **Supported formats:** JPG or PNG only (SVG is not supported).
- **Maximum file size:** Less than **512 KB**.
- **Minimum dimensions:** Equal to or greater than **128px × 128px** on both axes.
- **Asset files provided:**
  - **Icon:** `brand/stripe/stripe-icon.png` (`512×512 px`, ~6 KB PNG).
  - **Logo:** `brand/stripe/stripe-logo-light.png` (or `brand/stripe/stripe-logo-dark.png`, `780×144 px`, ~15 KB PNG — both width and height exceed `128 px`). Use `stripe-logo-light.png` as the default Stripe Logo because Stripe places the wide logo on white/light backgrounds in Hosted Checkout, the Customer Portal header, and Invoice PDFs.
- **Recommended Stripe color settings:**
  - **Brand color:** `#07090d` (used by Stripe on invoice headers, receipts, and Customer Portal accents).
  - **Accent color:** `#f0b429` (used by Stripe on primary Checkout action buttons and highlights).

---

## 7. Regenerating All SVGs & PNGs

All SVGs and 4×-supersampled PNGs are deterministically generated from `brand/generate_brand_assets.py` using the pre-extracted SIL OFL glyph contours in `brand/_glyphs.json` and Pillow (`PIL`).

To regenerate every file in `brand/`:

```bash
python brand/generate_brand_assets.py
```
