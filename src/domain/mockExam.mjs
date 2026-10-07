export function canScoreExamQuestion(question) {
  return question.scoringReady !== false && question.choices.length > 1
    && Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex < question.choices.length;
}

export function examSessionKey(userId, cycleId, date) {
  return `jlpt-exam-session:${userId}:${cycleId}:${date}`;
}

/** Content edits invalidate an old result, so changed answers cannot silently alter a saved score. */
export function readExamAttempt(storage, key, questions) {
  const revision = JSON.stringify(questions);
  const empty = { revision, answers: {}, submitted: false };
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (saved?.revision !== revision || !saved.answers || typeof saved.answers !== 'object' || Array.isArray(saved.answers)) return empty;
    const answers = Object.fromEntries(questions.filter(canScoreExamQuestion).flatMap((question) => {
      const value = saved.answers[question.id];
      return Number.isInteger(value) && value >= 0 && value < question.choices.length ? [[question.id, value]] : [];
    }));
    const assemblyOrders=Object.fromEntries(questions.flatMap(question=>{
      const order=saved.assemblyOrders?.[question.id],options=question.presentation?.payload.options??[];
      return Array.isArray(order)&&order.length===options.length&&new Set(order).size===options.length&&order.every(id=>options.some(option=>option.id===id)) ? [[question.id,order]] : [];
    }));
    return { revision, answers, ...(Object.keys(assemblyOrders).length?{assemblyOrders}:{}), submitted: saved.submitted === true, startedAt: typeof saved.startedAt === 'string' && Number.isFinite(Date.parse(saved.startedAt)) ? saved.startedAt : undefined };
  } catch { return empty; }
}

export function examSessionScore(questions, answers) {
  const eligible = questions.filter(canScoreExamQuestion);
  return { total: eligible.length, answered: eligible.filter(q => Number.isInteger(answers[q.id])).length,
    correct: eligible.filter(q => answers[q.id] === q.answerIndex).length, excluded: questions.length - eligible.length };
}
