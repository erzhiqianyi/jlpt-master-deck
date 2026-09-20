import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "jlpt-market-"));
process.env.JLPT_DB_PATH = join(dir, "test.sqlite");
process.env.JLPT_REVIEW_DATA_PATH = join(dir, "data");
mkdirSync(process.env.JLPT_REVIEW_DATA_PATH);
const { createUser, getDb, listWordbooks, getDailyPractice, getStudyState } =
  await import("./storage.mjs");
const {
  importPackage,
  userReviewData,
  sourcePackage,
  publishShare,
  listShares,
  withdrawShare,
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
