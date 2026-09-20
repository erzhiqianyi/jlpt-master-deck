import type { ProgressEntry, ReviewStatus } from '../types';

export function nextStatus(correct: number, wrong: number, reviewCount: number): ReviewStatus;
export function nextSchedule(current: ProgressEntry, correct: boolean, now: Date): {
  firstSeenAt: string;
  lastReviewedAt: string;
  reviewCount: number;
  ease: number;
  intervalDays: number;
  nextReviewAt: string;
};
export function progressAfterAnswer(current: ProgressEntry | undefined, correct: boolean, now: Date): ProgressEntry;
