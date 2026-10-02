/** Count a linked knowledge point once per completed retained attempt. Not lifetime totals. */
export function itemPracticeCounts(attempts) {
  const counts = {};
  const receipts = new Set();
  for (const attempt of attempts) {
    if (!attempt.id || !attempt.completedAt) continue;
    for (const answer of attempt.answers ?? []) {
      if (!answer.itemId || !answer.answeredAt || answer.questionId?.startsWith('memory-card:')) continue;
      const receipt = JSON.stringify([attempt.id, answer.itemId]);
      if (receipts.has(receipt)) continue;
      receipts.add(receipt);
      counts[answer.itemId] = (counts[answer.itemId] ?? 0) + 1;
    }
  }
  return counts;
}
