

export function replayRouteAttemptId(itemId?: string) {
  return itemId?.startsWith('replay:') ? itemId.slice('replay:'.length) : undefined;
}
