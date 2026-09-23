import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'jlpt-learning-list-'));
after(() => rm(directory, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { LearningList, LearningListRow } from './src/components/LearningList';
    import { LearningCatalog } from './src/components/LearningCatalog';
    import { LearningListColumns, LearningListMetadata } from './src/components/LearningListMetadata';
    export function renderCase(kind, locale = 'zh-CN', mobile = false) {
      globalThis.window = { matchMedia: () => ({ matches: mobile }) };
      if (kind === 'metadata-empty') return renderToStaticMarkup(<LearningList locale={locale} columns={<LearningListColumns locale={locale} title="句型" collectionLabel="语法本"/>}/>);
      if (kind === 'catalog-empty') return renderToStaticMarkup(<LearningCatalog locale={locale} title="听力题库" items={[]} hasActions columnLabels={['音频','题型',null]} searchText={String} renderRow={() => null}/>);
      if (kind === 'actions') return renderToStaticMarkup(<LearningList columnLabels={['任务','时间','状态']} hasActions><LearningListRow title="复习" description="10 分钟" status="待完成" onOpen={() => {}} inlineActions secondary={<button type="button">分享</button>} trailing={<input type="checkbox" aria-label="完成"/>}/></LearningList>);
      if (kind === 'selection') return renderToStaticMarkup(<LearningList columnLabels={['名称','分类','状态']} selection={{ selected: new Set(['a']), toggle() {}, setMany() {} }}><LearningListRow selectId="a" title="規制" onOpen={() => {}}/><LearningListRow selectId="b" title="緩和" onOpen={() => {}}/><LearningListRow title="固定" onOpen={() => {}}/></LearningList>);
      if (kind === 'metadata') return renderToStaticMarkup(<LearningList columns={<LearningListColumns locale={locale} title="单词" collectionLabel="单词本" showPartOfSpeech/>}><LearningListRow title="規制" onOpen={() => {}} metadata={<LearningListMetadata locale={locale} addedAt="2026-09-22" collectionLabel="单词本" collection="N1" showPartOfSpeech partOfSpeech="名詞"/>}/></LearningList>);
      return renderToStaticMarkup(<LearningList locale={locale} columnLabels={['名称','分类','状态']}>{[null, false, []]}</LearningList>);
    }
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const file = join(directory, 'render.mjs');
await writeFile(file, outputFiles[0].text);
const { renderCase } = await import(pathToFileURL(file));

test('empty lists keep their schema and exactly one empty row', () => {
  for (const kind of ['metadata-empty', 'catalog-empty', 'standard-empty']) {
    for (const [locale, message] of [['zh-CN', '没有数据'], ['ja', 'データがありません'], ['en', 'No data']]) {
      for (const mobile of [false, true]) {
        const html = renderCase(kind, locale, mobile);
        assert.match(html, /(?:list-column-header|standard-list-header)/);
        assert.equal((html.match(/role="listitem"/g) ?? []).length, 1);
        assert.equal(html.split(message).length - 1, 1);
        assert.doesNotMatch(html, /catalog-notice|list-pagination/);
      }
    }
  }
});

test('row actions remain separate from the open button and status remains readable', () => {
  const html = renderCase('actions');
  assert.match(html, /待完成/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /standard-list-actions/);
  assert.match(html, /分享/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
});

test('vocabulary preserves part of speech and month/day dates', () => {
  const html = renderCase('metadata');
  assert.match(html, /词性/);
  assert.match(html, /名詞/);
  assert.match(html, /datetime="2026-09-22"/i);
  const time = html.match(/<time[^>]*>([^<]*)<\/time>/)?.[1];
  assert.ok(time);
  assert.doesNotMatch(time, /2026|:/);
});

test('batch mode adds one labelled checkbox per selectable row', () => {
  const html = renderCase('selection');
  assert.match(html, /is-selecting/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.match(html, /aria-label="选择：規制"/);
  assert.equal((html.match(/list-selectable is-selected/g) ?? []).length, 1);
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 3);
});
