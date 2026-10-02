import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'reading-render-'));
after(() => rm(dir, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import { renderToStaticMarkup } from 'react-dom/server'; import { ReadingExplanation } from './src/features/reading/ReadingExplanation'; import { ReadingRubyProvider, ReadingText } from './src/features/reading/ReadingText'; import { WordLookupProvider } from './src/features/review/WordLookup'; export const render = (item, locale='zh-CN', enabled=false) => renderToStaticMarkup(<ReadingRubyProvider terms={item.rubyTerms ?? []} enabled={enabled}><ReadingExplanation item={item} locale={locale} /></ReadingRubyProvider>); export const renderText = (text, terms, enabled, lookup=false) => renderToStaticMarkup(<WordLookupProvider items={[]} captures={[]} locale="zh-CN" enabled={false} onCapture={async () => {}} authToken="" ttsProvider="browser"><ReadingRubyProvider terms={terms} enabled={enabled}><ReadingText text={text} lookup={lookup} /></ReadingRubyProvider></WordLookupProvider>);` },
  loader: { '.css': 'empty' }, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(dir, 'render.mjs'); await writeFile(file, outputFiles[0].text);
const { render, renderText } = await import(pathToFileURL(file));
const base = { choices: ['甲', '乙', '丙', '丁'], answerIndex: 1, explanation: '原有总解析' };
test('legacy overall explanation remains visible even with legacy nodes', () => {
  const html = render({ ...base, explanationNodes: [{ title: '旧小节', body: '旧解析' }], translationLines: [{ ja: '本文', zh: '旧翻译' }] });
  for (const content of ['原有总解析', '旧小节', '旧解析', '旧翻译', '2. 乙']) assert.ok(html.includes(content));
  assert.ok(!html.includes('干扰项类型'));
});
test('structured answers render all five sections with the correct choice and safe text', () => {
  const html = render({ ...base, passageTranslation: '全文译文<script>test</script>', choiceExplanations: base.choices.map((text, i) => ({ text, translation: `译文${i}`, analysis: `解析${i}`, evidence: `依据${i}`, errorType: i === 1 ? '' : `干扰${i}` })), readingAnalysis: { summary: '主旨内容', structure: '结构内容', keySentences: ['关键原句'] } });
  for (const content of ['全文翻译', '正确答案解析', '每个选项逐项分析', '原文依据', '干扰项类型', '原有总解析', '译文1', '解析1', '依据3', '干扰3', '主旨内容', '结构内容', '关键原句', '&lt;script&gt;']) assert.ok(html.includes(content), content);
  assert.ok(!html.includes('<script>'));
});
test('empty optional analysis omits empty sections and locales render', () => {
  const item = { ...base, passageTranslation: '', choiceExplanations: [], readingAnalysis: { summary: '', structure: '', keySentences: [] } };
  assert.ok(!render(item).includes('原文依据'));
  assert.ok(render(item, 'ja').includes('正解の解説'));
  assert.ok(render(item, 'en').includes('Correct answer explained'));
});

test('furigana uses explicit longest matches, preserves text and works with lookup fallback', () => {
  const terms = [{ text: '今日', reading: 'こんにち' }, { text: '今日は', reading: 'きょうは' }];
  assert.equal(renderText('今日は晴れ。', terms, false), '今日は晴れ。');
  for (const lookup of [false, true]) {
    const html = renderText('今日は晴れ。', terms, true, lookup);
    assert.ok(html.includes('<ruby>今日は<rp>(</rp><rt>きょうは</rt>'));
    assert.ok(!html.includes('こんにち'));
    if (lookup) assert.ok(html.includes('lookup-word'));
    else assert.ok(html.endsWith('晴れ。'));
  }
  assert.equal(renderText('<script>', [], true), '&lt;script&gt;');
});
test('Japanese explanation text has ruby but Chinese translation remains plain', () => {
  const item = { ...base, choices: ['東京', '大阪', '丙', '丁'], passageTranslation: '大阪与东京', translationLines: [{ ja: '大阪', zh: '大阪' }], rubyTerms: [{ text: '大阪', reading: 'おおさか' }] };
  const html = render(item, 'zh-CN', true);
  assert.ok(html.includes('<ruby>大阪<rp>(</rp><rt>おおさか</rt>'));
  assert.ok(html.includes('<p class="reading-translation">大阪</p>'));
  assert.ok(!render(item).includes('<ruby>'));
});
