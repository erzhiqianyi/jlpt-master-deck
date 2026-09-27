// Message protocol between content/popup/manage pages and the background service worker.
// The background worker is the only context with host_permissions, so every network call
// (lookup, capture CRUD, login) is routed through it via chrome.runtime.sendMessage.

export type CaptureCategory = 'word' | 'grammar' | 'sentence' | 'listening' | 'reading' | 'unsure';
export type CaptureStatus = 'inbox' | 'processed' | 'archived';
export type Deck = 'n1_vocab' | 'name_reading' | 'grammar_expression';

export interface Wordbook {
  id: string;
  title: string;
  deck: Deck;
  builtIn: boolean;
}

export interface LearningCapture {
  id: string;
  body: string;
  category: CaptureCategory;
  context?: string;
  status: CaptureStatus;
  createdAt?: string;
  targetDeck?: string;
}

export interface VocabMatch {
  id: string;
  original: string;
  reading?: string;
  meaning_zh?: string;
  meaning_ja?: string;
}

export interface AppUser {
  username: string;
  accountId?: string;
  environment?: string;
  scopes?: string[];
}

export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'LOGIN' }
  | { type: 'LOGOUT' }
  | { type: 'SET_API_BASE_URL'; apiBaseUrl: string }
  | { type: 'LOOKUP_WORD'; query: string }
  | { type: 'CREATE_CAPTURE'; input: { body: string; category: CaptureCategory; context?: string; targetDeck?: Deck; targetWordbookId?: string } }
  | { type: 'LIST_CAPTURES'; status?: CaptureStatus }
  | { type: 'LIST_WORDBOOKS' }
  | { type: 'UPDATE_CAPTURE_STATUS'; id: string; status: CaptureStatus };

export type ExtensionResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(message);
}
