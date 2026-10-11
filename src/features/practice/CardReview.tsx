// 記憶カード（v3）：表を見て思い出し、裏を見てから自己評価する。表・裏の内容は選んだテンプレートで決まる。
import { SpeechControls } from '../../components/SpeechControls';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../types';
import { createV3Client } from '../../v3/client';
import type { Card, CardItem, CardRating } from '../../v3/types';
import { MediaView } from '../question-bank/QuestionBank';
import { practiceText } from './practiceText';
import '../library/library.css';
import './practice.css';

const RATINGS: CardRating[] = ['forgot', 'hard', 'remembered', 'easy'];
const newEventId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function CardReview({ token, locale, onExit }: { token: string; locale: Locale; onExit: () => void }) {
  const client = useMemo(() => createV3Client(token), [token]);
  const t = practiceText(locale);
  const [deck, setDeck] = useState<{ due: number; new: number; cards: Card[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { client.dueCards({ limit: 50 }).then(setDeck).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [client]);
  const card = deck?.cards[index];
  const rate = useCallback(async (rating: CardRating) => {
    if (!card) return;
    setBusy(true); setError('');
    try {
      const result = await client.rateCard(card.code, rating, newEventId());
      setLast(result.schedule && 'dueAt' in result.schedule && result.schedule.dueAt ? new Date(result.schedule.dueAt).toLocaleString(locale) : null);
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [card, client, locale]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === ' ' && !revealed) { event.preventDefault(); setRevealed(true); }
      const n = Number(event.key);
      if (revealed && n >= 1 && n <= 4 && !busy) void rate(RATINGS[n - 1]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [revealed, busy, rate]);

  const nav = <nav className="library-detail-nav"><button type="button" onClick={onExit}>{t.exit}</button>{deck ? <span>{t.dueCount(deck.due, deck.new)} · {Math.min(index + 1, deck.cards.length)}/{deck.cards.length}</span> : null}</nav>;
  if (!deck) return <section className="library">{nav}<p className={error ? 'library-error' : 'library-empty'}>{error || t.loading}</p></section>;
  if (!card) return <section className="library">{nav}<p className="library-empty">{t.cardsDone}</p>{last ? <p className="library-muted">{t.nextReview}：{last}</p> : null}</section>;
  return (
    <section className="library card-review">
      {nav}
      <article className="memory-card" data-revealed={revealed}>
        <div className="memory-card-face">{card.front.map((f) => <CardField key={f.field} field={f.field} items={f.items} client={client} front />)}</div>
        {revealed ? <div className="memory-card-face memory-card-back">{card.back.map((f) => <CardField key={f.field} field={f.field} items={f.items} client={client} />)}</div> : null}
      </article>
      {error ? <p className="library-error">{error}</p> : null}
      {revealed ? (
        <div className="card-ratings">
          {RATINGS.map((r, i) => <button key={r} type="button" data-rating={r} disabled={busy} onClick={() => void rate(r)}>{t[r]}<small>{i + 1}</small></button>)}
        </div>
      ) : <button type="button" className="library-button card-show" onClick={() => setRevealed(true)}>{t.show}</button>}
      {last ? <p className="library-muted">{t.nextReview}：{last}</p> : null}
    </section>
  );
}

function CardField({ field, items, client, front = false }: { field: string; items: CardItem[]; client: ReturnType<typeof createV3Client>; front?: boolean }) {
  return (
    <div className={`memory-field memory-field-${field}`} data-front={front}>
      {items.map((item, i) => item.mediaId || item.url ? (
        <figure key={i}>{item.mediaId ? <MediaView client={client} id={item.mediaId} kind="image" /> : <img src={item.url ?? ''} alt={item.caption ?? ''} className="bank-image" />}
          {item.caption ? <figcaption className="library-muted">{item.caption}</figcaption> : null}</figure>
      ) : (
        <p key={i}>
          {item.title ? <strong>{item.title}　</strong> : null}
          <span lang={item.lang}>{item.text}</span>
          {item.lang === 'ja' && item.text && (field === 'expression' || field === 'example') ? <SpeechControls text={item.text} iconOnly /> : null}
          {item.translation ? <span className="library-muted memory-translation">{item.translation}</span> : null}
        </p>
      ))}
    </div>
  );
}
