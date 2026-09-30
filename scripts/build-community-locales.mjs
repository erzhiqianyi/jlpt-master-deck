import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { articles as chineseArticles } from './build-community-articles.mjs';
import { articleTranslations } from './community-translations.mjs';

const origin = 'https://jlpt.erzhiqian.cc';
const slugs = ['ai-integration', ...chineseArticles.map((article) => article.slug)];
const paths = ['/community/', '/community/topics/ai-learning/', '/articles/', ...slugs.map((slug) => `/articles/${slug}/`)];
const sourceBySlug = Object.fromEntries(chineseArticles.map((article) => [article.slug, article]));
const translations = {
  en: { html: 'en', nav: ['Community', 'All articles', 'Start learning'], home: 'Home', topic: 'AI-assisted learning', back: 'Back to the topic', example: 'A concrete example', worked: 'What a good result looks like', request: 'A prompt you can use', steps: 'Three practical steps', check: 'Where to check the result', caution: 'What to watch for', sources: 'Sources', focus: 'One goal for this article', sample: 'Illustrative example, not your study record', output: 'Illustrative result; verify against real data', read: 'Read article', section: 'Explore the series', catalog: 'All public articles', catalogLead: 'Practical guides organized by topic. Read without signing in; sign in only to work with your own study records.', communityTitle: 'JLPT learning community', communityLead: 'Focused guides to studying Japanese with your own records and AI tools. Articles are open to everyone.', topicTitle: 'One module, one real question.', topicLead: 'Start with the connection guide, then try vocabulary, grammar, reading, listening, practice, and planning. The last two articles cover dots and scheduled work.', sourceIntro: 'Connect and verify a read', more: 'More in this series', allNine: 'View all 9 articles', next: 'Next article', overview: 'From MCP authorization to saved study results, one task at a time.', updated: 'Public articles only; no user posts or comments.' },
  ja: { html: 'ja', nav: ['コミュニティ', '記事一覧', '学習を始める'], home: 'ホーム', topic: 'AI と学ぶ', back: '特集に戻る', example: '具体的な例', worked: 'よい結果の形', request: 'AI への依頼例', steps: '進め方の三段階', check: '結果の確認先', caution: '注意点', sources: '参考資料', focus: 'この記事で行うこと', sample: '説明用の例・あなたの学習記録ではありません', output: '説明用の結果・実際のデータで確認してください', read: '記事を読む', section: '特集を読む', catalog: '公開記事一覧', catalogLead: 'テーマ別の実践ガイドです。記事はログイン不要で読めます。自分の学習記録を使うときにログインしてください。', communityTitle: 'JLPT 学習コミュニティ', communityLead: '日本語学習の課題を一つずつ扱うガイドです。記事はどなたでも読めます。', topicTitle: '一つの分野、一つの課題。', topicLead: '接続から始め、語彙、文法、読解、聴解、練習、計画へ。最後の二記事で dot と定期タスクを扱います。', sourceIntro: 'MCP の認可と読み取りを確認', more: 'この特集の続き', allNine: '全9記事を見る', next: '次の記事', overview: 'MCP の認可から保存結果まで、一つずつ試しましょう。', updated: '記事と特集のみ。投稿やコメントはありません。' },
};
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const localizedPath = (language, path) => language === 'zh-CN' ? path : `/${language}${path}`;
const alternateLinks = (path) => ['zh-CN', 'ja', 'en'].map((language) => `<link rel="alternate" hreflang="${language}" href="${origin}${localizedPath(language, path)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${origin}${path}">`;
const languageSwitch = (path, current) => `<span class="locale-switch" data-community-languages aria-label="Language / 言語 / 语言">${[['zh-CN', '中文'], ['ja', '日本語'], ['en', 'English']].map(([language, label]) => `<a href="${localizedPath(language, path)}" lang="${language}" hreflang="${language}"${current === language ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</span>`;
const communityHeader = (language, path) => { const t = translations[language]; return `<header class="site-header"><div class="site-header-inner"><a class="brand" href="/"><img src="/jlpt-logo.svg" alt="">JLPT Master Deck</a><nav class="header-links" aria-label="Navigation"><a href="${localizedPath(language, '/community/')}">${t.nav[0]}</a><a href="${localizedPath(language, '/articles/')}">${t.nav[1]}</a><a class="header-cta" href="/#/home/questions">${t.nav[2]}</a>${languageSwitch(path, language)}</nav></div></header>`; };
const footer = (language) => `<footer class="site-footer"><div class="site-footer-inner"><span>© JLPT Master Deck · <a href="${localizedPath(language, '/community/')}">${translations[language].nav[0]}</a></span><span><a href="${localizedPath(language, '/articles/')}">${translations[language].nav[1]}</a> · <a href="/privacy/">Privacy</a></span></div></footer>`;
function pageHead(language, path, title, description, type, data) {
  const canonical = `${origin}${localizedPath(language, path)}`;
  return `<!doctype html><html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}｜JLPT Master Deck</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}">${alternateLinks(path)}<meta property="og:type" content="${type}"><meta property="og:site_name" content="JLPT Master Deck"><meta property="og:locale" content="${language === 'ja' ? 'ja_JP' : 'en_US'}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><link rel="icon" href="/jlpt-logo.svg" type="image/svg+xml"><link rel="stylesheet" href="/articles/articles.css"><script type="application/ld+json">${json(data)}</script></head><body>`;
}
function crumbs(language, path, label, article = false) {
  const t = translations[language];
  const items = [[t.home, '/'], [t.nav[0], '/community/']];
  if (article) items.push([t.topic, '/community/topics/ai-learning/']);
  items.push([label, path]);
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${items.map(([name, item], index) => `${index ? '<span>›</span>' : ''}<a href="${item === '/' ? '/' : localizedPath(language, item)}"${index === items.length - 1 ? ' aria-current="page"' : ''}>${escape(name)}</a>`).join('')}</nav>`;
}
function writePage(language, path, html) {
  const directory = resolve('public', language, path.slice(1));
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'index.html'), html);
}
function directoryCards(language) {
  const t = translations[language];
  return slugs.map((slug, index) => { const article = articleTranslations[language][slug]; return `<a href="${localizedPath(language, `/articles/${slug}/`)}"><span class="eyebrow">${String(index + 1).padStart(2, '0')} · ${escape(article.module)}</span><h3>${escape(article.title)}</h3><p>${escape(article.description)}</p><span class="read">${t.read} →</span></a>`; }).join('');
}
function officialSourceLabel(language, href) {
  const key = href.split('/').filter(Boolean).at(-1);
  const labels = {
    'tasks-and-memory': ['Dot tasks and memory', 'dot のタスクと記憶'],
    controls: ['Control your dot', 'dot の管理'],
    'computers-and-apps': ['Connect computers and apps', 'コンピューターとアプリの接続'],
    quickstart: ['Plugin quickstart', 'プラグインのクイックスタート'],
    dots: ['Meet dots', 'dots について'],
  };
  return labels[key]?.[language === 'ja' ? 1 : 0] ?? 'OpenAI documentation';
}
function renderDirectories(language) {
  const t = translations[language];
  const topicPath = '/community/topics/ai-learning/';
  const communityPath = '/community/';
  const articlesPath = '/articles/';
  const topicData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.topic, url: `${origin}${localizedPath(language, topicPath)}`, inLanguage: language, hasPart: slugs.map((slug) => ({ '@type': 'Article', headline: articleTranslations[language][slug].title, url: `${origin}${localizedPath(language, `/articles/${slug}/`)}` })) };
  const communityData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.communityTitle, url: `${origin}${localizedPath(language, communityPath)}`, inLanguage: language, hasPart: [{ '@type': 'CollectionPage', name: t.topic, url: `${origin}${localizedPath(language, topicPath)}` }] };
  const archiveData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.catalog, url: `${origin}${localizedPath(language, articlesPath)}`, inLanguage: language, hasPart: slugs.map((slug) => ({ '@type': 'Article', headline: articleTranslations[language][slug].title, url: `${origin}${localizedPath(language, `/articles/${slug}/`)}` })) };
  writePage(language, communityPath, `${pageHead(language, communityPath, t.communityTitle, t.communityLead, 'website', communityData)}${communityHeader(language, communityPath)}<main><section class="community-hero"><div class="community-wrap"><span class="eyebrow">JLPT Master Deck · ${t.nav[0]}</span><h1>${t.communityTitle}</h1><p>${t.communityLead}</p><a class="button" href="#topics">${t.section} ↓</a></div></section><section class="community-wrap community-section" id="topics"><div class="section-heading"><div><span class="eyebrow">Topic 01</span><h2>${t.topic}</h2></div><a href="${localizedPath(language, articlesPath)}">${t.nav[1]} →</a></div><a class="topic-feature" href="${localizedPath(language, topicPath)}"><div class="topic-feature-copy"><span class="eyebrow">AI × JLPT</span><h3>${t.topicTitle}</h3><p>${t.overview}</p><span class="read">${t.section} →</span></div><img src="/images/ai-guide/learning-flow.png" width="1536" height="640" alt="${language === 'ja' ? 'AI と JLPT 学習の流れ' : 'AI-assisted JLPT learning flow'}"></a></section><section class="community-wrap community-section"><div class="section-heading"><div><span class="eyebrow">Read now</span><h2>${t.more}</h2></div><a href="${localizedPath(language, topicPath)}">${t.allNine} →</a></div><div class="article-list">${['ai-integration', 'ai-vocabulary-notes', 'dots-jlpt-connection'].map((slug) => { const article = articleTranslations[language][slug]; return `<a href="${localizedPath(language, `/articles/${slug}/`)}"><span class="eyebrow">${escape(article.module)}</span><h3>${escape(article.title)}</h3><p>${escape(article.description)}</p><span class="read">${t.read} →</span></a>`; }).join('')}</div></section><section class="community-wrap community-section"><div class="community-note"><strong>${t.topic}</strong><p>${t.updated}</p></div></section></main>${footer(language)}</body></html>`);
  writePage(language, topicPath, `${pageHead(language, topicPath, t.topic, t.topicLead, 'website', topicData)}${communityHeader(language, topicPath)}<main>${crumbs(language, topicPath, t.topic)}<section class="hero"><div class="hero-inner"><span class="eyebrow">Topic 01 · AI</span><h1>${t.topicTitle}</h1><p>${t.topicLead}</p><div class="topic-path"><span>01 · ${t.sourceIntro}</span><span>02–07 · ${t.topic}</span><span>08–09 · dots</span></div></div></section><section class="community-wrap community-section"><div class="section-heading"><div><span class="eyebrow">Read in order</span><h2>${t.section} · 9</h2></div><a href="${localizedPath(language, communityPath)}">${t.back} →</a></div><div class="article-list">${directoryCards(language)}</div></section></main>${footer(language)}</body></html>`);
  writePage(language, articlesPath, `${pageHead(language, articlesPath, t.catalog, t.catalogLead, 'website', archiveData)}${communityHeader(language, articlesPath)}<main><section class="hero"><div class="hero-inner"><span class="eyebrow">JLPT Master Deck · ${t.nav[0]}</span><h1>${t.catalog}</h1><p>${t.catalogLead}</p><div class="hero-actions"><a class="button secondary" href="${localizedPath(language, communityPath)}">${t.nav[0]} →</a></div></div></section><section class="community-wrap community-section"><div class="section-heading"><div><span class="eyebrow">${t.topic}</span><h2>${t.section} · 9</h2></div><a href="${localizedPath(language, topicPath)}">${t.topic} →</a></div><div class="article-list">${directoryCards(language)}</div></section></main>${footer(language)}</body></html>`);
}
function comparisonSection(language, article) {
  if (!article.comparison) return '';
  const labels = language === 'ja' ? ['決まった時刻', '継続的なフォロー'] : ['Fixed time', 'Ongoing follow-through'];
  return `<section class="article-comparison" id="difference"><h2>${escape(article.comparison.title)}</h2><div class="comparison-grid"><div><strong>${labels[0]}</strong><p>${escape(article.comparison.scheduled)}</p></div><div><strong>${labels[1]}</strong><p>${escape(article.comparison.dot)}</p></div></div><p class="comparison-boundary">${escape(article.comparison.boundary)}</p></section>`;
}
function renderArticle(language, slug, index) {
  const t = translations[language];
  const article = articleTranslations[language][slug];
  const source = sourceBySlug[slug];
  const path = `/articles/${slug}/`;
  const canonical = `${origin}${localizedPath(language, path)}`;
  const structured = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.description, inLanguage: language, mainEntityOfPage: canonical, publisher: { '@type': 'Organization', name: 'JLPT Master Deck', url: `${origin}/` }, isPartOf: { '@type': 'CollectionPage', name: t.topic, url: `${origin}${localizedPath(language, '/community/topics/ai-learning/')}` } };
  const next = slugs[index + 1];
  const sourceLinks = source?.sources?.map(([, href]) => `<li><a href="${escape(href)}" rel="noopener noreferrer">${escape(officialSourceLabel(language, href))}</a></li>`).join('') ?? '';
  const result = `${pageHead(language, path, article.title, article.description, 'article', structured)}<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [[t.home, '/'], [t.nav[0], '/community/'], [t.topic, '/community/topics/ai-learning/'], [article.title, path]].map(([name, url], position) => ({ '@type': 'ListItem', position: position + 1, name, item: `${origin}${url === '/' ? '/' : localizedPath(language, url)}` })) })}</script>${communityHeader(language, path)}<main><section class="hero"><div class="hero-inner"><span class="eyebrow">${escape(t.topic)} · ${escape(article.module)}</span><h1>${escape(article.title)}</h1><p>${escape(article.lead)}</p><div class="hero-actions"><a class="button" href="#example">${t.example} ↓</a><a class="button secondary" href="${localizedPath(language, '/community/topics/ai-learning/')}">${t.back}</a></div></div></section>${crumbs(language, path, article.title, true)}<div class="article-layout"><article class="article"><div class="callout"><strong>${t.focus}</strong><p>${escape(article.focus)}</p></div>${comparisonSection(language, article)}<h2 id="example">${t.example}</h2><div class="example"><span>${t.sample}</span><p>${escape(article.sample)}</p></div><h2 id="worked">${t.worked}</h2><div class="example"><span>${t.output}</span><p>${escape(article.worked)}</p></div><h2 id="request">${t.request}</h2><blockquote class="article-prompt">${escape(article.prompt)}</blockquote><h2 id="process">${t.steps}</h2><ol class="steps">${article.steps.map((step) => `<li><p>${escape(step)}</p></li>`).join('')}</ol><h2 id="check">${t.check}</h2><p>${escape(article.result)}</p><a class="button" href="${article.appHref ?? source?.appHref ?? '/#/about/connect'}">${t.nav[2]} →</a><h2 id="notice">${t.caution}</h2><p>${escape(article.caution)}</p>${sourceLinks ? `<h2 id="sources">${t.sources}</h2><ul>${sourceLinks}</ul>` : ''}<div class="article-footer"><a href="${localizedPath(language, '/community/topics/ai-learning/')}">${t.back}</a>${next ? `<a href="${localizedPath(language, `/articles/${next}/`)}">${t.next}: ${escape(articleTranslations[language][next].module)} →</a>` : ''}</div></article><aside class="toc" aria-label="Contents"><strong>${escape(article.module)}</strong>${[...(article.comparison ? [['difference', article.comparison.title]] : []), ['example', t.example], ['worked', t.worked], ['request', t.request], ['process', t.steps], ['check', t.check], ['notice', t.caution], ...(sourceLinks ? [['sources', t.sources]] : [])].map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}<a href="${localizedPath(language, '/community/topics/ai-learning/')}">← ${t.topic}</a></aside></div></main>${footer(language)}</body></html>`;
  writePage(language, path, result);
}
for (const language of ['en', 'ja']) {
  for (const slug of slugs) if (!articleTranslations[language]?.[slug]) throw new Error(`Missing ${language} article ${slug}`);
  renderDirectories(language);
  slugs.forEach((slug, index) => renderArticle(language, slug, index));
}
for (const path of paths) {
  const file = resolve('public', path.slice(1), 'index.html');
  let html = readFileSync(file, 'utf8');
  if (!html.includes('hreflang="x-default"')) html = html.replace(/(<link rel="canonical"[^>]+>)/, `$1${alternateLinks(path)}`);
  if (!html.includes('data-community-languages')) html = html.replace('</nav>', `${languageSwitch(path, 'zh-CN')}</nav>`);
  writeFileSync(file, html);
}
const urls = ['/', ...paths, ...['ja', 'en'].flatMap((language) => paths.map((path) => localizedPath(language, path)))];
writeFileSync(resolve('public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Generated ${paths.length * 2} translated community pages and updated ${paths.length} Chinese pages.`);
