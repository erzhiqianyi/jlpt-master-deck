import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "jlpt-market-"));
process.env.JLPT_DB_PATH = join(dir, "test.sqlite");
process.env.JLPT_REVIEW_DATA_PATH = join(dir, "data");
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, createReviewPackDraft, createDailyPracticeFromDraft, getDb, listWordbooks, getDailyPractice, getStudyState } =
  await import("./storage.mjs");
const {
  importPackage,
  importShare,
  userReviewData,
  sourcePackage,
  publishShare,
  listShares,
  withdrawShare,
  updateShare,
  shareDetail,
  validatePackage,
} = await import("./market.mjs");
const a = createUser("author", "test-pass"),
  b = createUser("reader", "test-pass"),
  c = createUser("outsider", "test-pass");
const words = {
  format: "jlpt-share",
  version: 1,
  kind: "wordbook",
  title: "测试单词本",
  items: [
    {
      original: "猫",
      reading: "ねこ",
      meaning_zh: "猫",
      deck: "n1_vocab",
      source_chat_summary: "PRIVATE",
      notes: ["PRIVATE"],
      progress: { secret: true },
    },
  ],
};
test("wordbook import belongs only to receiving account, strips private metadata, is idempotent", () => {
  const result = importPackage(a.id, words);
  const item = userReviewData(a.id).items[0];
  assert.equal(item.original, "猫");
  assert.equal(item.source_chat_summary, undefined);
  assert.equal(item.notes, undefined);
  assert.equal(item.progress, undefined);
  assert.equal(userReviewData(b.id).items.length, 0);
  assert.equal(importPackage(a.id, words).id, result.id);
  assert.equal(userReviewData(a.id).items.length, 1);
  const exported = sourcePackage(a.id, {
    kind: "wordbook",
    sourceId: result.id,
  });
  assert.equal(exported.items.length, 1);
  assert.equal(exported.items[0].id, undefined);
  assert.throws(() =>
    sourcePackage(b.id, { kind: "wordbook", sourceId: result.id }),
  );
  const share = publishShare(a.id, { kind: "wordbook", sourceId: result.id });
  assert.equal(listShares(b.id)[0].mine, false);
  assert.throws(() => withdrawShare(b.id, share.id));
  const copy = importPackage(b.id, share.package);
  assert.notEqual(copy.id, result.id);
  assert.equal(userReviewData(c.id).items.length, 0);
  assert.throws(() => updateShare(b.id, share.id, {title:'not yours'}), {statusCode:404});
  const edited = updateShare(a.id, share.id, {title:'新的公开标题', description:'新简介', refreshSource:true});
  assert.equal(edited.id, share.id);
  assert.equal(edited.package.title, '新的公开标题');
  assert.equal(listWordbooks(b.id).find(book => book.id === copy.id).title, words.title);
  assert.equal(listShares(a.id, true).every(row => row.mine), true);
  withdrawShare(a.id, share.id);
  assert.throws(() => shareDetail(b.id, share.id));
  assert.equal(userReviewData(b.id).items.length, 1);
});
test("practice import remaps identifiers, preserves questions and isolates answers", () => {
  const pkg = {
    format: "jlpt-share",
    version: 1,
    kind: "practice",
    title: "限定表达专项",
    questions: [
      {
        id: "source-q",
        itemId: "source-item",
        kind: "grammar",
        prompt: "猫（　）いる。",
        choices: ["が", "を"],
        answer: "が",
        correctReason: "主语用 が。",
        sourceDraftId: "PRIVATE",
      },
    ],
  };
  const first = importPackage(a.id, pkg),
    second = importPackage(b.id, pkg);
  assert.notEqual(first.id, second.id);
  const practice = getDailyPractice(b.id, second.id);
  assert.equal(practice.questions[0].prompt, pkg.questions[0].prompt);
  assert.notEqual(practice.questions[0].id, "source-q");
  assert.equal(practice.questions[0].sourceDraftId, undefined);
  assert.deepEqual(getStudyState(b.id).answers, {});
  assert.equal(importPackage(b.id, pkg).alreadyImported, true);
  assert.equal(getDailyPractice(c.id, second.id), null);
});
test('practice imports linked grammar into the learner library and keeps question links', () => {
  const pkg = {
    format: 'jlpt-share', version: 1, kind: 'practice', title: '时间关系',
    items: [{ id: 'private-grammar-id', deck: 'grammar_expression', original: '～が早いか', reading: 'がはやいか', meaning_zh: '刚一……就……' }],
    questions: [{ kind: 'grammar', prompt: '着く（　）走った。', choices: ['が早いか', 'ほど'], answer: 'が早いか', sourceItemIndex: 0 }],
  };
  const imported = importPackage(b.id, pkg);
  const linkedId = getDailyPractice(b.id, imported.id).questions[0].itemId;
  const linkedItem = userReviewData(b.id).items.find((item) => item.id === linkedId);
  assert.equal(linkedItem?.original, '～が早いか');
  assert.equal(linkedItem?.deck, 'grammar_expression');
  assert.notEqual(linkedId, 'private-grammar-id');
  assert.equal(importPackage(b.id, pkg).alreadyImported, true);
  assert.equal(userReviewData(b.id).items.filter((item) => item.id === linkedId).length, 1);
  const republished = sourcePackage(b.id, { kind: 'practice', sourceId: imported.id });
  assert.equal(republished.questions[0].sourceItemIndex, 0);
  assert.equal(republished.items[0].original, '～が早いか');
});
test('older question-only shares recover exact grammar links while the source exists', () => {
  const source = importPackage(a.id, {
    format: 'jlpt-share', version: 1, kind: 'practice', title: '旧版时间关系',
    items: [{ deck: 'grammar_expression', original: '～そばから', meaning_zh: '刚……就……' }],
    questions: [{ kind: 'grammar', prompt: '覚える（　）忘れる。', choices: ['そばから', 'ところで'], answer: 'そばから', memoryPoint: '～そばから', sourceItemIndex: 0 }],
  });
  const published = publishShare(a.id, { kind: 'practice', sourceId: source.id });
  const old = structuredClone(published.package);
  delete old.items;
  delete old.questions[0].sourceItemIndex;
  getDb().prepare('UPDATE market_shares SET package_json=? WHERE id=?').run(JSON.stringify(old), published.id);
  const oldCopy = importPackage(c.id, old);
  assert.equal(userReviewData(c.id).items.some((item) => item.original === '～そばから'), false);
  const copy = importShare(c.id, published.id);
  assert.equal(copy.id, oldCopy.id);
  assert.equal(copy.alreadyImported, true);
  const linkedId = getDailyPractice(c.id, copy.id).questions[0].itemId;
  assert.equal(userReviewData(c.id).items.find((item) => item.id === linkedId)?.original, '～そばから');
  assert.equal(importShare(c.id, published.id).id, oldCopy.id);
  assert.equal(userReviewData(c.id).items.filter((item) => item.original === '～そばから').length, 1);
});
test('sharing a draft practice includes original grammar notes even before they are in the library', () => {
  const draft = createReviewPackDraft(a.id, { title: '文法原始笔记', status: 'approved', content: {
    grammar_points: [{ grammar_point: '～や否や', meaning_zh: '刚……就……', core_memory: ['书面语'] }],
    sections: [{ title: '时间关系', questions: [{ id: 'q1', kind: '文法', tested: '～や否や',
      prompt: '見る（　）走った。', choices: ['や否や', 'ほど'], answer: 'や否や',
      explanation_zh: '动作紧接着发生。', translation_zh: '一看见就跑了。',
      choiceAnalysis: [{ choice: 'や否や', explanation: '表示紧接着发生。' }, { choice: 'ほど', explanation: '程度表达不合语境。' }] }] }],
  } });
  const practice = createDailyPracticeFromDraft(a.id, draft.id);
  const shared = sourcePackage(a.id, { kind: 'practice', sourceId: practice.id });
  assert.equal(shared.items[0].original, '～や否や');
  assert.equal(shared.questions[0].sourceItemIndex, 0);
  const imported = importPackage(c.id, shared);
  const linkedId = getDailyPractice(c.id, imported.id).questions[0].itemId;
  assert.equal(userReviewData(c.id).items.find((item) => item.id === linkedId)?.original, '～や否や');
});
test("invalid and oversized packages fail without partial writes", () => {
  const count = getDb()
    .prepare("SELECT COUNT(*) c FROM user_review_items")
    .get().c;
  assert.throws(() =>
    importPackage(a.id, {
      ...words,
      items: [...words.items, { original: "x", deck: "invalid" }],
    }),
  );
  assert.equal(
    getDb().prepare("SELECT COUNT(*) c FROM user_review_items").get().c,
    count,
  );
  assert.throws(() =>
    validatePackage({ ...words, description: "x".repeat(750001) }),
  );
  assert.throws(() => validatePackage({ ...words, version: 2 }));
  assert.equal(
    listWordbooks(c.id).some((b) => b.title === "测试单词本"),
    false,
  );
});

test("public wordbook snapshot survives source changes and removal, and import resolves the saved copy", () => {
  const source = importPackage(a.id, { ...words, title: '独立公共副本' });
  const published = publishShare(a.id, { kind: 'wordbook', sourceId: source.id });
  assert.equal(published.sourceId, source.id);
  assert.ok(published.createdAt);
  assert.equal(shareDetail(b.id, published.id).sourceId, undefined);
  const db = getDb();
  db.prepare("UPDATE user_review_items SET item_json=json_set(item_json,'$.original','犬') WHERE user_id=? AND json_extract(item_json,'$.wordbook_id')=?").run(a.id, source.id);
  assert.equal(sourcePackage(a.id, {kind:'wordbook',sourceId:source.id}).items[0].original, '犬');
  assert.equal(shareDetail(b.id, published.id).package.items[0].original, '猫');
  db.prepare("DELETE FROM user_review_items WHERE user_id=? AND json_extract(item_json,'$.wordbook_id')=?").run(a.id,source.id);
  db.prepare('DELETE FROM wordbooks WHERE id=? AND user_id=?').run(source.id,a.id);
  const imported = importShare(c.id, published.id);
  assert.ok(userReviewData(c.id).items.some(item => item.wordbook_id === imported.id && item.original === '猫'));
  withdrawShare(a.id, published.id);
  assert.throws(() => importShare(b.id,published.id));
  assert.equal(db.prepare('SELECT withdrawn FROM market_shares WHERE id=?').get(published.id).withdrawn,1);
  assert.ok(userReviewData(c.id).items.some(item=>item.wordbook_id===imported.id));
});

test("public practice snapshot survives deleting the source practice and draft", () => {
  const source = importPackage(a.id, {format:'jlpt-share',version:1,kind:'practice',title:'公共专项副本',questions:[{kind:'kanji_to_kana',prompt:'猫',choices:['ねこ','いぬ'],answer:'ねこ'}]});
  const practice = getDailyPractice(a.id, source.id);
  const published = publishShare(a.id, {kind:'practice',sourceId:source.id});
  const db=getDb();
  db.prepare('DELETE FROM daily_practices WHERE id=? AND user_id=?').run(source.id,a.id);
  db.prepare('DELETE FROM review_pack_drafts WHERE id=? AND user_id=?').run(practice.sourceDraftId,a.id);
  const imported=importShare(b.id,published.id);
  assert.equal(getDailyPractice(b.id,imported.id).questions[0].answer,'ねこ');
});

test('My shares is not clipped by the public latest-200 feed', () => {
  const db = getDb();
  const insert = db.prepare('INSERT INTO market_shares (id,user_id,source_id,kind,package_json,created_at) VALUES (?,?,?,?,?,?)');
  insert.run('old-own-share', a.id, 'source', 'wordbook', JSON.stringify(words), '2020-01-01T00:00:00Z');
  for (let index = 0; index < 201; index++) insert.run(`new-other-${index}`, b.id, 'source', 'wordbook', JSON.stringify(words), '2026-10-06T00:00:00Z');
  assert.equal(listShares(a.id).some(share => share.id === 'old-own-share'), false);
  assert.equal(listShares(a.id, true).some(share => share.id === 'old-own-share'), true);
  assert.equal(listShares(a.id, true).every(share => share.mine), true);
});
