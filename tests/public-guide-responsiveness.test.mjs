import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

// These are source/DOM regressions, not rendered viewport or contrast checks.
const root = resolve('public');
const slugs = ['ai-integration', 'ai-vocabulary-notes', 'ai-grammar-comparison', 'ai-reading-unknown-word', 'ai-listening-shadowing', 'ai-daily-practice', 'ai-study-plan', 'dots-jlpt-connection', 'dots-scheduled-practice'];
const guidePaths = ['/community/', '/community/topics/ai-learning/', '/articles/', ...slugs.map(slug => `/articles/${slug}/`)];
const localized = (locale, path) => locale === 'zh-CN' ? path : `/${locale}${path}`;
const routes = ['zh-CN', 'en', 'ja'].flatMap(locale => guidePaths.map(path => localized(locale, path)));
const read = (path, base = root) => readFileSync(join(base, path, 'index.html'), 'utf8');
const htmlFiles = base => readdirSync(base, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? htmlFiles(join(base, entry.name)) : entry.name.endsWith('.html') ? [join(base, entry.name)] : []);

test('all 39 public routes and three language destinations remain reachable in the source tree', () => {
  assert.equal(htmlFiles(root).length, 39);
  for (const locale of ['zh-CN', 'en', 'ja']) {
    for (const path of guidePaths) {
      const document = new JSDOM(read(localized(locale, path))).window.document;
      const languages = [...document.querySelectorAll('[data-community-languages] a')];
      assert.equal(languages.length, 3, path);
      assert.deepEqual(languages.map(link => link.lang), ['zh-CN', 'ja', 'en']);
      assert.equal(languages.filter(link => link.getAttribute('aria-current') === 'page').length, 1);
      for (const link of languages) assert.equal(link.getAttribute('href'), localized(link.lang, path));
      assert.equal(document.querySelector('.header-cta').getAttribute('href'), '/#/home/questions');
      assert.equal(document.querySelectorAll('.skip-link').length, 1);
      assert.equal(document.querySelectorAll('#main-content').length, 1);
    }
  }
  for (const route of ['/privacy/', '/terms/', '/support/']) assert.ok(existsSync(join(root, route, 'index.html')));
});

test('all hubs link directly to nine articles and each article has early mobile contents', () => {
  for (const locale of ['zh-CN', 'en', 'ja']) {
    const document = new JSDOM(read(localized(locale, '/community/'))).window.document;
    assert.deepEqual([...document.querySelectorAll('.article-list > a')].map(link => link.getAttribute('href')), slugs.map(slug => localized(locale, `/articles/${slug}/`)));
    for (const slug of slugs) {
      const document = new JSDOM(read(localized(locale, `/articles/${slug}/`))).window.document;
      const contents = document.querySelector('.mobile-toc');
      assert.equal(contents.tagName, 'DETAILS');
      assert.ok(contents.querySelector('summary').textContent.trim());
      assert.equal(contents.hasAttribute('open'), false);
      assert.equal(document.querySelector('.article-layout').firstElementChild, contents);
      assert.ok(contents.querySelectorAll('a').length >= 5);
      assert.ok(document.querySelector('article .button[href^="/#/"]'));
    }
  }
});

test('public links, fragment targets, assets and structured metadata stay valid', () => {
  for (const file of htmlFiles(root)) {
    const document = new JSDOM(readFileSync(file, 'utf8')).window.document;
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(ids.length, new Set(ids).size, file);
    for (const node of document.querySelectorAll('a[href], link[href], img[src], script[src]')) {
      const href = node.getAttribute('href') ?? node.getAttribute('src');
      if (href.startsWith('#')) assert.ok(document.getElementById(href.slice(1)), `${file}: ${href}`);
      if (href.startsWith('/') && !href.startsWith('//')) {
        const path = new URL(href, 'https://example.test').pathname;
        if (path !== '/') assert.ok(existsSync(join(root, path)), `${file}: ${href}`);
      }
    }
    for (const data of document.querySelectorAll('script[type="application/ld+json"]')) assert.doesNotThrow(() => JSON.parse(data.textContent), file);
  }
});

test('responsive controls do not reinstate the nested Chinese-link or start-learning hiding regressions', () => {
  const css = readFileSync(join(root, 'articles/articles.css'), 'utf8');
  assert.doesNotMatch(css, /\.header-links\s+a:first-child\s*\{/);
  assert.doesNotMatch(css, /[^{}]*(?:header-cta|locale-switch)[^{}]*\{[^{}]*display:\s*none/);
  assert.match(css, /\.locale-switch a\s*\{[^{}]*min-width:\s*44px;[^{}]*min-height:\s*44px;/);
  assert.match(css, /\.header-links > a, \.header-cta\s*\{[^{}]*min-height:\s*44px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.article-prompt\s*\{[^{}]*margin-inline:\s*0/);
});

test('locale generation matches checked-in output and is idempotent without touching the working tree', () => {
  const temp = mkdtempSync(join(tmpdir(), 'jlpt-guide-regression-'));
  try {
    for (const directory of ['articles', 'community']) cpSync(join(root, directory), join(temp, 'public', directory), { recursive: true });
    const generate = () => execFileSync(process.execPath, [resolve('scripts/build-community-locales.mjs')], { cwd: temp, stdio: 'pipe' });
    generate();
    const first = routes.map(path => read(path, join(temp, 'public')));
    routes.forEach((path, index) => assert.equal(first[index], read(path), path));
    generate();
    routes.forEach((path, index) => assert.equal(read(path, join(temp, 'public')), first[index], path));
    assert.equal(readFileSync(join(temp, 'public/sitemap.xml'), 'utf8'), readFileSync(join(root, 'sitemap.xml'), 'utf8'));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
