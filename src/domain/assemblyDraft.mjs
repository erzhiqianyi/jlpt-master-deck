/** UI-only progress: a partial arrangement is never a scored/submitted answer. */
export function assemblyDraftKey(scope, questionId) {
  return scope && questionId ? `jlpt-assembly-draft:${encodeURIComponent(scope)}:${encodeURIComponent(questionId)}` : undefined;
}
export function assemblyDraftRevision(presentation) {
  return JSON.stringify({ options: presentation.payload.options, assembly: presentation.payload.legacy.assembly, prompt: presentation.payload.legacy.prompt, materialRefs: presentation.payload.materialRefs });
}
export function readAssemblyDraft(storage, key, presentation) {
  if (!key || !presentation.payload.legacy.assembly) return [];
  try {
    const draft=JSON.parse(storage.getItem(key)??'null'),options=presentation.payload.options??[];
    return draft?.revision===assemblyDraftRevision(presentation) && Array.isArray(draft.order) && draft.order.length<=options.length && new Set(draft.order).size===draft.order.length && draft.order.every(id=>options.some(option=>option.id===id)) ? draft.order : [];
  } catch { return []; }
}
export function writeAssemblyDraft(storage, key, presentation, order) {
  if (!key) return true;
  try { storage.setItem(key,JSON.stringify({revision:assemblyDraftRevision(presentation),order}));return true; } catch {return false;}
}
