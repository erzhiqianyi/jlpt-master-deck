import { existsSync, readFileSync } from './files.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOfficialRoot = join(rootDir, '.local', 'official-jlpt');
const localMockRoot = join(rootDir, '.local', 'mock-exams');

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

