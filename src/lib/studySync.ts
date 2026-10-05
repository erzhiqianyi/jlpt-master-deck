import { apiRequest, studyWriteVersion, waitForStudyWrites } from './api';

export interface StudySyncDocument {
  cursor: string;
  records: Record<string, Record<string, unknown>>;
}
interface SyncPage {
  changes?: { collection: string; id: string; value?: unknown; deleted?: boolean }[];
  cursor?: string; nextPage?: string | null; reset?: boolean; restart?: boolean;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jlpt-study-sync-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('users');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readCache(userId: number): Promise<StudySyncDocument | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('users').objectStore('users').get(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function saveCache(userId: number, document: StudySyncDocument) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('users', 'readwrite');
      transaction.objectStore('users').put(document, userId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const syncCollection = <T>(document: StudySyncDocument, name: string): T[] => Object.values(document.records[name] ?? {}) as T[];
export const syncValue = <T>(document: StudySyncDocument, name: string): T => document.records[name]?.value as T;

// Publish only complete snapshots. A failed page cannot advance the saved cursor.
export async function syncStudy(userId: number, token: string, onCached: (document: StudySyncDocument) => void, cancelled: () => boolean): Promise<StudySyncDocument> {
  const cached = await readCache(userId).catch(() => undefined);
  if (cancelled()) throw new Error('Session changed');
  if (cached) onCached(cached);
  let records = structuredClone(cached?.records ?? {});
  let page: string | null = null;
  let restarted = false;
  await waitForStudyWrites();
  let version = studyWriteVersion();
  while (true) {
    if (cancelled()) throw new Error('Session changed');
    const response: SyncPage = await apiRequest('/api/sync', { method:'POST', token, body:{ cursor:cached?.cursor, page }, timeoutMs:30000 });
    if (cancelled()) throw new Error('Session changed');
    if (version !== studyWriteVersion()) {
      await waitForStudyWrites(); version = studyWriteVersion();
      records = structuredClone(cached?.records ?? {}); page = null; continue;
    }
    if (response.restart) {
      if (restarted) throw new Error('Sync page expired; retry synchronization');
      restarted = true; page = null; records = structuredClone(cached?.records ?? {}); continue;
    }
    if (!page && response.reset) records = {};
    for (const change of response.changes ?? []) {
      const collection = records[change.collection] ??= {};
      if (change.deleted) delete collection[change.id];
      else collection[change.id] = change.value;
    }
    page = response.nextPage ?? null;
    if (page) continue;
    if (!response.cursor) throw new Error('Missing sync cursor');
    const document = { cursor:response.cursor, records };
    await saveCache(userId,document);
    if (version !== studyWriteVersion()) {
      await waitForStudyWrites(); version = studyWriteVersion();
      records = structuredClone(cached?.records ?? {}); page = null; continue;
    }
    return document;
  }
}
