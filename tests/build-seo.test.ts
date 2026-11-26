import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_LOCALES } from '../src/i18n/index.tsx';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
};

describe('Project configuration invariants', () => {
  it('preserves immutable metadata.json app name', () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8')) as {
      name: string;
    };
    assert.equal(metadata.name, 'Video Chapter Marker');
  });

  it('preserves Google AdSense script in index.html', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(
      html.includes('ca-pub-8666829667737106'),
      'Google AdSense script must be preserved in index.html'
    );
  });

  it('preserves exact Google Search Console verification file in public/', () => {
    const gscPath = path.join(ROOT, 'public/googleb5dcf5082a5a4463.html');
    assert.ok(fs.existsSync(gscPath), 'GSC verification file missing in public/');
    const content = fs.readFileSync(gscPath, 'utf8');
    assert.equal(content, 'google-site-verification: googleb5dcf5082a5a4463.html');
  });

  it('registers Vercel rewrites for every supported locale', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const rewriteSources = new Set(vercel.rewrites.map((r) => r.source));
    for (const loc of SUPPORTED_LOCALES) {
      assert.ok(rewriteSources.has(`/${loc.code}`), `Missing vercel rewrite for /${loc.code}`);
      assert.ok(rewriteSources.has(`/${loc.code}/`), `Missing vercel rewrite for /${loc.code}/`);
    }
  });
});

describe('Built dist/ SEO & static asset integrity', () => {
  it('verifies dist/index.html, robots.txt, sitemap.xml, and GSC file exist and are valid', () => {
    assert.ok(fs.existsSync(DIST_DIR), 'dist/ directory missing — run npm run build first');
    assert.ok(fs.existsSync(path.join(DIST_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(DIST_DIR, 'robots.txt')));
    assert.ok(fs.existsSync(path.join(DIST_DIR, 'sitemap.xml')));

    const distGsc = path.join(DIST_DIR, 'googleb5dcf5082a5a4463.html');
    assert.ok(fs.existsSync(distGsc), 'GSC verification file missing in dist/');
    assert.equal(
      fs.readFileSync(distGsc, 'utf8'),
      'google-site-verification: googleb5dcf5082a5a4463.html'
    );

    const distSitemap = fs.readFileSync(path.join(DIST_DIR, 'sitemap.xml'), 'utf8');
    const publicSitemap = fs.readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
    assert.equal(
      distSitemap,
      publicSitemap,
      'public/sitemap.xml is out of sync with dist/sitemap.xml'
    );
  });

  for (const loc of SUPPORTED_LOCALES) {
    it(`verifies generated SEO HTML for /${loc.code}/`, () => {
      const filePath = path.join(DIST_DIR, loc.code, 'index.html');
      assert.ok(fs.existsSync(filePath), `Missing generated HTML at ${filePath}`);
      const html = fs.readFileSync(filePath, 'utf8');

      assert.ok(
        html.includes(`<html lang="${loc.htmlLang}" dir="${loc.dir}"`),
        `[${loc.code}] Incorrect <html lang/dir>`
      );
      assert.ok(html.includes('ca-pub-8666829667737106'), `[${loc.code}] AdSense missing`);
      assert.ok(
        html.includes(`"softwareVersion":"${PKG.version}"`),
        `[${loc.code}] JSON-LD softwareVersion mismatch (expected ${PKG.version})`
      );

      const jsonLdMatch = /<script\s+id="seo-json-ld"\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(
        html
      );
      assert.ok(jsonLdMatch, `[${loc.code}] Missing seo-json-ld script`);
      const parsedLd = JSON.parse(jsonLdMatch[1]) as {
        '@graph': Array<{ '@type': string; mainEntity?: unknown[] }>;
      };
      const types = parsedLd['@graph'].map((node) => node['@type']);
      assert.ok(types.includes('WebApplication'), `[${loc.code}] Missing WebApplication JSON-LD`);
      assert.ok(types.includes('FAQPage'), `[${loc.code}] Missing FAQPage JSON-LD`);
    });
  }
});
