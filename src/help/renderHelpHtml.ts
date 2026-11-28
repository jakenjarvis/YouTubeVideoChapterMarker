import {
  HELP_COPY,
  HELP_LOCALES,
  type HelpCategory,
  type HelpLocaleMeta,
} from './helpLocales.ts';
import { renderScenarioDiagramSvg } from './scenarioDiagrams.ts';

const SITE_NAME = 'YouTube Video Chapter Marker';
const GITHUB_URL = 'https://github.com/jakenjarvis/YouTubeVideoChapterMarker';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

export function resolveHelpLocaleMeta(localeCode?: string | null): HelpLocaleMeta {
  const normalized = (localeCode ?? 'en').trim().toLowerCase();
  return (
    HELP_LOCALES.find((l) => l.code === normalized) ??
    HELP_LOCALES.find((l) => l.code === 'en')!
  );
}

export interface RenderHelpPageParams {
  localeCode: string;
  siteUrl: string;
  appVersion: string;
  isRootHelp?: boolean;
}

export function renderHelpPageHtml(params: RenderHelpPageParams): string {
  const { localeCode, siteUrl, appVersion, isRootHelp = false } = params;
  const meta = resolveHelpLocaleMeta(localeCode);
  const copy = HELP_COPY[meta.code] ?? HELP_COPY.en;

  const canonicalUrl = isRootHelp ? `${siteUrl}/help/` : `${siteUrl}/${meta.code}/help/`;
  const appHomeHref = isRootHelp ? '/' : `/${meta.code}/`;
  const ogImageUrl = `${siteUrl}/og-image.png`;

  const hreflangTags = [
    ...HELP_LOCALES.map(
      (loc) =>
        `    <link rel="alternate" hreflang="${loc.htmlLang}" href="${escapeHtml(`${siteUrl}/${loc.code}/help/`)}" />`
    ),
    `    <link rel="alternate" hreflang="x-default" href="${escapeHtml(`${siteUrl}/help/`)}" />`,
  ].join('\n');

  const ogAltLocaleTags = HELP_LOCALES.filter((loc) => loc.code !== meta.code)
    .map((loc) => `    <meta property="og:locale:alternate" content="${loc.ogLocale}" />`)
    .join('\n');

  const jsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: copy.metaTitle,
        description: copy.metaDescription,
        url: canonicalUrl,
        inLanguage: meta.htmlLang,
        isPartOf: {
          '@type': 'WebApplication',
          name: SITE_NAME,
          url: `${siteUrl}/`,
          softwareVersion: appVersion,
        },
      },
      {
        '@type': 'ItemList',
        name: copy.heroTitle,
        numberOfItems: copy.scenarios.length,
        itemListElement: copy.scenarios.map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${s.num}. ${s.title}`,
          url: `${canonicalUrl}#scenario-${s.id}`,
        })),
      },
    ],
  });

  const categories: readonly HelpCategory[] = ['basic', 'long', 'fix', 'try'];

  const filterButtonsHtml = [
    `<button type="button" class="filter-btn is-active" data-filter="all" aria-pressed="true">${escapeHtml(copy.filterAll)}</button>`,
    ...categories.map(
      (cat) =>
        `<button type="button" class="filter-btn" data-filter="${cat}" aria-pressed="false">${escapeHtml(copy.categories[cat])}</button>`
    ),
  ].join('');

  const quickIndexHtml = copy.scenarios
    .map(
      (s) =>
        `<a class="index-item" href="#scenario-${s.id}" data-category="${s.category}"><span class="index-num">${escapeHtml(s.num)}</span><span class="index-title">${escapeHtml(s.title)}</span></a>`
    )
    .join('');

  const scenarioCardsHtml = copy.scenarios
    .map((s) => {
      const svg = renderScenarioDiagramSvg(s.id, s.steps, `${s.num} ${s.title}: ${s.flow}`);
      return `
        <article class="scenario-card" id="scenario-${s.id}" data-category="${s.category}">
          <div class="scenario-head">
            <div class="scenario-title-group">
              <span class="scenario-num">${escapeHtml(s.num)}</span>
              <h2 class="scenario-title">${escapeHtml(s.title)}</h2>
            </div>
            <p class="scenario-flow">${escapeHtml(s.flow)}</p>
          </div>
          <div class="diagram-stage" dir="ltr">
            ${svg}
          </div>
          <div class="scenario-foot">
            <span class="scenario-cat">${escapeHtml(copy.categories[s.category])}</span>
            <p class="scenario-tip">${escapeHtml(s.tip)}</p>
          </div>
        </article>`;
    })
    .join('\n');

  const langOptionsHtml = HELP_LOCALES.map(
    (loc) =>
      `<option value="/${loc.code}/help/"${loc.code === meta.code ? ' selected' : ''}>${escapeHtml(loc.nativeLabel)}</option>`
  ).join('');

  const footerLangLinksHtml = HELP_LOCALES.map(
    (loc) =>
      `<a href="/${loc.code}/help/" hreflang="${loc.htmlLang}" lang="${loc.htmlLang}" dir="${loc.dir}"${loc.code === meta.code ? ' aria-current="page"' : ''}>${escapeHtml(loc.nativeLabel)}</a>`
  ).join('');

  return `<!doctype html>
<html lang="${meta.htmlLang}" dir="${meta.dir}" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-W8NKMDP7"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
    </script>
    <title>${escapeHtml(copy.metaTitle)}</title>
    <meta name="description" content="${escapeHtml(copy.metaDescription)}" />
    <meta name="theme-color" content="#0D0F12" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${hreflangTags}
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(copy.metaTitle)}" />
    <meta property="og:description" content="${escapeHtml(copy.metaDescription)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:locale" content="${meta.ogLocale}" />
${ogAltLocaleTags}
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(copy.metaTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(copy.metaDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <script id="seo-json-ld" type="application/ld+json">${jsonLd}</script>
    <script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8666829667737106"
      crossorigin="anonymous"
    ></script>
    <style>
      :root {
        --bg: #0D0F12;
        --surface: #14171C;
        --surface-2: #0F1217;
        --border: #222731;
        --border-strong: #2E3644;
        --text: #F3F5F8;
        --text-2: #9AA6B8;
        --text-3: #6C788B;
        --amber: #F59E0B;
        --amber-light: #FBBF24;
        --sky: #38BDF8;
        --emerald: #34D399;
      }
      * { box-sizing: border-box; }
      html {
        scroll-behavior: smooth;
        background: var(--bg);
        color: var(--text);
        font-family: 'Plus Jakarta Sans', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        -webkit-font-smoothing: antialiased;
      }
      a { color: inherit; text-decoration: none; }
      .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; font-variant-numeric: tabular-nums; }

      /* Sticky 3-Zone Top Bar */
      .topbar {
        position: sticky;
        top: 0;
        z-index: 40;
        height: 56px;
        background: rgba(17, 20, 25, 0.94);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--border);
      }
      .topbar-inner {
        max-width: 1120px;
        height: 100%;
        margin: 0 auto;
        padding: 0 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .brand-zone {
        display: flex;
        align-items: baseline;
        gap: 10px;
        min-width: 0;
      }
      .brand-link {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--text);
        white-space: nowrap;
      }
      .brand-ver {
        font-size: 11px;
        color: var(--text-3);
        white-space: nowrap;
      }
      .actions-zone {
        display: flex;
        align-items: center;
        gap: 10px;
        shrink: 0;
      }
      .lang-select {
        appearance: none;
        background: #1A1F27;
        color: #E2E8F0;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
      }
      .lang-select:focus-visible {
        outline: 2px solid var(--sky);
        outline-offset: 2px;
      }
      .cta-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 6px;
        background: var(--amber);
        color: #0D0F12;
        font-size: 12.5px;
        font-weight: 700;
        white-space: nowrap;
        transition: background-color 0.15s ease;
      }
      .cta-primary:hover { background: var(--amber-light); }

      /* Main Container */
      .container {
        max-width: 1040px;
        margin: 0 auto;
        padding: 36px 20px 72px;
      }

      /* Compact Hero */
      .hero {
        padding-bottom: 24px;
        border-bottom: 1px solid var(--border);
      }
      .hero-title {
        margin: 0;
        font-size: clamp(1.65rem, 3vw, 2.35rem);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.2;
        color: var(--text);
      }
      .hero-sub {
        margin: 10px 0 0;
        font-size: 14.5px;
        line-height: 1.6;
        color: var(--text-2);
        max-width: 680px;
      }

      /* Filter Bar */
      .filter-bar {
        margin-top: 22px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .filter-btn {
        background: var(--surface);
        color: var(--text-2);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 7px 13px;
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
      }
      .filter-btn:hover {
        color: var(--text);
        border-color: var(--border-strong);
      }
      .filter-btn.is-active {
        background: #1C232E;
        color: var(--amber-light);
        border-color: rgba(245, 158, 11, 0.55);
      }

      /* Quick 10-Scenario Visual Index */
      .index-grid {
        margin-top: 20px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 8px;
      }
      .index-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 11px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 7px;
        font-size: 12px;
        color: #CBD5E1;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .index-item:hover {
        border-color: rgba(56, 189, 248, 0.55);
        background: #171C24;
        color: var(--text);
      }
      .index-item[hidden] { display: none; }
      .index-num {
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
        font-size: 11px;
        font-weight: 700;
        color: var(--amber-light);
        flex-shrink: 0;
      }
      .index-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Scenario Cards */
      .scenarios {
        margin-top: 28px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .scenario-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        scroll-margin-top: 72px;
      }
      .scenario-card[hidden] { display: none; }
      .scenario-head {
        padding: 16px 20px 14px;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px 16px;
        border-bottom: 1px solid var(--border);
      }
      .scenario-title-group {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .scenario-num {
        font-family: 'JetBrains Mono', monospace;
        font-variant-numeric: tabular-nums;
        font-size: 13px;
        font-weight: 700;
        color: var(--amber-light);
      }
      .scenario-title {
        margin: 0;
        font-size: 16.5px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--text);
      }
      .scenario-flow {
        margin: 0;
        font-size: 12.5px;
        color: var(--text-2);
      }

      /* Diagram Stage */
      .diagram-stage {
        background: var(--surface-2);
        padding: 14px 16px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .diagram-svg {
        display: block;
        width: 100%;
        min-width: 680px;
        height: auto;
      }

      /* Minimal Card Footer */
      .scenario-foot {
        padding: 11px 20px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 14px;
        font-size: 12px;
      }
      .scenario-cat {
        font-size: 11px;
        font-weight: 600;
        color: var(--sky);
        white-space: nowrap;
      }
      .scenario-tip {
        margin: 0;
        color: var(--text-2);
        line-height: 1.5;
      }

      /* Bottom CTA + Quiet Footer */
      .bottom-cta {
        margin-top: 36px;
        padding: 24px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .bottom-note {
        margin: 0;
        font-size: 13px;
        color: var(--text-2);
      }
      .footer {
        margin-top: 40px;
        padding-top: 22px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 14px;
        font-size: 12px;
        color: var(--text-3);
      }
      .footer-langs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
      }
      .footer-langs a:hover,
      .footer-langs a[aria-current="page"] {
        color: var(--text);
      }
      .footer-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .footer-links {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .footer-links a:hover { color: var(--text); }

      @media (max-width: 640px) {
        .brand-ver { display: none; }
        .topbar-inner { padding: 0 14px; }
        .container { padding: 24px 14px 56px; }
        .scenario-head, .scenario-foot { padding-inline: 14px; }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand-zone">
          <a href="${escapeHtml(appHomeHref)}" class="brand-link">${SITE_NAME}</a>
          <span class="brand-ver mono">Ver ${escapeHtml(appVersion)}</span>
        </div>
        <div class="actions-zone">
          <label for="help-lang-select" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Language</label>
          <select id="help-lang-select" class="lang-select" aria-label="Language">
            ${langOptionsHtml}
          </select>
          <a href="${escapeHtml(appHomeHref)}" class="cta-primary">${escapeHtml(copy.openApp)}</a>
        </div>
      </div>
    </header>

    <main class="container">
      <section class="hero">
        <h1 class="hero-title">${escapeHtml(copy.heroTitle)}</h1>
        <p class="hero-sub">${escapeHtml(copy.heroSubtitle)}</p>

        <div class="filter-bar" role="toolbar" aria-label="${escapeHtml(copy.jumpLabel)}">
          ${filterButtonsHtml}
        </div>

        <nav class="index-grid" aria-label="${escapeHtml(copy.jumpLabel)}">
          ${quickIndexHtml}
        </nav>
      </section>

      <section class="scenarios" aria-label="${escapeHtml(copy.jumpLabel)}">
        ${scenarioCardsHtml}
      </section>

      <section class="bottom-cta">
        <p class="bottom-note">${escapeHtml(copy.footerNote)}</p>
        <a href="${escapeHtml(appHomeHref)}" class="cta-primary">${escapeHtml(copy.openApp)}</a>
      </section>

      <footer class="footer">
        <nav class="footer-langs" aria-label="Language">
          ${footerLangLinksHtml}
        </nav>
        <div class="footer-meta">
          <span>${SITE_NAME} · Ver ${escapeHtml(appVersion)}</span>
          <div class="footer-links">
            <a href="${escapeHtml(appHomeHref)}">${escapeHtml(copy.backToTop)}</a>
            <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub (Apache-2.0)</a>
          </div>
        </div>
      </footer>
    </main>

    <script>
      (function () {
        var select = document.getElementById('help-lang-select');
        if (select) {
          select.addEventListener('change', function () {
            if (select.value) window.location.assign(select.value);
          });
        }
        var buttons = document.querySelectorAll('.filter-btn');
        var cards = document.querySelectorAll('.scenario-card');
        var items = document.querySelectorAll('.index-item');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].addEventListener('click', function () {
            var target = this.getAttribute('data-filter') || 'all';
            for (var j = 0; j < buttons.length; j++) {
              var active = buttons[j] === this;
              buttons[j].classList.toggle('is-active', active);
              buttons[j].setAttribute('aria-pressed', active ? 'true' : 'false');
            }
            for (var k = 0; k < cards.length; k++) {
              var cat = cards[k].getAttribute('data-category');
              cards[k].hidden = target !== 'all' && cat !== target;
            }
            for (var m = 0; m < items.length; m++) {
              var icat = items[m].getAttribute('data-category');
              items[m].hidden = target !== 'all' && icat !== target;
            }
          });
        }
      })();
    </script>
  </body>
</html>
`;
}
