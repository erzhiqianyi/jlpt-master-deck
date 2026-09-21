import { transaction } from './platform.mjs';
import { createHash, randomUUID } from "node:crypto";
import {
  getDb,
  getDailyPractice,
  getReviewPackDraft,
  listDailyPractices,
  listReviewPackDrafts,
  listWordbooks,
  itemWordbookId,
  loadReviewData,
  createWordbook,
  createReviewPackDraft,
} from "./storage.mjs";
const itemFields =
  "deck type jlpt_level original reading meaning_ja paraphrase_ja meaning_zh formation usage_notes core_memory part_of_speech base_form conjugations collocations examples comparisons analysis explanation_zh localizations ruby_terms tags content_origin verification_status question_kinds question_distractors grammar_point grammar_forms grammar_features usage_register usage_register_zh exam_register_zh everyday_alternatives comparison_notes".split(
    " ",
  );
const questionFields =
  "kind title instruction prompt promptTarget choices answer translationZh context correctReason memoryPoint choiceAnalysis answerIndex".split(
    " ",
  );
const pick = (object, fields) =>
  Object.fromEntries(
    fields
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  );
function database() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS market_shares (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), source_id TEXT NOT NULL, kind TEXT NOT NULL, package_json TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS market_imports (user_id INTEGER NOT NULL REFERENCES users(id), digest TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(user_id,digest));
    CREATE TABLE IF NOT EXISTS user_review_items (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), item_json TEXT NOT NULL);`);
  return db;
}
export function userReviewData(userId) {
  database();
  return loadReviewData(userId);
}
export function sharingSources(userId) {
  const drafts = listReviewPackDrafts(userId);
  const practices = listDailyPractices(userId).map((practice) => ({
    ...practice,
    draft: drafts.find((draft) => draft.id === practice.sourceDraftId),
  }));
  // Read full records because older summaries do not expose sourceDraftId.
  return {
    practices: practices
      .map((p) => {
        const full = getDailyPractice(userId, p.id);
        const draft = drafts.find((d) => d.id === full.sourceDraftId);
        return {
          id: p.id,
          title: draft?.title || p.title,
          count: full.questions.length,
        };
      })
      .filter(
        (p) =>
          !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日).*?(?:復習|复习|弱点强化|每日|练习)/u.test(
            p.title,
          ),
      ),
    wordbooks: listWordbooks(userId),
  };
}
export function validatePackage(input) {
  if (!input || Buffer.byteLength(JSON.stringify(input)) > 750000)
    throw new Error("分享包超过 750 KB 或格式无效");
  if (
    input.format !== "jlpt-share" ||
    input.version !== 1 ||
    !["practice", "wordbook"].includes(input.kind)
  )
    throw new Error("不支持的分享包格式");
  const title = String(input.title || "")
    .trim()
    .slice(0, 120);
  if (!title) throw new Error("请填写分享标题");
  const records = input.kind === "practice" ? input.questions : input.items;
  if (!Array.isArray(records) || !records.length || records.length > 1000)
    throw new Error("分享内容需包含 1–1000 项");
  const stringListFields = new Set(["collocations", "tags", "question_kinds"]);
  const objectLists = {
    examples: [
      "ja",
      "zh",
      "spoken_ja",
      "spoken_zh",
      "analysis_zh",
      "form_analysis_zh",
    ],
    comparisons: ["target", "difference_zh"],
    ruby_terms: ["text", "reading"],
    conjugations: [
      "form",
      "label",
      "reading",
      "meaning_zh",
      "polite",
      "negative",
      "past",
      "te",
    ],
    grammar_forms: ["form", "example", "meaning_zh", "connection_zh"],
    grammar_features: ["feature", "detail_zh"],
    everyday_alternatives: ["ja", "zh"],
    comparison_notes: ["target", "difference_zh"],
  };
  const clean = records.map((record) => {
    if (!record || typeof record !== "object") throw new Error("内容格式无效");
    if (input.kind === "practice") {
      if (
        typeof record.prompt !== "string" ||
        !Array.isArray(record.choices) ||
        record.choices.length < 2 ||
        record.choices.length > 8 ||
        !record.choices.every((c) => typeof c === "string") ||
        !record.choices.includes(record.answer) ||
        ![
          "grammar",
          "moji_goi",
          "meaning",
          "kana_to_kanji",
          "kanji_to_kana",
        ].includes(record.kind)
      )
        throw new Error("练习题缺少题干、选项或有效答案");
      const question = pick(record, questionFields);
      for (const field of questionFields.filter(
        (key) => !["choices", "choiceAnalysis", "answerIndex"].includes(key),
      ))
        if (
          question[field] !== undefined &&
          typeof question[field] !== "string"
        )
          throw new Error(`题目字段 ${field} 应为文字`);
      question.answerIndex = question.choices.indexOf(question.answer);
      if (question.choiceAnalysis !== undefined) {
        if (!Array.isArray(question.choiceAnalysis))
          throw new Error("选项解析格式无效");
        question.choiceAnalysis = question.choiceAnalysis.map((entry) => {
          if (
            !entry ||
            typeof entry.choice !== "string" ||
            typeof entry.explanation !== "string"
          )
            throw new Error("选项解析格式无效");
          return {
            choice: entry.choice,
            explanation: entry.explanation,
            correct: entry.choice === question.answer,
          };
        });
      }
      return question;
    }
    if (
      typeof record.original !== "string" ||
      !record.original.trim() ||
      !["n1_vocab", "name_reading"].includes(record.deck)
    )
      throw new Error("单词内容无效");
    const item = pick(record, itemFields);
    for (const [key, value] of Object.entries(item)) {
      if (stringListFields.has(key)) {
        if (
          !Array.isArray(value) ||
          !value.every((entry) => typeof entry === "string")
        )
          throw new Error(`单词字段 ${key} 格式无效`);
      } else if (objectLists[key]) {
        if (!Array.isArray(value)) throw new Error(`单词字段 ${key} 格式无效`);
        item[key] = value.map((entry) => {
          if (!entry || typeof entry !== "object")
            throw new Error(`单词字段 ${key} 格式无效`);
          const clean = pick(entry, objectLists[key]);
          if (!Object.values(clean).every((v) => typeof v === "string"))
            throw new Error(`单词字段 ${key} 格式无效`);
          return clean;
        });
      } else if (key === "question_distractors" || key === "localizations") {
        // These optional nested maps are not needed to transfer the original word and examples.
        delete item[key];
      } else if (typeof value !== "string")
        throw new Error(`单词字段 ${key} 应为文字`);
    }
    return item;
  });
  return {
    format: "jlpt-share",
    version: 1,
    kind: input.kind,
    title,
    description: String(input.description || "").slice(0, 600),
    ...(input.kind === "practice" ? { questions: clean } : { items: clean }),
  };
}
export function sourcePackage(userId, { kind, sourceId, title, description }) {
  let payload;
  if (kind === "practice") {
    const practice = getDailyPractice(userId, sourceId);
    if (!practice) throw new Error("找不到自己的专项练习");
    const draft = practice.sourceDraftId
      ? getReviewPackDraft(userId, practice.sourceDraftId)
      : null;
    payload = {
      title: title || draft?.title || practice.title,
      questions: practice.questions,
    };
  } else if (kind === "wordbook") {
    const book = listWordbooks(userId).find((book) => book.id === sourceId);
    if (!book) throw new Error("找不到自己的单词本");
    payload = {
      title: title || book.title,
      items: userReviewData(userId).items.filter(
        (item) => itemWordbookId(item) === book.id,
      ),
    };
  } else throw new Error("不支持的分享类型");
  return validatePackage({
    format: "jlpt-share",
    version: 1,
    kind,
    description,
    ...payload,
  });
}
export function publishShare(userId, input) {
  const pkg = sourcePackage(userId, input);
  const db = database();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO market_shares (id,user_id,source_id,kind,package_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(id, userId, input.sourceId, pkg.kind, JSON.stringify(pkg), now);
  return shareDetail(userId, id);
}
export function listShares(userId) {
  return database()
    .prepare(
      "SELECT id,user_id,package_json,created_at FROM market_shares WHERE withdrawn = 0 ORDER BY created_at DESC LIMIT 200",
    )
    .all()
    .map((row) => {
      const pkg = JSON.parse(row.package_json);
      return {
        id: row.id,
        kind: pkg.kind,
        title: pkg.title,
        description: pkg.description,
        count: (pkg.items || pkg.questions).length,
        mine: row.user_id === userId,
        createdAt: row.created_at,
      };
    });
}
export function shareDetail(userId, id) {
  const row = database()
    .prepare("SELECT * FROM market_shares WHERE id = ? AND withdrawn = 0")
    .get(id);
  if (!row) {
    const error = new Error("分享不存在或已撤回");
    error.statusCode = 404;
    throw error;
  }
  return {
    id: row.id,
    mine: row.user_id === userId,
    package: JSON.parse(row.package_json),
  };
}
export function withdrawShare(userId, id) {
  if (
    !database()
      .prepare(
        "UPDATE market_shares SET withdrawn = 1 WHERE id = ? AND user_id = ? AND withdrawn = 0",
      )
      .run(id, userId).changes
  ) {
    const error = new Error("找不到自己的分享");
    error.statusCode = 404;
    throw error;
  }
  return { ok: true };
}
export function importPackage(userId, input) {
  const pkg = validatePackage(input);
  const db = database();
  const digest = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
  const existing = db
    .prepare(
      "SELECT result_json FROM market_imports WHERE user_id=? AND digest=?",
    )
    .get(userId, digest);
  if (existing)
    return { ...JSON.parse(existing.result_json), alreadyImported: true };
  return transaction(db, () => {
    let result;
    if (pkg.kind === "wordbook") {
      let title = pkg.title;
      const titles = new Set(
        listWordbooks(userId).map((b) => b.title.toLowerCase()),
      );
      let i = 2;
      while (titles.has(title.toLowerCase()))
        title = `${pkg.title.slice(0, 90)} (${i++})`;
      const book = createWordbook(userId, { title, deck: pkg.items[0].deck });
      for (const source of pkg.items) {
        const id = `import-${randomUUID()}`;
        const item = {
          ...source,
          id,
          date: new Date().toISOString().slice(0, 10),
          wordbook_id: book.id,
          meaning_zh: source.meaning_zh || "",
          core_memory: source.core_memory || "",
          type: source.type || "vocabulary",
        };
        db.prepare("INSERT INTO user_review_items VALUES (?,?,?)").run(
          id,
          userId,
          JSON.stringify(item),
        );
      }
      result = { kind: pkg.kind, id: book.id, title: book.title };
    } else {
      const id = `shared-${randomUUID()}`;
      const now = new Date().toISOString();
      const date = now.slice(0, 10);
      const draft = createReviewPackDraft(userId, {
        title: pkg.title,
        status: "archived",
        content: { source: "market-import", sections: [] },
      });
      const questions = pkg.questions.map((question, index) => ({
        ...question,
        id: `${id}-q${index + 1}`,
        itemId: `${id}-item${index + 1}`,
        context: question.context || question.prompt,
        correctReason: question.correctReason || "",
        memoryPoint: question.memoryPoint || "",
        choiceAnalysis: question.choiceAnalysis || [],
      }));
      const version = Number(
        db
          .prepare(
            "SELECT COALESCE(MAX(version),0)+1 AS v FROM daily_practices WHERE user_id=? AND practice_date=?",
          )
          .get(userId, date).v,
      );
      const practice = {
        id,
        date,
        version,
        title: pkg.title,
        minutes: 30,
        strategy: "shared_topic",
        sourceDraftId: draft.id,
        questions,
        generated_at: now,
        verification_status: "needs_review",
        content_origin: "user_provided",
        disclaimer: "用户分享内容，请结合解析自行核对。",
      };
      db.prepare(
        "INSERT INTO daily_practices (id,user_id,practice_date,version,title,minutes,practice_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        userId,
        date,
        version,
        pkg.title,
        30,
        JSON.stringify(practice),
        now,
        now,
      );
      result = { kind: pkg.kind, id, title: pkg.title };
    }
    db.prepare("INSERT INTO market_imports VALUES (?,?,?)").run(
      userId,
      digest,
      JSON.stringify(result),
    );
    return result;
  });
}
