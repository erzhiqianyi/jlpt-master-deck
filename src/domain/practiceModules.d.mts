export type PracticeModule = 'grammar' | 'listening' | 'vocabulary' | 'reading';
export function practiceModules(questions?: Array<{ module?: string; kind?: string; type?: string }>, fallback?: string): PracticeModule[];
