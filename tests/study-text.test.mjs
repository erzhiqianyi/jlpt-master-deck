import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-study-text-'));
after(() => rm(directory, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import { renderToStaticMarkup } from 'react-dom/server';
    import { StudyText } from './src/components/StudyText';
    export const render = (text, ruby = false) => renderToStaticMarkup(<StudyText text={text} renderText={ruby ? (value) => <ruby>{value}<rt>よみ</rt></ruby> : undefined} />);
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  loader: { '.css': 'empty' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { render } = await import(pathToFileURL(file));

test('legacy memory notes get real line breaks and separate section headings', () => {
  const html = render('【核心结构】A が早いか、B。\\n【后件限制】实际发生的事实。');
  assert.match(html, /<h4>核心结构<\/h4><p>A が早いか、B。<\/p><h4>后件限制<\/h4>/);
  assert.ok(!html.includes('\\n'));
  assert.match(render('第一行\n第二行\n\n新段落'), /<p>第一行\n第二行<\/p><p>新段落<\/p>/);
});

test('simple formatting and ruby callbacks coexist', () => {
  const html = render('## 接续\n**普通形**\n- 第一条\n- 第二条\n3. 第三步\n4. 第四步', true);
  assert.match(html, /<h4><ruby>接续/);
  assert.match(html, /<strong><ruby>普通形/);
  assert.match(html, /<ul><li>/);
  assert.match(html, /<ol start="3"><li>/);
});

test('unrecognized syntax and HTML stay text, code keeps literal escapes', () => {
  const html = render('【未闭合\n<script>alert(1)</script>\n`\\n`');
  assert.match(html, /【未闭合/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<code>\\n<\/code>/);
  assert.ok(!html.includes('<script>'));
});
