import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

interface SeoLocaleDictionary {
  meta: {
    title: string;
    description: string;
    siteName: string;
    ogImageAlt: string;
    appDescription: string;
  };
  loading: {
    introHeading: string;
    introDescPrefix: string;
    introDescFormatExample: string;
    introDescSuffix: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
  };
  faq: {
    heading: string;
    subheading: string;
    q1: string;
    a1: string;
    q2: string;
    a2: string;
    q3: string;
    a3: string;
    q4: string;
    a4: string;
    q5: string;
    a5: string;
  };
}

const DEFAULT_SITE_URL = 'https://youtube-video-chapter-marker.vercel.app';

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

function buildJsonLd(
  dict: SeoLocaleDictionary,
  canonicalUrl: string,
  siteUrl: string,
  appVersion: string,
  inLanguage: string | string[]
): Record<string, unknown> {
  const faqPairs: Array<[string, string]> = [
    [dict.faq.q1, dict.faq.a1],
    [dict.faq.q2, dict.faq.a2],
    [dict.faq.q3, dict.faq.a3],
    [dict.faq.q4, dict.faq.a4],
    [dict.faq.q5, dict.faq.a5],
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: dict.meta.siteName,
        url: canonicalUrl,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        softwareVersion: appVersion,
        browserRequirements: 'Requires a modern web browser with HTML5 video support',
        inLanguage,
        isAccessibleForFree: true,
        description: dict.meta.appDescription,
        image: `${siteUrl}/og-image.png`,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqPairs.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: a,
          },
        })),
      },
    ],
  };
}

function buildPreHydrationMarkup(dict: SeoLocaleDictionary): string {
  const introDesc = `${dict.loading.introDescPrefix}${dict.loading.introDescFormatExample}${dict.loading.introDescSuffix}`;
  const faqPairs: Array<[string, string]> = [
    [dict.faq.q1, dict.faq.a1],
    [dict.faq.q2, dict.faq.a2],
    [dict.faq.q3, dict.faq.a3],
    [dict.faq.q4, dict.faq.a4],
    [dict.faq.q5, dict.faq.a5],
  ];

  const faqItemsHtml = faqPairs
    .map(
      ([q, a]) =>
        `<article class="px-5 py-4 border-b border-[#222730] last:border-b-0"><h3 class="text-sm font-medium text-[#E2E8F0]">${escapeHtml(q)}</h3><p class="mt-1.5 text-xs text-[#94A0B2] leading-relaxed">${escapeHtml(a)}</p></article>`
    )
    .join('');

  return [
    '<div class="min-h-screen bg-[#0D0F12] text-[#F3F5F8] flex flex-col">',
    '<header class="h-12 border-b border-[#222730] bg-[#111419] px-6 flex items-center justify-between">',
    `<span class="text-sm font-semibold tracking-tight">${escapeHtml(dict.meta.siteName)}</span>`,
    '<nav aria-label="Language" class="flex items-center gap-4 text-xs text-[#94A0B2]">',
    '<a href="/en/" hreflang="en" class="hover:text-[#F3F5F8]">English</a>',
    '<a href="/ja/" hreflang="ja" class="hover:text-[#F3F5F8]">日本語</a>',
    '</nav>',
    '</header>',
    '<main class="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12">',
    `<h1 class="text-2xl sm:text-3xl font-semibold text-[#F3F5F8] tracking-tight">${escapeHtml(dict.loading.introHeading)}</h1>`,
    `<p class="mt-3 text-sm sm:text-base text-[#94A0B2] max-w-2xl leading-relaxed">${escapeHtml(introDesc)}</p>`,
    '<section class="mt-8 pt-6 border-t border-[#222730] grid grid-cols-1 md:grid-cols-3 gap-6">',
    `<div><h2 class="text-xs font-mono text-[#647082] mb-1">${escapeHtml(dict.loading.step1Title)}</h2><p class="text-xs text-[#94A0B2] leading-relaxed">${escapeHtml(dict.loading.step1Desc)}</p></div>`,
    `<div><h2 class="text-xs font-mono text-[#647082] mb-1">${escapeHtml(dict.loading.step2Title)}</h2><p class="text-xs text-[#94A0B2] leading-relaxed">${escapeHtml(dict.loading.step2Desc)}</p></div>`,
    `<div><h2 class="text-xs font-mono text-[#647082] mb-1">${escapeHtml(dict.loading.step3Title)}</h2><p class="text-xs text-[#94A0B2] leading-relaxed">${escapeHtml(dict.loading.step3Desc)}</p></div>`,
    '</section>',
    `<section class="mt-10 pt-8 border-t border-[#222730]"><h2 class="text-sm font-semibold text-[#F3F5F8]">${escapeHtml(dict.faq.heading)}</h2><p class="mt-1 text-xs text-[#7D899B]">${escapeHtml(dict.faq.subheading)}</p><div class="mt-4 rounded-xl border border-[#222730] bg-[#14171C]">${faqItemsHtml}</div></section>`,
    '</main>',
    '</div>',
  ].join('');
}

function renderSeoHtml(params: {
  baseHtml: string;
  locale: 'en' | 'ja';
  ogLocale: string;
  ogAlternateLocale: string;
  canonicalUrl: string;
  siteUrl: string;
  appVersion: string;
  dict: SeoLocaleDictionary;
  isSubdir: boolean;
  inLanguage: string | string[];
}): string {
  const {
    baseHtml,
    locale,
    ogLocale,
    ogAlternateLocale,
    canonicalUrl,
    siteUrl,
    appVersion,
    dict,
    isSubdir,
    inLanguage,
  } = params;

  const ogImageUrl = `${siteUrl}/og-image.png`;
  const titleEsc = escapeHtml(dict.meta.title);
  const descEsc = escapeHtml(dict.meta.description);
  const siteNameEsc = escapeHtml(dict.meta.siteName);
  const ogAltEsc = escapeHtml(dict.meta.ogImageAlt);

  let html = baseHtml;

  html = html.replace(/<html\b[^>]*>/i, `<html lang="${locale}" dir="ltr" class="dark">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleEsc}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${descEsc}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"[\s\S]*?\/>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en"[\s\S]*?\/>/i,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(`${siteUrl}/en/`)}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="ja"[\s\S]*?\/>/i,
    `<link rel="alternate" hreflang="ja" href="${escapeHtml(`${siteUrl}/ja/`)}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="x-default"[\s\S]*?\/>/i,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${siteUrl}/`)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:site_name"[\s\S]*?\/>/i,
    `<meta property="og:site_name" content="${siteNameEsc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${titleEsc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${descEsc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"[\s\S]*?\/>/i,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:locale"[\s\S]*?\/>/i,
    `<meta property="og:locale" content="${ogLocale}" />`
  );
  html = html.replace(
    /<meta\s+property="og:locale:alternate"[\s\S]*?\/>/i,
    `<meta property="og:locale:alternate" content="${ogAlternateLocale}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image"[\s\S]*?\/>/i,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image:alt"[\s\S]*?\/>/i,
    `<meta property="og:image:alt" content="${ogAltEsc}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
    `<meta name="twitter:title" content="${titleEsc}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
    `<meta name="twitter:description" content="${descEsc}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"[\s\S]*?\/>/i,
    `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image:alt"[\s\S]*?\/>/i,
    `<meta name="twitter:image:alt" content="${ogAltEsc}" />`
  );

  const jsonLd = serializeJsonLd(buildJsonLd(dict, canonicalUrl, siteUrl, appVersion, inLanguage));
  html = html.replace(
    /<script\s+id="seo-json-ld"\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script id="seo-json-ld" type="application/ld+json">${jsonLd}</script>`
  );

  if (isSubdir) {
    html = html
      .replace(/(src|href)="\.\/assets\//g, '$1="../assets/')
      .replace(/href="\/favicon\.svg"/g, 'href="../favicon.svg"');
  }

  const preHydration = buildPreHydrationMarkup(dict);
  html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${preHydration}</div>`);

  return html;
}

function buildSitemapXml(siteUrl: string): string {
  const urls = [
    {loc: `${siteUrl}/`, priority: '1.0'},
    {loc: `${siteUrl}/en/`, priority: '0.9'},
    {loc: `${siteUrl}/ja/`, priority: '0.9'},
  ];

  const entries = urls
    .map(
      ({loc, priority}) => `  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}/en/" />
    <xhtml:link rel="alternate" hreflang="ja" href="${siteUrl}/ja/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/" />
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

export default defineConfig(({command}) => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
  ) as {version?: string};
  const appVersion = pkg.version ?? '1.0.0';

  const rawSiteUrl = (process.env.VITE_SITE_URL ?? '').trim();
  const siteUrl =
    rawSiteUrl && /^https?:\/\//i.test(rawSiteUrl)
      ? rawSiteUrl.replace(/\/+$/, '')
      : DEFAULT_SITE_URL;

  return {
    base: process.env.VITE_BASE_PATH ?? (command === 'build' ? './' : '/'),
    publicDir: false as const,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Copies public/ SEO assets and generates static localized HTML pages
      // (/index.html, /en/index.html, /ja/index.html) plus robots.txt & sitemap.xml.
      {
        name: 'generate-seo-dist',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const distIndexPath = path.join(distDir, 'index.html');
          if (!fs.existsSync(distIndexPath)) {
            return;
          }

          // 1. Copy public/ files (favicon.svg, og-image.png, etc.) because publicDir is false
          const publicDir = path.resolve(__dirname, 'public');
          if (fs.existsSync(publicDir)) {
            for (const entry of fs.readdirSync(publicDir, {withFileTypes: true})) {
              const srcPath = path.join(publicDir, entry.name);
              const destPath = path.join(distDir, entry.name);
              if (entry.isFile()) {
                fs.copyFileSync(srcPath, destPath);
              }
            }
          }

          // 2. Write environment-aware robots.txt and multilingual sitemap.xml
          fs.writeFileSync(
            path.join(distDir, 'robots.txt'),
            `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
            'utf-8'
          );
          fs.writeFileSync(
            path.join(distDir, 'sitemap.xml'),
            buildSitemapXml(siteUrl),
            'utf-8'
          );

          // 3. Generate prerendered SEO HTML for root (/), /en/, and /ja/
          const baseHtml = fs.readFileSync(distIndexPath, 'utf-8');
          const enDict = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, 'src/i18n/locales/en.json'), 'utf-8')
          ) as SeoLocaleDictionary;
          const jaDict = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, 'src/i18n/locales/ja.json'), 'utf-8')
          ) as SeoLocaleDictionary;

          const rootHtml = renderSeoHtml({
            baseHtml,
            locale: 'en',
            ogLocale: 'en_US',
            ogAlternateLocale: 'ja_JP',
            canonicalUrl: `${siteUrl}/`,
            siteUrl,
            appVersion,
            dict: enDict,
            isSubdir: false,
            inLanguage: ['en', 'ja'],
          });
          fs.writeFileSync(distIndexPath, rootHtml, 'utf-8');

          const enDir = path.join(distDir, 'en');
          fs.mkdirSync(enDir, {recursive: true});
          fs.writeFileSync(
            path.join(enDir, 'index.html'),
            renderSeoHtml({
              baseHtml,
              locale: 'en',
              ogLocale: 'en_US',
              ogAlternateLocale: 'ja_JP',
              canonicalUrl: `${siteUrl}/en/`,
              siteUrl,
              appVersion,
              dict: enDict,
              isSubdir: true,
              inLanguage: 'en',
            }),
            'utf-8'
          );

          const jaDir = path.join(distDir, 'ja');
          fs.mkdirSync(jaDir, {recursive: true});
          fs.writeFileSync(
            path.join(jaDir, 'index.html'),
            renderSeoHtml({
              baseHtml,
              locale: 'ja',
              ogLocale: 'ja_JP',
              ogAlternateLocale: 'en_US',
              canonicalUrl: `${siteUrl}/ja/`,
              siteUrl,
              appVersion,
              dict: jaDict,
              isSubdir: true,
              inLanguage: 'ja',
            }),
            'utf-8'
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
