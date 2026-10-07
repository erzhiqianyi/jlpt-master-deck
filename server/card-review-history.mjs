export const CARD_RATINGS = ['forgot', 'hard', 'remembered', 'easy'];
export function normalizeDailyPracticeSources(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let timeZone = typeof value.timeZone === 'string' ? value.timeZone : 'Asia/Tokyo';
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { timeZone = 'Asia/Tokyo'; }
  return {
    answers: value.answers !== false, cardReviews: value.cardReviews !== false,
    ratings: Array.isArray(value.ratings) ? [...new Set(value.ratings.filter(r => CARD_RATINGS.includes(r)))] : ['forgot', 'hard'],
    window: value.window === 'last_hours' ? 'last_hours' : 'previous_day',
    hours: Number.isFinite(Number(value.hours)) ? Math.max(1, Math.min(720, Math.round(Number(value.hours)))) : 24,
    timeZone, runAt: /^([01]\d|2[0-3]):[0-5]\d$/.test(value.runAt) ? value.runAt : '07:00',
  };
}
export function ensureCardReviewSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS card_reviews (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, item_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK(rating IN ('forgot','hard','remembered','easy')),
    reviewed_at TEXT NOT NULL, source TEXT NOT NULL,
    PRIMARY KEY(user_id,event_id)
  ); CREATE TABLE IF NOT EXISTS card_review_sync_baselines (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id TEXT NOT NULL, progress_json TEXT NOT NULL,
    PRIMARY KEY(user_id,item_id)
  ); CREATE TABLE IF NOT EXISTS card_review_sync_events (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id TEXT NOT NULL, item_id TEXT NOT NULL,
    PRIMARY KEY(user_id,event_id)
  ); CREATE INDEX IF NOT EXISTS card_reviews_user_time ON card_reviews(user_id,reviewed_at);`);
  // Existing replay events retain their legacy count contribution. New events
  // affect SRS only, so upgrading cannot silently recalculate old totals.
  if (!db.prepare('PRAGMA table_info(card_reviews)').all().some(c=>c.name==='count_semantics')) {
    db.exec("ALTER TABLE card_reviews ADD COLUMN count_semantics TEXT NOT NULL DEFAULT 'legacy_mixed'");
  }
}
export function insertCardReview(db, userId, { eventId, itemId, rating, reviewedAt, source = 'app' }) {
  if (!CARD_RATINGS.includes(rating) || !eventId || !itemId || !Number.isFinite(Date.parse(reviewedAt))) throw new Error('Invalid card review event');
  const time = new Date(reviewedAt).toISOString();
  const existing = db.prepare('SELECT * FROM card_reviews WHERE user_id=? AND event_id=?').get(userId, eventId);
  if (existing) {
    if (existing.item_id !== itemId || existing.rating !== rating || existing.reviewed_at !== time) throw new Error('Card review event ID conflicts with saved event');
    return false;
  }
  db.prepare("INSERT INTO card_reviews(user_id,event_id,item_id,rating,reviewed_at,source,count_semantics) VALUES(?,?,?,?,?,?,'subjective_only')").run(userId,eventId,itemId,rating,time,source);
  return true;
}
export function listCardReviews(db, userId, { start, end } = {}) {
  start = start == null ? null : new Date(start).toISOString();
  end = end == null ? null : new Date(end).toISOString();
  return db.prepare(`SELECT event_id AS eventId,item_id AS itemId,rating,reviewed_at AS reviewedAt,source
    FROM card_reviews WHERE user_id=? AND (? IS NULL OR reviewed_at>=?) AND (? IS NULL OR reviewed_at<?)
    ORDER BY reviewed_at,event_id`).all(userId,start ?? null,start ?? null,end ?? null,end ?? null);
}
export function cardReviewStats(events) {
  const ratings = Object.fromEntries(CARD_RATINGS.map(r => [r, 0]));
  for (const e of events) ratings[e.rating]++;
  return { totalReviews: events.length, uniqueCards: new Set(events.map(e => e.itemId)).size, ratings };
}
// Calendar boundaries are resolved in the user's zone, including daylight-saving changes.
function midnight(day, timeZone) {
  const target = Date.parse(`${day}T00:00:00Z`);
  let candidate = target;
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' });
  for (let n=0;n<4;n++) {
    const local = Date.parse(f.format(new Date(candidate)).replace(' ', 'T') + 'Z');
    const delta = target-local;
    candidate += delta;
    if (!delta) break;
  }
  return new Date(candidate).toISOString();
}
export function calendarDayWindow(day,timeZone='Asia/Tokyo') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)!==day) throw new Error('Invalid calendar date');
  new Intl.DateTimeFormat('en',{timeZone}).format();
  const following=new Date(Date.parse(`${day}T00:00:00Z`)+86400000).toISOString().slice(0,10);
  const start=midnight(day,timeZone),end=midnight(following,timeZone);
  if (Date.parse(end)<=Date.parse(start)) throw new Error('Calendar date has no positive time window');
  return {kind:'calendar_day',date:day,timeZone,start,end};
}
export function practiceSourceWindow(settings, { start, end, now = new Date() } = {}) {
  if (start || end) {
    if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start)>=Date.parse(end)) throw new Error('Provide a valid start and end (exclusive)');
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  }
  if (settings.window === 'last_hours') return { start: new Date(now.getTime()-settings.hours*3600000).toISOString(), end: now.toISOString() };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone:settings.timeZone,year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now).map(p=>[p.type,p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const yesterday = new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  return { start: midnight(yesterday,settings.timeZone), end: midnight(today,settings.timeZone) };
}

// Preserve pre-migration progress; only newly accepted events are replayed over it.
// Caller wraps event insertion and progress persistence in the same transaction.
export function mergedCardProgress(db, userId, itemId, eventId, current = {}) {
  db.prepare('INSERT OR IGNORE INTO card_review_sync_baselines(user_id,item_id,progress_json) VALUES(?,?,?)')
    .run(userId, itemId, JSON.stringify(current));
  db.prepare('INSERT INTO card_review_sync_events(user_id,event_id,item_id) VALUES(?,?,?)').run(userId,eventId,itemId);
  const baseline = JSON.parse(db.prepare('SELECT progress_json FROM card_review_sync_baselines WHERE user_id=? AND item_id=?').get(userId,itemId).progress_json);
  const events = db.prepare(`SELECT r.event_id,r.rating,r.reviewed_at,r.count_semantics FROM card_reviews r
    JOIN card_review_sync_events e ON e.user_id=r.user_id AND e.event_id=r.event_id
    WHERE r.user_id=? AND e.item_id=? ORDER BY r.reviewed_at,r.event_id`).all(userId,itemId);
  let result = { ...baseline,correct:baseline.correct??0,wrong:baseline.wrong??0 };
  const intervals = { forgot:0, hard:1, remembered:3, easy:7 };
  const deltas = { forgot:-0.2, hard:-0.05, remembered:0.05, easy:0.15 };
  // Close reviews do not erase a recent lapse, regardless of arrival order.
  const latest = Math.max(Date.parse(baseline.lastReviewedAt) || 0, ...events.map(e => Date.parse(e.reviewed_at)));
  let scheduleRating;
  for (const event of events) {
    const previousCount = result.reviewCount ?? 0;
    if (event.count_semantics==='legacy_mixed') {
      result.correct = (result.correct ?? 0) + (event.rating === 'forgot' ? 0 : 1);
      result.wrong = (result.wrong ?? 0) + (event.rating === 'forgot' ? 1 : 0);
    }
    result.reviewCount = previousCount + 1;
    result.ease = Math.max(1.3, Math.min(3, (result.ease ?? 2.5) + deltas[event.rating]));
    if (!result.firstSeenAt || Date.parse(event.reviewed_at) < Date.parse(result.firstSeenAt)) result.firstSeenAt = event.reviewed_at;
    if (Date.parse(event.reviewed_at) >= latest - 5 * 60 * 1000) {
      if (!scheduleRating || intervals[event.rating] < intervals[scheduleRating]) scheduleRating = event.rating;
    }
  }
  if (scheduleRating && latest >= (Date.parse(baseline.lastReviewedAt) || 0)) {
    // Include the existing schedule when it lies within the close-review window.
    const candidate = latest + (scheduleRating === 'forgot' ? 600000 : intervals[scheduleRating] * 86400000);
    const baseDue = Date.parse(baseline.nextReviewAt);
    // Objective answer schedules must not shorten a later explicit card rating.
    const baselineReview = db.prepare('SELECT rating FROM card_reviews WHERE user_id=? AND item_id=? AND reviewed_at=? AND event_id<>?').get(userId,itemId,baseline.lastReviewedAt ?? '',eventId);
    const nearbyBaseline = baselineReview && Math.abs(latest - Date.parse(baseline.lastReviewedAt)) <= 300000;
    result.nextReviewAt = new Date(nearbyBaseline && Number.isFinite(baseDue) ? Math.min(candidate,baseDue) : candidate).toISOString();
    result.lastReviewedAt = new Date(latest).toISOString();
    result.intervalDays = nearbyBaseline && Number.isFinite(baseDue) ? Math.min(intervals[scheduleRating], baseline.intervalDays ?? intervals[scheduleRating]) : intervals[scheduleRating];
    result.status = result.intervalDays === 0 ? 'learning' : result.reviewCount >= 5 ? 'mastered' : 'review';
  }
  return result;
}
