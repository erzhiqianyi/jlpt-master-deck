const roots = [
  ['/jlpt/.local/listening-audio/', 'listening-audio/'],
  ['/jlpt/.local/listening-recordings/', 'listening-recordings/'],
  ['/jlpt/public/data/review-data/', 'exports/review-data/'],
];
export function objectKey(path) {
  const text = String(path);
  for (const [prefix, keyPrefix] of roots) {
    if (text.startsWith(prefix) && !text.slice(prefix.length).split('/').includes('..')) return keyPrefix + text.slice(prefix.length);
  }
  throw new Error('Unsupported cloud file path');
}
export function requestFiles() {
  const writes = new Map(), deletes = new Set();
  const files = {
    existsSync(path) {
      const text = String(path);
      if (writes.has(text)) return true;
      if (deletes.has(text)) return false;
      // Media existence is verified with R2 when streamed. No local seed files exist.
      return roots.slice(0, 2).some(([prefix]) => text.startsWith(prefix));
    },
    mkdirSync() {},
    readdirSync() { return []; },
    statSync() { throw new Error('Cloud file metadata requires R2'); },
    readFileSync(path) {
      if (writes.has(String(path))) return writes.get(String(path));
      throw new Error('Cloud file reads require the authenticated media endpoint');
    },
    writeFileSync(path, data) {
      objectKey(path);
      writes.set(String(path), typeof data === 'string' ? new TextEncoder().encode(data) : data);
      deletes.delete(String(path));
    },
    unlinkSync(path) {
      objectKey(path);
      writes.delete(String(path));
      deletes.add(String(path));
    },
    createReadStream() { throw new Error('Cloud media must be streamed directly from R2'); },
  };
  return {
    files,
    deleteKeys() { return [...deletes].map(objectKey); },
    async upload(bucket) {
      for (const [path, body] of writes) await bucket.put(objectKey(path), body);
    },
    async remove(bucket) {
      if (deletes.size) await bucket.delete([...deletes].map(objectKey));
    },
  };
}
