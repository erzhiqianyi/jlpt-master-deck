// Message protocol between content/popup/manage pages and the background service worker.
// The background worker is the only context with host_permissions, so every network call
// (lookup, capture CRUD, login) is routed through it via chrome.runtime.sendMessage.

export type CaptureCategory = 'word' | 'grammar' | 'sentence' | 'listening' | 'reading' | 'unsure';
export type CaptureStatus = 'inbox' | 'processed' | 'archived';
// Shapes follow the v3 MCP tools (list_wordbooks, list_learning_captures, lookup_word).
export interface Wordbook {
  code: string;
  title: string;
}

export interface LearningCapture {
  code: string;
  body: string;
  category: CaptureCategory;
  context?: string | null;
  wordbook?: string | null;
  status: CaptureStatus;
  createdAt?: string;
}

export interface VocabMatch {
  code: string;
  kind: 'word' | 'grammar' | 'name';
  expression: string;
  reading?: string | null;
  meaning?: { text: string; language: string } | null;
}

export interface AppUser {
  username: string;
  accountId?: string;
  environment?: string;
  scopes?: string[];
}

export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'GET_STUDY_SETTINGS' }
  | { type: 'LOGIN' }
  | { type: 'LOGOUT' }
  | { type: 'SET_API_BASE_URL'; apiBaseUrl: string }
  | { type: 'LOOKUP_WORD'; query: string }
  | { type: 'CREATE_CAPTURE'; input: { body: string; category: CaptureCategory; context?: string; wordbook?: string } }
  | { type: 'LIST_CAPTURES'; status?: CaptureStatus }
  | { type: 'LIST_WORDBOOKS' }
  | { type: 'UPDATE_CAPTURE_STATUS'; code: string; status: CaptureStatus };

export type ExtensionResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(message);
}
