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
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `import { renderToStaticMarkup } from 'react-dom/server'; import { ReadingExplanation } from './src/features/reading/ReadingExplanation'; export const render = (item, locale='zh-CN') => renderToStaticMarkup(<ReadingExplanation item={item} locale={locale} />);` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(dir, 'render.mjs'); await writeFile(file, outputFiles[0].text);
const { render } = await import(pathToFileURL(file));
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
