/** Convert older paragraph notes and literal escaped line breaks into one exam point per entry. */
export function normalizeCoreMemory(value) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const normalized = value.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n')
    .replace(/([^\n])\s*(?=【[^】\n]{1,24}】)/gu, '$1\n');
  return normalized.split('\n').map((point) => point.trim()).filter(Boolean);
}

export function coreMemoryText(value) {
  return normalizeCoreMemory(value).join('\n');
}
