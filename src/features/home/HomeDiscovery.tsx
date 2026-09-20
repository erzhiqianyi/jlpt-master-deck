import { BookOpenText, Compass, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadDiscoveryShares, type DiscoveryShare } from '../../lib/discovery';

export function HomeDiscovery({ token, cloud }: { token: string; cloud: boolean }) {
  const [shares, setShares] = useState<DiscoveryShare[]>([]);
  const [status, setStatus] = useState('正在加载…');
  useEffect(() => {
    let active = true;
    setShares([]);
    setStatus('正在加载…');
    loadDiscoveryShares(token, cloud).then((items) => {
      if (!active) return;
      setShares(items.slice(0, 3));
      setStatus(items.length ? '' : '暂无分享内容');
    }).catch(() => { if (active) setStatus('暂时无法加载，请到发现页查看'); });
    return () => { active = false; };
  }, [token, cloud]);
  return <section className="today-discovery" aria-label="发现内容">
    <header><h2><Compass size={20} aria-hidden="true" />发现</h2><a href="#/market">查看全部</a></header>
    {status ? <p role="status">{status}</p> : <ul>{shares.map((share) => <li key={share.id}>
      <a href={`#/market/${encodeURIComponent(share.id)}`}>
        <span className="today-discovery-icon">{share.kind === 'wordbook' ? <BookOpenText size={21} /> : <ListChecks size={21} />}</span>
        <strong>{share.title}</strong><small>{share.kind === 'wordbook' ? '单词' : '专项练习'} · {share.count} {share.kind === 'wordbook' ? '词' : '题'}</small>
      </a>
    </li>)}</ul>}
  </section>;
}
