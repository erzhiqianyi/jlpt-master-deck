import { existsSync, readFileSync, readdirSync } from './files.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReviewData } from './storage.mjs';
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOfficialRoot = join(rootDir, '.local', 'official-jlpt');
const localMockRoot = join(rootDir, '.local', 'mock-exams');
const localNewsRoot = resolve(process.env.JLPT_NEWS_SOURCE_DIR ?? '/Users/itsuki/AI/knowledge-base/personal-knowledge/sources/jlpt-news');

export function readLocalOfficialSamples(module) {
  const samplesPath = join(localOfficialRoot, 'sample2018', 'n1', 'official-samples.json');
  if (!existsSync(samplesPath)) {
    return { samples: [] };
  }
  const payload = JSON.parse(readFileSync(samplesPath, 'utf8'));
  const samples = Array.isArray(payload.samples) ? payload.samples : [];
  return {
    samples: module ? samples.filter((sample) => sample.module === module) : samples,
  };
}

export function readLocalMockExam(examId) {
  const decodedId = decodeURIComponent(examId);
  const examPath = resolve(localMockRoot, decodedId, 'exam.json');
  if (!examPath.startsWith(`${localMockRoot}/`) || !existsSync(examPath)) {
    return null;
  }
  return JSON.parse(readFileSync(examPath, 'utf8'));
}

export function readLocalMockExamManifest() {
  const manifestPath = join(localMockRoot, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { exams: [] };
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function readLocalNewsCycles(userId) {
  const weeklyRoot = join(localNewsRoot, 'weekly');
  if (!existsSync(weeklyRoot)) return [];
  const reviewItems = loadReviewData(userId).items ?? [];
  return readdirSync(weeklyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-W\d{2}$/.test(entry.name))
    .flatMap((entry) => {
      const summaryPath = join(weeklyRoot, entry.name, 'cycle-summary.json');
      if (!existsSync(summaryPath)) return [];
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const formalPracticeQuestionIds = formalNewsPracticeQuestionIds(reviewItems, summary.range);
      const totalQuestions = Number(summary.total_questions ?? 0);
      return [{
        id: entry.name,
        range: summary.range,
        generatedAt: summary.generated_at,
        totalQuestions,
        moduleCounts: {
          vocabulary: Number(summary.modules?.vocabulary ?? 0),
          grammar: Number(summary.modules?.grammar ?? 0),
          listening: Number(summary.modules?.listening ?? 0),
          reading: Number(summary.modules?.reading ?? 0),
        },
        audioCount: Number(summary.direct_audio_question_count ?? 0),
        needsAudioReviewCount: Number(summary.needs_audio_review_count ?? 0),
        formalQuestionCount: formalPracticeQuestionIds.length,
        formalPracticeQuestionIds,
        status: formalPracticeQuestionIds.length >= totalQuestions && totalQuestions > 0
          ? 'published'
          : formalPracticeQuestionIds.length > 0
            ? 'partially_published'
            : String(summary.status ?? 'draft'),
      }];
    })
    .sort((left, right) => right.id.localeCompare(left.id));
}

function formalNewsPracticeQuestionIds(items, range) {
  if (!range?.from || !range?.to) return [];
  return items
    .flatMap((item) => Array.isArray(item.practice_questions) ? item.practice_questions : [])
    .map((question) => String(question?.id ?? ''))
    .filter((id) => {
      const match = /^news-(\d{4}-\d{2}-\d{2})-.+-formal$/.exec(id);
      return match && match[1] >= range.from && match[1] <= range.to;
    });
}

export function readLocalNewsCycle(requestedId, userId) {
  if (!existsSync(localNewsRoot)) return { days: [] };
  const cycles = readLocalNewsCycles(userId);
  const cycleId = requestedId || cycles[0]?.id;
  if (!cycleId || !/^\d{4}-W\d{2}$/.test(cycleId) || !cycles.some((cycle) => cycle.id === cycleId)) {
    return { days: [] };
  }
  let summary;
  const weeklyRoot = join(localNewsRoot, 'weekly');
  const summaryPath = join(weeklyRoot, cycleId, 'cycle-summary.json');
  if (existsSync(summaryPath)) summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const dates = readdirSync(localNewsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((date) => !summary?.range || (date >= summary.range.from && date <= summary.range.to))
    .sort();
  const days = dates.flatMap((date) => {
    const questionsPath = join(localNewsRoot, date, 'questions.json');
    if (!existsSync(questionsPath)) return [];
    const payload = JSON.parse(readFileSync(questionsPath, 'utf8'));
    const questions = (Array.isArray(payload.questions) ? payload.questions : []).map((question) => ({
      ...question,
      audio: question.audio?.fileName
        ? { ...question.audio, previewUrl: `/api/local-news-audio/${date}/${encodeURIComponent(question.audio.fileName)}` }
        : question.audio,
    }));
    const moduleCounts = { vocabulary: 0, grammar: 0, listening: 0, reading: 0 };
    for (const question of questions) {
      if (question.module in moduleCounts) moduleCounts[question.module] += 1;
    }
    return [{
      date,
      questionCount: questions.length,
      audioCount: questions.filter((question) => question.audio?.previewUrl).length,
      sourceCount: new Set(questions.map((question) => question.source_id)).size,
      moduleCounts,
      questions,
    }];
  });
  return { id: cycleId, summary, days };
}

