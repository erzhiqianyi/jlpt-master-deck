(() => {
const root = document.querySelector('.discover-community');
const tabs = root.querySelectorAll('[data-tab]');
const search = root.querySelector('input');
const subjects = root.querySelectorAll('.discover-subjects button');
const subjectIds = ['all', 'vocabulary', 'grammar', 'reading', 'listening'];
let tab = 'all', subject = 'all', signedIn = false;
const lang = document.documentElement.lang;
const copy = lang === 'en' ? ['Practice', 'questions', 'words', 'No matching content', 'Sign in to explore shared practice.'] : lang === 'ja' ? ['練習', '問', '語', '該当するコンテンツがありません', 'ログインして共有練習を探せます。'] : ['练习', '题', '词', '暂无符合条件的内容', '登录后查看共享练习。'];
function update() {
  let count = 0;
  root.querySelectorAll('.discover-card').forEach(card => {
    const practice = card.dataset.kind === 'practice';
    card.hidden = (tab === 'practice' && !practice) || (tab === 'article' && practice) || (tab === 'practice' && subject !== 'all' && !(card.dataset.subjects ?? '').split(',').includes(subject)) || !card.dataset.title.toLowerCase().includes(search.value.trim().toLowerCase());
    if (!card.hidden) count++;
  });
  tabs.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
  root.querySelector('.discover-subjects').hidden = tab !== 'practice';
  subjects.forEach((button, index) => button.setAttribute('aria-pressed', String(subjectIds[index] === subject)));
  root.querySelector('.discover-practice-link').hidden = tab !== 'practice' || signedIn;
  const empty = root.querySelector('.discover-empty');
  empty.hidden = count > 0;
  empty.textContent = tab === 'practice' && !signedIn ? copy[4] : copy[3];
}
tabs.forEach(button => button.addEventListener('click', () => { tab = button.dataset.tab; update(); }));
subjects.forEach((button, index) => button.addEventListener('click', () => { subject = subjectIds[index]; update(); }));
search.addEventListener('input', update);
root.querySelector('.discover-search-toggle').addEventListener('click', event => { const open = root.classList.toggle('search-open'); event.currentTarget.setAttribute('aria-expanded', String(open)); if (open) search.focus(); });
function element(tag, className, text) { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
async function loadPractice() {
  let token; try { token = localStorage.getItem('jlpt-auth-token-v1'); } catch { return; }
  if (!token) return;
  try {
    const response = await fetch('/api/market', { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const { shares } = await response.json();
    if (!Array.isArray(shares)) return;
    signedIn = true;
    shares.forEach((share, index) => {
      const card = element('a', 'discover-card'); card.href = `/#/market/${encodeURIComponent(share.id)}`;
      card.dataset.kind = 'practice'; card.dataset.title = share.title; card.dataset.subjects = (share.categories ?? []).join(','); card.style.order = index * 2;
      const art = element('div', 'discover-art'); const image = element('img', ''); image.alt = ''; image.loading = 'lazy';
      const cover = ['stairs','clock','coffee','gold'].includes(share.cover) ? share.cover : 'stairs';
      let coverUrl; try { const url = new URL(share.coverUrl, location.origin); if (share.coverUrl && ['http:', 'https:'].includes(url.protocol)) coverUrl = url.href; } catch { }
      image.src = coverUrl || `/images/discovery/${cover}.png`; art.append(image, element('span','discover-badge is-practice',copy[0]));
      if (!coverUrl) art.append(element('strong','', [share.coverTitle || share.title, share.level].filter(Boolean).join(' · ')));
      card.append(art,element('h2','',share.title),element('p','',`${share.count} ${share.kind === 'wordbook' ? copy[2] : copy[1]}`)); root.querySelector('.discover-grid').append(card);
    }); update();
  } catch { }
}
root.querySelectorAll('.discover-card').forEach((card,index) => { card.style.order = index * 2 + 1; });
update(); void loadPractice();
})();
