import { BookOpenText, Compass, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadDiscoveryShares, type DiscoveryShare } from '../../lib/discovery';
import type { Locale } from '../../types';

export function HomeDiscovery({ token, locale }: { token: string; locale: Locale }) {
  const [shares, setShares] = useState<DiscoveryShare[]>([]);
  const copy = locale === 'ja'
    ? { loading: '読み込み中…', empty: '共有されたコンテンツはまだありません', failed: '読み込めませんでした。発見ページで確認してください', discovery: '発見', all: 'すべて見る', wordbook: '単語', practice: '練習', listening: '聴解', words: '語', questions: '問' }
    : locale === 'en'
      ? { loading: 'Loading…', empty: 'No shared content yet', failed: 'Could not load. Check Discover.', discovery: 'Discover', all: 'View all', wordbook: 'Words', practice: 'Practice', listening: 'Listening', words: 'words', questions: 'questions' }
      : { loading: '正在加载…', empty: '暂无分享内容', failed: '暂时无法加载，请到发现页查看', discovery: '发现', all: '查看全部', wordbook: '单词', practice: '专项练习', listening: '听力', words: '词', questions: '题' };
  const [status, setStatus] = useState(copy.loading);
  useEffect(() => {
    let active = true;
    setShares([]);
    setStatus(copy.loading);
    loadDiscoveryShares(token).then((items) => {
      if (!active) return;
      setShares(items.slice(0, 3));
      setStatus(items.length ? '' : copy.empty);
    }).catch(() => { if (active) setStatus(copy.failed); });
    return () => { active = false; };
  }, [token, locale]);
  return <section className="today-discovery" aria-label={copy.discovery}>
    <header><h2><Compass size={20} aria-hidden="true" />{copy.discovery}</h2><a href="#/market">{copy.all}</a></header>
    {status ? <p role="status">{status}</p> : <ul>{shares.map((share) => <li key={share.id}>
      <a href={`#/market/${encodeURIComponent(share.id)}`}>
        <span className="today-discovery-icon">{share.kind === 'wordbook' ? <BookOpenText size={21} /> : <ListChecks size={21} />}</span>
        <strong>{share.title}</strong><small>{share.kind === 'wordbook' ? copy.wordbook : share.kind === 'listening' ? copy.listening : copy.practice} · {share.count} {share.kind === 'wordbook' ? copy.words : copy.questions}</small>
      </a>
    </li>)}</ul>}
  </section>;
}
