#!/usr/bin/env node
/**
 * BDHT Email Template Builder
 * Compiles all 18 templates (HTML + plain-text .txt twins), 5 Supabase Auth Go-template versions,
 * emails/manifest.json, and emails/preview/index.html from one shared layout.
 *
 * Usage:
 *   node emails/build.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_DATA, TEMPLATES } from './src/templates.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(ROOT, 'dist');
const SUPABASE_DIR = join(ROOT, 'supabase-auth');
const PREVIEW_DIR = join(ROOT, 'preview');

mkdirSync(DIST_DIR, { recursive: true });
mkdirSync(SUPABASE_DIR, { recursive: true });
mkdirSync(PREVIEW_DIR, { recursive: true });

const FONT_SANS = `ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const FONT_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

function inlineParagraphStyles(html) {
  return html
    .trim()
    .replace(
      /<p>/g,
      `<p class="bdht-text" style="margin:0 0 16px 0;font-family:${FONT_SANS};font-size:16px;line-height:24px;color:#07090d;">`,
    )
    .replace(
      /<code>/g,
      `<code style="font-family:${FONT_MONO};font-size:14px;background-color:#e7eef5;color:#07090d;padding:2px 6px;border-radius:4px;">`,
    );
}

function renderDetailsTable(rows, isSupabase = false) {
  if (!rows || !rows.length) return '';
  const trs = rows
    .map((r, idx) => {
      const label = r[0];
      const val = isSupabase && r[2] ? r[2] : r[1];
      const borderTop = idx === 0 ? '' : 'border-top:1px solid #d5deea;';
      return `
              <tr>
                <td class="bdht-detail-lbl" style="padding:10px 14px;${borderTop}font-family:${FONT_SANS};font-size:14px;line-height:20px;font-weight:700;color:#314052;width:42%;vertical-align:top;">${label}</td>
                <td class="bdht-detail-val" style="padding:10px 14px;${borderTop}font-family:${FONT_MONO};font-size:14px;line-height:20px;font-weight:700;color:#07090d;vertical-align:top;word-break:break-word;">${val}</td>
              </tr>`;
    })
    .join('');

  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bdht-box" style="margin:4px 0 22px 0;background-color:#f2f6fb;border:1px solid #d5deea;border-radius:12px;border-collapse:separate;">
            <tbody>${trs}
            </tbody>
          </table>`;
}

function renderSharedHtml(tpl, { isSupabase = false } = {}) {
  const subject = isSupabase && tpl.supabaseSubject ? tpl.supabaseSubject : tpl.subject;
  const preheader = tpl.preheader;
  const varsList = isSupabase ? tpl.supabaseVariables : tpl.variables.map((v) => `{{${v}}}`);
  const ctaHref = isSupabase ? tpl.supabaseCtaUrl : `{{${tpl.ctaUrlVar}}}`;
  const bodyContent = inlineParagraphStyles(isSupabase && tpl.supabaseBodyHtml ? tpl.supabaseBodyHtml : tpl.bodyHtml);
  const detailsTable = renderDetailsTable(tpl.details, isSupabase);
  const logoSrc = isSupabase ? '{{ .SiteURL }}/brand/email/email-logo-dark@2x.png' : '{{logo_url}}';
  const appHref = isSupabase ? '{{ .SiteURL }}' : '{{app_url}}';
  const supportBlock = isSupabase
    ? `Need help? Reply to this email or open <a href="{{ .SiteURL }}" class="bdht-foot-link" style="color:#07090d;font-weight:700;text-decoration:underline;">The Better Down Hole Tool</a>.`
    : `Questions? Contact <a href="mailto:{{support_email}}" class="bdht-foot-link" style="color:#07090d;font-weight:700;text-decoration:underline;">{{support_email}}</a>.`;
  const unsubBlock = !tpl.transactional && !isSupabase
    ? `<p class="bdht-foot-text" style="margin:8px 0 0 0;font-family:${FONT_SANS};font-size:14px;line-height:20px;color:#314052;"><a href="{{unsubscribe_url}}" class="bdht-foot-link" style="color:#314052;font-weight:700;text-decoration:underline;">Unsubscribe from non-essential crew reminders</a></p>`
    : '';

  const frontMatter = `<!--
  Template:  ${isSupabase ? tpl.supabaseSlug : tpl.slug}
  Category:  ${tpl.category}
  Subject:   ${subject}
  Preheader: ${preheader}
  Variables: ${varsList.join(', ')}
-->\n`;

  return `${frontMatter}<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media only screen and (max-width: 620px) {
      .bdht-container { width: 100% !important; max-width: 100% !important; }
      .bdht-pad { padding: 22px 18px !important; }
      .bdht-head-pad { padding: 18px !important; }
      .bdht-h1 { font-size: 22px !important; line-height: 28px !important; }
      .bdht-btn { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .bdht-bg { background-color: #07090d !important; color: #f2f6fb !important; }
      .bdht-card { background-color: #141b24 !important; border-color: #314052 !important; }
      .bdht-h1, .bdht-text, .bdht-detail-val { color: #f2f6fb !important; }
      .bdht-text li { color: #f2f6fb !important; }
      .bdht-kicker { color: #ffd56a !important; }
      .bdht-box { background-color: #0e131a !important; border-color: #314052 !important; }
      .bdht-box td { border-color: #314052 !important; }
      .bdht-detail-lbl, .bdht-note, .bdht-foot-text { color: #b7c3d1 !important; }
      .bdht-foot-link, .bdht-note a { color: #ffd56a !important; }
    }
    [data-ogsc] .bdht-bg { background-color: #07090d !important; }
    [data-ogsc] .bdht-card { background-color: #141b24 !important; border-color: #314052 !important; }
    [data-ogsc] .bdht-h1, [data-ogsc] .bdht-text, [data-ogsc] .bdht-detail-val { color: #f2f6fb !important; }
    [data-ogsc] .bdht-kicker, [data-ogsc] .bdht-foot-link { color: #ffd56a !important; }
    [data-ogsc] .bdht-box { background-color: #0e131a !important; border-color: #314052 !important; }
    [data-ogsc] .bdht-detail-lbl, [data-ogsc] .bdht-note, [data-ogsc] .bdht-foot-text { color: #b7c3d1 !important; }
  </style>
</head>
<body class="bdht-bg" style="margin:0;padding:0;width:100%;background-color:#f2f6fb;color:#07090d;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Hidden preheader text -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${preheader}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bdht-bg" style="background-color:#f2f6fb;width:100%;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="bdht-container bdht-card" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #d5deea;border-radius:16px;overflow:hidden;border-collapse:separate;">
          <!-- Dark #07090d Header Band -->
          <tr>
            <td class="bdht-head-pad" style="background-color:#07090d;border-bottom:3px solid #f0b429;padding:20px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <a href="${appHref}" style="text-decoration:none;color:#f2f6fb;font-family:${FONT_SANS};font-size:16px;font-weight:900;letter-spacing:0.02em;">
                      <img src="${logoSrc}" width="208" height="38" alt="The Better Down Hole Tool" style="display:block;border:0;outline:none;text-decoration:none;width:208px;max-width:100%;height:auto;color:#f2f6fb;font-family:${FONT_SANS};font-size:15px;font-weight:800;">
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td class="bdht-pad" style="padding:28px;">
              <p class="bdht-kicker" style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:14px;line-height:18px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#9a6700;">
                ${tpl.kicker}
              </p>
              <h1 class="bdht-h1" style="margin:0 0 18px 0;font-family:${FONT_SANS};font-size:24px;line-height:30px;font-weight:900;letter-spacing:-0.01em;text-transform:uppercase;color:#07090d;">
                ${tpl.heading}
              </h1>

              ${bodyContent}
              ${detailsTable}

              <!-- Bulletproof Primary Amber Button (>=48px tap target, Outlook VML + table cell) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;">
                <tr>
                  <td align="center" bgcolor="#f0b429" style="border-radius:12px;background-color:#f0b429;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaHref}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="25%" strokecolor="#f0b429" fillcolor="#f0b429">
                      <w:anchorlock/>
                      <center style="color:#1a1303;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${tpl.ctaLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${ctaHref}" class="bdht-btn" style="display:inline-block;min-height:48px;line-height:24px;padding:12px 24px;background-color:#f0b429;border:2px solid #f0b429;border-radius:12px;color:#1a1303;font-family:${FONT_SANS};font-size:15px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;text-align:center;box-sizing:border-box;">
                      ${tpl.ctaLabel}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p class="bdht-note" style="margin:0;padding-top:16px;border-top:1px solid #d5deea;font-family:${FONT_SANS};font-size:14px;line-height:21px;color:#314052;">
                ${tpl.footnoteHtml}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="bdht-container" style="width:100%;max-width:600px;">
          <tr>
            <td align="center" style="padding:18px 16px 8px 16px;">
              <p class="bdht-foot-text" style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:14px;line-height:20px;font-weight:700;color:#314052;">
                The Better Down Hole Tool &middot; <a href="${appHref}" class="bdht-foot-link" style="color:#07090d;font-weight:700;text-decoration:underline;">Open loadout builder</a>
              </p>
              <p class="bdht-foot-text" style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:14px;line-height:20px;color:#314052;">
                ${supportBlock}
              </p>
              <p class="bdht-foot-text" style="margin:0;font-family:${FONT_SANS};font-size:14px;line-height:20px;color:#314052;">
                Independent drill-string loadout builder. Not affiliated with any equipment manufacturer.
              </p>
              ${unsubBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function renderSharedText(tpl, { isSupabase = false } = {}) {
  const subject = isSupabase && tpl.supabaseSubject ? tpl.supabaseSubject : tpl.subject;
  const varsList = isSupabase ? tpl.supabaseVariables : tpl.variables.map((v) => `{{${v}}}`);
  const body = (isSupabase && tpl.supabaseBodyText ? tpl.supabaseBodyText : tpl.bodyText).trim();
  const appHref = isSupabase ? '{{ .SiteURL }}' : '{{app_url}}';
  const supportLine = isSupabase ? 'Web: {{ .SiteURL }}' : 'Support: {{support_email}} | Web: {{app_url}}';
  const unsubLine = !tpl.transactional && !isSupabase ? '\nUnsubscribe: {{unsubscribe_url}}' : '';

  return `Subject: ${subject}
Preheader: ${tpl.preheader}
Variables: ${varsList.join(', ')}
------------------------------------------------------------------------

THE BETTER DOWN HOLE Tool (BDHT)
${tpl.kicker.toUpperCase()} — ${tpl.heading}

${body}

--
The Better Down Hole Tool
${supportLine}
Independent drill-string loadout builder. Not affiliated with any equipment manufacturer.${unsubLine}
`;
}

function fillSampleData(str) {
  let out = str;
  for (const [k, v] of Object.entries(SAMPLE_DATA)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  // Also fill Supabase Go-template variables for preview
  out = out
    .replace(/\{\{\s*if\s+\.Data\.employee_name\s*\}\}\s*\{\{\s*\.Data\.employee_name\s*\}\}\{\{\s*end\s*\}\}/g, ` ${SAMPLE_DATA.first_name}`)
    .replace(/\{\{\s*if\s+\.Data\.company_name\s*\}\}([\s\S]*?)\{\{\s*else\s*\}\}[\s\S]*?\{\{\s*end\s*\}\}/g, `$1`)
    .replace(/\{\{\s*if\s+\.Data\.company_name\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g, `$1`)
    .replace(/\{\{\s*if\s+\.Data\.invite_code\s*\}\}([\s\S]*?)\{\{\s*else\s*\}\}[\s\S]*?\{\{\s*end\s*\}\}/g, `$1`)
    .replace(/\{\{\s*if\s+\.Data\.invite_code\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g, `$1`)
    .replaceAll('{{ .ConfirmationURL }}', SAMPLE_DATA.confirmation_url)
    .replaceAll('{{ .Token }}', SAMPLE_DATA.otp_code)
    .replaceAll('{{ .TokenHash }}', 'pkce_sample_token_hash_8942')
    .replaceAll('{{ .SiteURL }}/brand/email/email-logo-dark@2x.png', SAMPLE_DATA.logo_url)
    .replaceAll('{{ .SiteURL }}', SAMPLE_DATA.app_url)
    .replaceAll('{{ .Email }}', SAMPLE_DATA.user_email)
    .replaceAll('{{ .NewEmail }}', SAMPLE_DATA.new_email)
    .replaceAll('{{ .OldEmail }}', SAMPLE_DATA.old_email)
    .replaceAll('{{ .Data.employee_name }}', SAMPLE_DATA.first_name)
    .replaceAll('{{ .Data.company_name }}', SAMPLE_DATA.company_name)
    .replaceAll('{{ .Data.invite_code }}', SAMPLE_DATA.invite_code);
  return out;
}

const manifest = {
  brand: 'The Better Down Hole Tool',
  short_name: 'BDHT',
  plan_name: 'The Better Down Hole Tool — Unlimited',
  free_machine_limit: 3,
  unlimited_price_usd: '$2.99/month',
  generated_by: 'emails/build.mjs',
  templates: [],
};

const previewItems = [];

for (const tpl of TEMPLATES) {
  const html = renderSharedHtml(tpl, { isSupabase: false });
  const text = renderSharedText(tpl, { isSupabase: false });
  const htmlFile = `dist/${tpl.slug}.html`;
  const textFile = `dist/${tpl.slug}.txt`;
  writeFileSync(join(DIST_DIR, `${tpl.slug}.html`), html, 'utf8');
  writeFileSync(join(DIST_DIR, `${tpl.slug}.txt`), text, 'utf8');

  const entry = {
    id: tpl.id,
    slug: tpl.slug,
    category: tpl.category,
    title: tpl.title,
    transactional: tpl.transactional,
    subject: tpl.subject,
    preheader: tpl.preheader,
    variables: tpl.variables,
    html_path: htmlFile,
    text_path: textFile,
  };

  let supaHtml = null;
  let supaText = null;
  if (tpl.supabaseSlug) {
    supaHtml = renderSharedHtml(tpl, { isSupabase: true });
    supaText = renderSharedText(tpl, { isSupabase: true });
    const sHtmlFile = `supabase-auth/${tpl.supabaseSlug}.html`;
    const sTextFile = `supabase-auth/${tpl.supabaseSlug}.txt`;
    writeFileSync(join(SUPABASE_DIR, `${tpl.supabaseSlug}.html`), supaHtml, 'utf8');
    writeFileSync(join(SUPABASE_DIR, `${tpl.supabaseSlug}.txt`), supaText, 'utf8');
    entry.supabase_auth = {
      slug: tpl.supabaseSlug,
      subject: tpl.supabaseSubject || tpl.subject,
      variables: tpl.supabaseVariables,
      html_path: sHtmlFile,
      text_path: sTextFile,
    };
  }

  manifest.templates.push(entry);
  previewItems.push({
    ...entry,
    renderedHtml: fillSampleData(html),
    renderedText: fillSampleData(text),
    renderedSupabaseHtml: supaHtml ? fillSampleData(supaHtml) : null,
    renderedSupabaseText: supaText ? fillSampleData(supaText) : null,
  });
}

writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// Build emails/preview/index.html
const previewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BDHT Email Templates Preview (${previewItems.length} Templates)</title>
  <style>
    :root {
      --bg: #07090d;
      --bg-2: #0e131a;
      --panel: #141b24;
      --panel-2: #1c2531;
      --line: #314052;
      --ink: #f2f6fb;
      --mute: #b7c3d1;
      --amber: #f0b429;
      --amber-2: #ffd56a;
      --amber-ink: #1a1303;
      --cyan: #7dffe0;
      --font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font);
      background: var(--bg);
      color: var(--ink);
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(7, 9, 13, 0.96);
      border-bottom: 1px solid var(--line);
      padding: 12px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 34px; width: auto; }
    .brand-meta small { display: block; color: var(--amber-2); font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    .brand-meta b { font-size: 15px; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .seg {
      display: inline-flex;
      background: var(--bg-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 3px;
      gap: 3px;
    }
    .seg button {
      border: 0;
      background: transparent;
      color: var(--mute);
      font: inherit;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 7px 12px;
      border-radius: 7px;
      cursor: pointer;
    }
    .seg button[aria-pressed="true"] {
      background: var(--amber);
      color: var(--amber-ink);
    }
    .workspace {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      flex: 1;
    }
    @media (max-width: 900px) {
      .workspace { grid-template-columns: 1fr; }
    }
    .sidebar {
      background: var(--bg-2);
      border-right: 1px solid var(--line);
      padding: 14px;
      overflow-y: auto;
      max-height: calc(100vh - 64px);
      position: sticky;
      top: 64px;
    }
    .cat-head {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--amber-2);
      margin: 16px 6px 8px;
    }
    .cat-head:first-child { margin-top: 4px; }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: left;
      background: transparent;
      border: 1px solid transparent;
      color: var(--ink);
      padding: 9px 10px;
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .nav-btn:hover { background: var(--panel); }
    .nav-btn.active {
      background: var(--panel-2);
      border-color: var(--amber);
    }
    .nav-num {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 800;
      color: var(--amber-2);
      background: var(--bg);
      padding: 2px 6px;
      border-radius: 6px;
      flex: none;
    }
    .stage {
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .tpl-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    .tpl-meta {
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 8px;
    }
    .tpl-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .tpl-title { font-size: 18px; font-weight: 900; text-transform: uppercase; }
    .pill {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--panel-2);
      border: 1px solid var(--line);
      color: var(--cyan);
    }
    .meta-row { font-size: 13px; color: var(--mute); }
    .meta-row b { color: var(--ink); }
    .vars { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
    .vars code {
      font-family: var(--mono);
      font-size: 12px;
      background: var(--bg);
      color: var(--amber-2);
      padding: 2px 7px;
      border-radius: 6px;
      border: 1px solid var(--line);
    }
    .frame-wrap {
      padding: 24px;
      background: #0b0f15;
      display: flex;
      justify-content: center;
    }
    .email-frame {
      width: 640px;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #f2f6fb;
      transition: width 0.2s ease;
    }
    body[data-viewport="mobile"] .email-frame {
      width: 375px;
    }
    .txt-view {
      display: none;
      width: 640px;
      max-width: 100%;
      background: var(--bg);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      margin: 0;
    }
    body[data-format="txt"] .email-frame { display: none; }
    body[data-format="txt"] .txt-view { display: block; }
  </style>
</head>
<body data-viewport="desktop" data-format="html" data-theme="light">
  <header class="topbar">
    <div class="brand">
      <img src="../../brand/icon/icon-dark.svg" alt="BDHT Icon">
      <div class="brand-meta">
        <small>The Better Down Hole Tool</small>
        <b>Email System Preview &middot; 18 Templates</b>
      </div>
    </div>
    <div class="controls">
      <div class="seg" role="group" aria-label="Viewport width">
        <button type="button" data-vp="desktop" aria-pressed="true">Desktop (600px)</button>
        <button type="button" data-vp="mobile" aria-pressed="false">Mobile (375px)</button>
      </div>
      <div class="seg" role="group" aria-label="Color mode">
        <button type="button" data-th="light" aria-pressed="true">Light email</button>
        <button type="button" data-th="dark" aria-pressed="false">Dark email</button>
      </div>
      <div class="seg" role="group" aria-label="Format">
        <button type="button" data-fmt="html" aria-pressed="true">HTML</button>
        <button type="button" data-fmt="txt" aria-pressed="false">Plain text (.txt)</button>
      </div>
    </div>
  </header>

  <div class="workspace">
    <nav class="sidebar" id="nav"></nav>
    <main class="stage" id="stage"></main>
  </div>

  <script>
    const ITEMS = ${JSON.stringify(previewItems)};
    const nav = document.getElementById('nav');
    const stage = document.getElementById('stage');

    let lastCat = '';
    ITEMS.forEach((item) => {
      if (item.category !== lastCat) {
        lastCat = item.category;
        const h = document.createElement('div');
        h.className = 'cat-head';
        h.textContent = lastCat;
        nav.appendChild(h);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn';
      btn.innerHTML = '<span class="nav-num">' + String(item.id).padStart(2, '0') + '</span><span>' + item.title + '</span>';
      btn.addEventListener('click', () => {
        document.getElementById('tpl-' + item.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(btn);

      const card = document.createElement('section');
      card.className = 'tpl-card';
      card.id = 'tpl-' + item.slug;
      const varsHtml = item.variables.map((v) => '<code>{{' + v + '}}</code>').join('');
      const supaBadge = item.supabase_auth
        ? ' <span class="pill" title="Includes Supabase Go-template version in emails/supabase-auth/' + item.supabase_auth.slug + '.html">Supabase Auth ready</span>'
        : '';

      card.innerHTML = \`
        <div class="tpl-meta">
          <div class="tpl-top">
            <div class="tpl-title">#\${String(item.id).padStart(2, '0')} &middot; \${item.title}</div>
            <div><span class="pill">\${item.category}</span>\${supaBadge}</div>
          </div>
          <div class="meta-row"><b>Subject:</b> \${item.subject}</div>
          <div class="meta-row"><b>Preheader:</b> \${item.preheader}</div>
          <div class="meta-row"><b>Files:</b> <code>emails/\${item.html_path}</code> &middot; <code>emails/\${item.text_path}</code>\${item.supabase_auth ? ' &middot; <code>emails/' + item.supabase_auth.html_path + '</code>' : ''}</div>
          <div class="vars">\${varsHtml}</div>
        </div>
        <div class="frame-wrap">
          <iframe class="email-frame" title="\${item.title}" sandbox="allow-same-origin"></iframe>
          <pre class="txt-view"></pre>
        </div>
      \`;
      stage.appendChild(card);

      const iframe = card.querySelector('iframe');
      const pre = card.querySelector('.txt-view');
      pre.textContent = item.renderedText;
      iframe.dataset.rawHtml = item.renderedHtml;
    });

    function applyThemeToIframes(theme) {
      document.querySelectorAll('.email-frame').forEach((iframe) => {
        let html = iframe.dataset.rawHtml;
        if (theme === 'dark') {
          const darkOverride = \`<style>
            body, .bdht-bg { background-color: #07090d !important; color: #f2f6fb !important; }
            .bdht-card { background-color: #141b24 !important; border-color: #314052 !important; }
            .bdht-h1, .bdht-text, .bdht-detail-val { color: #f2f6fb !important; }
            .bdht-text li, .bdht-pad ol, .bdht-pad ul { color: #f2f6fb !important; }
            .bdht-kicker { color: #ffd56a !important; }
            .bdht-box { background-color: #0e131a !important; border-color: #314052 !important; }
            .bdht-box td { border-color: #314052 !important; }
            .bdht-detail-lbl, .bdht-note, .bdht-foot-text { color: #b7c3d1 !important; }
            .bdht-foot-link, .bdht-note a { color: #ffd56a !important; }
          </style>\`;
          html = html.replace('</head>', darkOverride + '</head>');
        }
        iframe.srcdoc = html;
        iframe.onload = () => {
          try {
            const h = iframe.contentDocument.documentElement.scrollHeight;
            iframe.style.height = Math.max(420, h + 12) + 'px';
          } catch {}
        };
      });
    }

    applyThemeToIframes('light');

    document.querySelectorAll('[data-vp]').forEach((b) => b.addEventListener('click', () => {
      document.body.dataset.viewport = b.dataset.vp;
      document.querySelectorAll('[data-vp]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      setTimeout(() => applyThemeToIframes(document.body.dataset.theme), 220);
    }));
    document.querySelectorAll('[data-th]').forEach((b) => b.addEventListener('click', () => {
      document.body.dataset.theme = b.dataset.th;
      document.querySelectorAll('[data-th]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      applyThemeToIframes(b.dataset.th);
    }));
    document.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => {
      document.body.dataset.format = b.dataset.fmt;
      document.querySelectorAll('[data-fmt]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
  </script>
</body>
</html>
`;

writeFileSync(join(PREVIEW_DIR, 'index.html'), previewHtml, 'utf8');
console.log(`Built ${TEMPLATES.length} email templates (HTML + TXT), 5 Supabase Auth templates, manifest.json, and preview/index.html.`);
