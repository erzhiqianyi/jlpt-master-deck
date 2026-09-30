const DB_NAME = 'jlpt-listening-clip-drafts';
const STORE = 'clips';

type ClipDraft = { key: string; transcript: string; index: number; audio: Blob };

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T;
    run(store, (value) => { result = value; });
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function loadListeningClipDrafts(audioId: string, transcript: string): Promise<Record<number, Blob>> {
  return transaction('readonly', (store, done) => {
    const result: Record<number, Blob> = {};
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(result); return; }
      const value = cursor.value as ClipDraft;
      if (value.key.startsWith(`${audioId}:`) && value.transcript === transcript) result[value.index] = value.audio;
      cursor.continue();
    };
  });
}

export async function saveListeningClipDraft(audioId: string, transcript: string, index: number, audio: Blob): Promise<void> {
  await transaction<void>('readwrite', (store, done) => { store.put({ key: `${audioId}:${index}`, transcript, index, audio } satisfies ClipDraft); done(); });
}

export async function clearListeningClipDrafts(audioId: string): Promise<void> {
  await transaction<void>('readwrite', (store, done) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(); return; }
      if (String(cursor.key).startsWith(`${audioId}:`)) cursor.delete();
      cursor.continue();
    };
  });
}
