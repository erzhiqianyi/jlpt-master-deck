// /api/v3/*：直接读写 v3 表的新接口。认证由外层完成，这里只拿到 user。
import { getV3Db, ensureUser } from './database.mjs';
import { transaction, currentPlatform } from '../platform.mjs';
import { getSettings, updateSettings, listCardTemplates, listLanguages } from './repo/settings.mjs';
import { listWordbooks, getWordbook, createWordbook, renameWordbook, deleteWordbook } from './repo/wordbooks.mjs';
import { listKnowledge, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, lookupKnowledge } from './repo/knowledge.mjs';
import { preferredLanguage } from './i18n.mjs';
import { mediaFor, setMemoryImage, removeMemoryImage, storeMedia, readMediaBytes } from './repo/media.mjs';
import { listQuestionTypes, validateGroup, listQuestionGroups, getQuestionGroup, createQuestionGroup, updateQuestionGroup, deleteQuestionGroup, setGroupStatus, groupOfQuestion } from './repo/questions.mjs';
import { reviewContext, submitReview, listGroupsForReview, reportQuestionProblem } from './repo/reviews.mjs';
import { listMaterials, getMaterial, createMaterial, updateMaterial, deleteMaterial } from './repo/materials.mjs';
import { createPracticeSet, listPracticeSets, getPracticeSet, deletePracticeSet, startAttempt, getAttempt, submitAnswer, completeAttempt, activeAttempt, listAttempts, listMistakes } from './repo/practice.mjs';
import { dueCards, rateCard, listRatings, cardFor } from './repo/cards.mjs';
import { studyOverview } from './repo/stats.mjs';
import { listCaptures, countCaptures, getCapture, createCapture, setCaptureStatus, deleteCapture } from './repo/inbox.mjs';
import { createRecording, getRecording, listRecordings, claimRecording, saveRecordingAnalysis, deleteRecording } from './repo/recordings.mjs';
import { getPlan, savePlanProfile, saveGeneratedPlan, setTaskStatus } from './repo/plans.mjs';
import { reportContext, upsertReport, getReport, listReports } from './repo/reports.mjs';
import { createDraft, updateDraft, setDraftStatus, addDraftComment, deleteDraft, getDraft, listDrafts, publishDraft } from './repo/drafts.mjs';
import { sharingSources, buildPackage, publishShare, refreshShare, withdrawShare, listShares, shareDetail, importShare } from './repo/market.mjs';
import { learningHome } from './repo/home.mjs';
import { createReadStream } from '../files.mjs';
import { scheduleItemPronunciation } from '../tts/prewarm.mjs';

const routes = [];
const route = (method, pattern, handler, { write = false, maxBody } = {}) => routes.push({ method, pattern, handler, write, maxBody });

route('GET', /^\/api\/v3\/languages$/, ({ db }) => ({ languages: listLanguages(db) }));
route('GET', /^\/api\/v3\/settings$/, ({ db, user }) => ({ settings: getSettings(db, user.id) }));
route('PATCH', /^\/api\/v3\/settings$/, ({ db, user, body }) => ({ settings: updateSettings(db, user.id, body) }), { write: true });
route('GET', /^\/api\/v3\/card-templates$/, ({ db, user, url }) => ({ templates: listCardTemplates(db, url.searchParams.get('language') ?? preferredLanguage(db, user.id)) }));

route('GET', /^\/api\/v3\/wordbooks$/, ({ db, user }) => ({ wordbooks: listWordbooks(db, user.id) }));
route('POST', /^\/api\/v3\/wordbooks$/, ({ db, user, body }) => ({ wordbook: createWordbook(db, user.id, body) }), { write: true });
route('GET', /^\/api\/v3\/wordbooks\/([A-Za-z0-9]+)$/, ({ db, user, params }) => ({ wordbook: getWordbook(db, user.id, params[0]) }));
route('PATCH', /^\/api\/v3\/wordbooks\/([A-Za-z0-9]+)$/, ({ db, user, params, body }) => ({ wordbook: renameWordbook(db, user.id, params[0], body) }), { write: true });
route('DELETE', /^\/api\/v3\/wordbooks\/([A-Za-z0-9]+)$/, ({ db, user, params }) => deleteWordbook(db, user.id, params[0]), { write: true });

const listQuery = (url) => Object.fromEntries(['wordbook', 'kind', 'level', 'tag', 'status', 'q', 'limit', 'offset', 'sort', 'language'].map((k) => [k, url.searchParams.get(k) ?? undefined]));
route('GET', /^\/api\/v3\/knowledge$/, ({ db, user, url }) => listKnowledge(db, user.id, listQuery(url)));
route('GET', /^\/api\/v3\/knowledge\/lookup$/, ({ db, user, url }) => ({ items: lookupKnowledge(db, user.id, url.searchParams.get('q'), { language: url.searchParams.get('language') ?? undefined }) }));
route('POST', /^\/api\/v3\/knowledge$/, ({ db, user, body }) => {
  const item = createKnowledge(db, user.id, body);
  scheduleItemPronunciation(user.id, item);
  return { item };
}, { write: true });
route('GET', /^\/api\/v3\/knowledge\/([A-Za-z0-9]+)$/, ({ db, user, params, url }) => ({ item: getKnowledge(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('PATCH', /^\/api\/v3\/knowledge\/([A-Za-z0-9]+)$/, ({ db, user, params, body }) => ({ item: updateKnowledge(db, user.id, params[0], body) }), { write: true });
route('DELETE', /^\/api\/v3\/knowledge\/([A-Za-z0-9]+)$/, ({ db, user, params }) => deleteKnowledge(db, user.id, params[0]), { write: true });

route('PUT', /^\/api\/v3\/knowledge\/([A-Za-z0-9]+)\/memory-image$/, ({ db, user, params, body }) => ({ memoryImage: setMemoryImage(db, user.id, params[0], body ?? {}) }), { write: true, maxBody: 8 * 1024 * 1024 });
route('DELETE', /^\/api\/v3\/knowledge\/([A-Za-z0-9]+)\/memory-image$/, ({ db, user, params, url }) => removeMemoryImage(db, user.id, params[0], { language: url.searchParams.get('language') ?? 'zh-Hans' }), { write: true });

// ---------- 题库 ----------
const CODE = '([A-Za-z0-9]+)';
const param = (url, keys) => Object.fromEntries(keys.map((k) => [k, url.searchParams.get(k) ?? undefined]));
route('GET', /^\/api\/v3\/question-types$/, ({ db, user, url }) => ({ types: listQuestionTypes(db, url.searchParams.get('language') ?? preferredLanguage(db, user.id)) }));
route('POST', /^\/api\/v3\/questions\/validate$/, ({ db, user, body }) => {
  const { ok, errors, warnings } = validateGroup(db, user.id, body);
  return { ok, errors, warnings };
}, { write: true });
route('GET', new RegExp(`^/api/v3/questions/${CODE}$`), ({ db, user, params }) => ({ group: groupOfQuestion(db, user.id, params[0]) }));
route('POST', new RegExp(`^/api/v3/questions/${CODE}/report$`), ({ db, user, params, body }) => reportQuestionProblem(db, user.id, params[0], body ?? {}), { write: true });
route('GET', /^\/api\/v3\/question-groups$/, ({ db, user, url }) => listQuestionGroups(db, user.id, param(url, ['module', 'typeId', 'status', 'level', 'knowledge', 'q', 'limit', 'offset'])));
route('POST', /^\/api\/v3\/question-groups$/, ({ db, user, body }) => ({ group: createQuestionGroup(db, user.id, body) }), { write: true, maxBody: 4 * 1024 * 1024 });
route('GET', new RegExp(`^/api/v3/question-groups/${CODE}$`), ({ db, user, params, url }) => ({ group: getQuestionGroup(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('PUT', new RegExp(`^/api/v3/question-groups/${CODE}$`), ({ db, user, params, body }) => ({ group: updateQuestionGroup(db, user.id, params[0], body) }), { write: true, maxBody: 4 * 1024 * 1024 });
route('DELETE', new RegExp(`^/api/v3/question-groups/${CODE}$`), ({ db, user, params }) => deleteQuestionGroup(db, user.id, params[0]), { write: true });
route('POST', new RegExp(`^/api/v3/question-groups/${CODE}/status$`), ({ db, user, params, body }) => setGroupStatus(db, user.id, params[0], body?.status), { write: true });
route('GET', new RegExp(`^/api/v3/question-groups/${CODE}/review-context$`), ({ db, user, params, url }) => reviewContext(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }));
route('POST', new RegExp(`^/api/v3/question-groups/${CODE}/reviews$`), ({ db, user, params, body }) => submitReview(db, user.id, params[0], { ...body, reviewer: 'ai' }), { write: true });
route('GET', /^\/api\/v3\/question-reviews$/, ({ db, user, url }) => listGroupsForReview(db, user.id, param(url, ['status', 'limit', 'offset'])));

// ---------- 素材与文件 ----------
route('GET', /^\/api\/v3\/materials$/, ({ db, user, url }) => listMaterials(db, user.id, param(url, ['kind', 'q', 'limit', 'offset', 'language'])));
route('POST', /^\/api\/v3\/materials$/, ({ db, user, body }) => ({ material: createMaterial(db, user.id, body) }), { write: true, maxBody: 4 * 1024 * 1024 });
route('GET', new RegExp(`^/api/v3/materials/${CODE}$`), ({ db, user, params, url }) => ({ material: getMaterial(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('PATCH', new RegExp(`^/api/v3/materials/${CODE}$`), ({ db, user, params, body }) => ({ material: updateMaterial(db, user.id, params[0], body) }), { write: true, maxBody: 4 * 1024 * 1024 });
route('DELETE', new RegExp(`^/api/v3/materials/${CODE}$`), ({ db, user, params }) => deleteMaterial(db, user.id, params[0]), { write: true });
route('POST', /^\/api\/v3\/media$/, ({ db, user, body }) => {
  const id = storeMedia(db, user.id, { base64: body?.base64, mime: body?.mime, fileName: body?.fileName ?? null });
  const file = mediaFor(db, user.id, id);
  return { media: { id, kind: file.kind, mime: file.mime, size: file.size, url: `/api/v3/media/${id}` } };
}, { write: true, maxBody: 60 * 1024 * 1024 });

// ---------- 练习、作答 ----------
route('GET', /^\/api\/v3\/practice-sets$/, ({ db, user, url }) => listPracticeSets(db, user.id, param(url, ['kind', 'date', 'limit', 'offset', 'language'])));
route('POST', /^\/api\/v3\/practice-sets$/, ({ db, user, body }) => ({ practice: createPracticeSet(db, user.id, body) }), { write: true });
route('GET', new RegExp(`^/api/v3/practice-sets/${CODE}$`), ({ db, user, params, url }) => ({ practice: getPracticeSet(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('DELETE', new RegExp(`^/api/v3/practice-sets/${CODE}$`), ({ db, user, params }) => deletePracticeSet(db, user.id, params[0]), { write: true });
route('GET', /^\/api\/v3\/attempts$/, ({ db, user, url }) => {
  const q = param(url, ['kind', 'practice', 'limit', 'offset', 'language']);
  const completed = url.searchParams.get('completed');
  return listAttempts(db, user.id, { ...q, completed: completed == null ? undefined : completed === 'true' });
});
route('GET', /^\/api\/v3\/attempts\/active$/, ({ db, user, url }) => ({ attempt: activeAttempt(db, user.id, { language: url.searchParams.get('language') ?? undefined }) }));
route('POST', /^\/api\/v3\/attempts$/, ({ db, user, body }) => ({ attempt: startAttempt(db, user.id, body ?? {}) }), { write: true });
route('GET', new RegExp(`^/api/v3/attempts/${CODE}$`), ({ db, user, params, url }) => ({ attempt: getAttempt(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('POST', new RegExp(`^/api/v3/attempts/${CODE}/answers$`), ({ db, user, params, body }) => submitAnswer(db, user.id, params[0], { ...body, source: body?.source ?? 'web' }), { write: true });
route('POST', new RegExp(`^/api/v3/attempts/${CODE}/complete$`), ({ db, user, params }) => ({ attempt: completeAttempt(db, user.id, params[0]) }), { write: true });
route('GET', /^\/api\/v3\/mistakes$/, ({ db, user, url }) => listMistakes(db, user.id, param(url, ['module', 'limit', 'offset'])));

// ---------- 记忆卡片、统计 ----------
route('GET', /^\/api\/v3\/cards\/due$/, ({ db, user, url }) => dueCards(db, user.id, {
  ...param(url, ['wordbook', 'level', 'limit', 'newLimit', 'language']), kinds: url.searchParams.get('kinds')?.split(',').filter(Boolean),
}));
route('POST', /^\/api\/v3\/cards\/ratings$/, ({ db, user, body }) => rateCard(db, user.id, { ...body, source: body?.source ?? 'web' }), { write: true });
route('GET', /^\/api\/v3\/cards\/ratings$/, ({ db, user, url }) => ({ ratings: listRatings(db, user.id, param(url, ['code', 'since', 'limit'])) }));
route('GET', new RegExp(`^/api/v3/cards/${CODE}$`), ({ db, user, params, url }) => ({ card: cardFor(db, user.id, params[0], { language: url.searchParams.get('language') ?? undefined }) }));
route('GET', /^\/api\/v3\/stats$/, ({ db, user, url }) => studyOverview(db, user.id, param(url, ['days', 'module'])));

// ---------- 收集箱、录音 ----------
route('GET', /^\/api\/v3\/inbox$/, ({ db, user, url }) => listCaptures(db, user.id, param(url, ['status', 'category', 'limit', 'offset', 'cursor'])));
route('GET', /^\/api\/v3\/inbox\/count$/, ({ db, user, url }) => countCaptures(db, user.id, param(url, ['status', 'category'])));
route('POST', /^\/api\/v3\/inbox$/, ({ db, user, body }) => ({ capture: createCapture(db, user.id, body) }), { write: true });
route('GET', new RegExp(`^/api/v3/inbox/${CODE}$`), ({ db, user, params }) => ({ capture: getCapture(db, user.id, params[0]) }));
route('PATCH', new RegExp(`^/api/v3/inbox/${CODE}$`), ({ db, user, params, body }) => ({ capture: setCaptureStatus(db, user.id, params[0], body?.status) }), { write: true });
route('DELETE', new RegExp(`^/api/v3/inbox/${CODE}$`), ({ db, user, params }) => deleteCapture(db, user.id, params[0]), { write: true });
route('GET', /^\/api\/v3\/recordings$/, ({ db, user, url }) => ({ recordings: listRecordings(db, user.id, param(url, ['question', 'status', 'limit'])) }));
route('POST', /^\/api\/v3\/recordings$/, ({ db, user, body }) => ({ recording: createRecording(db, user.id, body) }), { write: true, maxBody: 60 * 1024 * 1024 });
route('GET', new RegExp(`^/api/v3/recordings/${CODE}$`), ({ db, user, params }) => ({ recording: getRecording(db, user.id, params[0]) }));
route('DELETE', new RegExp(`^/api/v3/recordings/${CODE}$`), ({ db, user, params }) => deleteRecording(db, user.id, params[0]), { write: true });

// ---------- 学习计划、每日总结 ----------
route('GET', /^\/api\/v3\/plan$/, ({ db, user }) => ({ plan: getPlan(db, user.id) }));
route('PUT', /^\/api\/v3\/plan\/profile$/, ({ db, user, body }) => ({ plan: savePlanProfile(db, user.id, body) }), { write: true });
route('POST', new RegExp(`^/api/v3/plan/tasks/${CODE}$`), ({ db, user, params, body }) => ({ task: setTaskStatus(db, user.id, params[0], body?.status) }), { write: true });
route('GET', /^\/api\/v3\/reports$/, ({ db, user, url }) => ({ reports: listReports(db, user.id, param(url, ['limit'])) }));
route('GET', /^\/api\/v3\/reports\/(\d{4}-\d{2}-\d{2})$/, ({ db, user, params }) => ({ report: getReport(db, user.id, params[0]) }));
route('GET', /^\/api\/v3\/reports\/(\d{4}-\d{2}-\d{2})\/context$/, ({ db, user, params }) => reportContext(db, user.id, { date: params[0] }));

// ---------- AI 草稿 ----------
route('GET', /^\/api\/v3\/drafts$/, ({ db, user, url }) => ({ drafts: listDrafts(db, user.id, param(url, ['status', 'limit'])) }));
route('GET', new RegExp(`^/api/v3/drafts/${CODE}$`), ({ db, user, params }) => ({ draft: getDraft(db, user.id, params[0]) }));
route('POST', new RegExp(`^/api/v3/drafts/${CODE}/comments$`), ({ db, user, params, body }) => ({ draft: addDraftComment(db, user.id, params[0], body?.body) }), { write: true });
route('POST', new RegExp(`^/api/v3/drafts/${CODE}/status$`), ({ db, user, params, body }) => ({ draft: setDraftStatus(db, user.id, params[0], body?.status) }), { write: true });
route('POST', new RegExp(`^/api/v3/drafts/${CODE}/publish$`), ({ db, user, params, body }) => publishDraft(db, user.id, params[0], body ?? {}), { write: true });
route('DELETE', new RegExp(`^/api/v3/drafts/${CODE}$`), ({ db, user, params }) => deleteDraft(db, user.id, params[0]), { write: true });

// ---------- 市场 ----------
const SHARE = '([0-9a-fA-F-]{36})';
route('GET', /^\/api\/v3\/market\/sources$/, ({ db, user }) => sharingSources(db, user.id));
route('POST', /^\/api\/v3\/market\/preview$/, ({ db, user, body }) => ({ package: buildPackage(db, user.id, body ?? {}).pkg }), { write: true });
route('GET', /^\/api\/v3\/market$/, ({ db, user, url }) => ({ shares: listShares(db, user.id, { mine: url.searchParams.get('mine') === '1' }) }));
route('POST', /^\/api\/v3\/market$/, ({ db, user, body }) => ({ share: publishShare(db, user.id, body ?? {}) }), { write: true });
route('GET', new RegExp(`^/api/v3/market/${SHARE}$`), ({ db, user, params, url }) => ({ share: shareDetail(db, user.id, params[0], { revision: url.searchParams.get('revision') ?? undefined }) }));
route('POST', new RegExp(`^/api/v3/market/${SHARE}/refresh$`), ({ db, user, params, body }) => ({ share: refreshShare(db, user.id, params[0], body ?? {}) }), { write: true });
route('DELETE', new RegExp(`^/api/v3/market/${SHARE}$`), ({ db, user, params }) => withdrawShare(db, user.id, params[0]), { write: true });
route('POST', new RegExp(`^/api/v3/market/${SHARE}/import$`), ({ db, user, params }) => importShare(db, user.id, params[0]), { write: true });
route('GET', /^\/api\/v3\/home$/, ({ db, user }) => learningHome(db, user.id));

const MEDIA = /^\/api\/v3\/media\/(\d+)$/;

/** 画像・音声ファイルはそのまま返す。 */
async function sendMedia(db, user, rid, res, json) {
  try {
    const file = mediaFor(db, user.id, rid);
    const headers = { 'content-type': file.mime, 'content-length': file.size, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' };
    // Cloudflare では R2 から読んでそのまま返す
    if (currentPlatform()?.readMedia) { const bytes = await readMediaBytes(file); res.writeHead(200, headers); res.end(bytes); return; }
    res.writeHead(200, headers);
    createReadStream(file.storage_path).pipe(res);
  } catch (error) {
    if (!error.statusCode) throw error;
    json(res, error.statusCode, { error: error.message });
  }
}

/** 处理 /api/v3 请求；不是 v3 路径时返回 false。 */
export async function handleV3({ req, res, url, user, json, readJson }) {
  if (!url.pathname.startsWith('/api/v3/')) return false;
  const media = MEDIA.exec(url.pathname);
  if (media) {
    if (req.method !== 'GET') { json(res, 405, { error: `${url.pathname} 不支持 ${req.method}` }); return true; }
    const db = getV3Db();
    ensureUser(db, user);
    await sendMedia(db, user, media[1], res, json);
    return true;
  }
  const candidates = routes.filter((r) => r.pattern.test(url.pathname));
  if (!candidates.length) { json(res, 404, { error: `没有这个接口：${url.pathname}` }); return true; }
  const entry = candidates.find((r) => r.method === req.method);
  if (!entry) { json(res, 405, { error: `${url.pathname} 不支持 ${req.method}` }); return true; }
  const db = getV3Db();
  ensureUser(db, user);
  const params = entry.pattern.exec(url.pathname).slice(1).map(decodeURIComponent);
  const body = entry.write && req.method !== 'DELETE' ? await readJson(req, entry.maxBody ?? 2 * 1024 * 1024) : undefined;
  try {
    const result = entry.write ? transaction(db, () => entry.handler({ db, user, url, params, body })) : entry.handler({ db, user, url, params, body });
    json(res, req.method === 'POST' ? 201 : 200, result);
  } catch (error) {
    if (!error.statusCode) throw error;
    json(res, error.statusCode, { error: error.message, ...(error.details ? { details: error.details } : {}) });
  }
  return true;
}
