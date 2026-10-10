import { memoryCardFieldLabels, type MemoryCardField } from '../domain/memoryCards';
import { segmentJapanese } from '../domain/wordLookup';
import type { Locale } from '../types';
import './review-cards.css';

type Face = { field: MemoryCardField; lines: string[] }[];
export type ReviewCards = {
  title: string; locale: Locale; total: number; offset: number; next_offset: number | null;
  filters: Record<string, unknown>;
  cards: { id: string; reference?: string; deck: string; front: Face; back: Face }[];
};

export function createReviewCardsView(root: HTMLElement, load: (filters: Record<string, unknown>) => Promise<ReviewCards>, rate: (itemId: string, rating: string, eventId: string) => Promise<void>, lookup?: { query: (word: string) => Promise<{ original: string; reading?: string; meaning_zh?: string; meaning_ja?: string }[]>; enqueue: (word: string, context: string) => Promise<void> }) {
  let data: ReviewCards | null = null;
  let index = 0;
  let flipped = false;
  let busy = false;
  let error = '';
  let saved = '';
  let reviewed = 0;
  let pendingReview: { itemId: string; rating: string; eventId: string } | null = null;
  const node = (tag: string, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  const button = (label: string, action: () => void, disabled = false) => {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label; element.disabled = disabled;
    element.onclick = action;
    return element;
  };
  function lookupText(element: HTMLElement, text: string, japanese: boolean, context: string) {
    if (!lookup) { element.textContent = text; return; }
    const runs = japanese ? [text] : text.split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)/u);
    for (const run of runs) {
      if (!japanese && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(run)) { element.append(document.createTextNode(run)); continue; }
      for (const part of segmentJapanese(run)) {
        if (!part.word) { element.append(document.createTextNode(part.text)); continue; }
        const word = button(part.text, () => void openLookup(part.text, context));
        word.className = 'review-lookup-word'; word.setAttribute('aria-label', `查询「${part.text}」`); element.append(word);
      }
    }
  }
  async function openLookup(word: string, context: string) {
    if (!lookup) return;
    const dialog = document.createElement('dialog'); dialog.className = 'review-lookup-dialog';
    const heading = node('h2', '单词查询'); const input = document.createElement('input');
    input.value = word; input.setAttribute('aria-label', '查询词（可修改）');
    const results = node('div'); const status = node('p'); status.setAttribute('role', 'status');
    const queued = new Set<string>(); let request = 0; let hasMatches = false;
    const enqueue = button('加入待解析队列', () => {
      const query = input.value.trim(); if (!query || queued.has(query) || hasMatches || enqueue.disabled) return;
      enqueue.disabled = true; input.disabled = true; status.textContent = '正在加入…';
      void lookup.enqueue(query, context).then(() => { queued.add(query); status.textContent = '已加入待解析队列'; })
        .catch((cause) => { status.textContent = cause instanceof Error ? cause.message : String(cause); })
        .finally(() => { input.disabled = false; enqueue.disabled = queued.has(input.value.trim()); });
    });
    const search = async () => {
      const current = ++request; const query = input.value.trim(); hasMatches = false; enqueue.hidden = true; enqueue.disabled = true;
      results.textContent = query ? '正在查询…' : '请输入日语单词。';
      if (!query) return;
      try {
        const matches = await lookup.query(query); if (current !== request) return;
        hasMatches = matches.length > 0; enqueue.hidden = hasMatches; enqueue.disabled = hasMatches || queued.has(query);
        results.replaceChildren(...(matches.length ? matches.map(item => node('p', [item.original, item.reading, item.meaning_zh || item.meaning_ja].filter(Boolean).join(' · '))) : [node('p', '暂无释义。')]));
      } catch (cause) { if (current === request) results.textContent = cause instanceof Error ? cause.message : String(cause); }
    };
    input.oninput = () => { status.textContent = ''; void search(); };
    dialog.append(heading, input, results, enqueue, status, button('关闭', () => dialog.close()));
    dialog.onclose = () => dialog.remove(); root.append(dialog); dialog.showModal(); input.focus(); await search();
  }
  function setData(next: ReviewCards) {
    data = next; index = 0; flipped = false; error = ''; render();
  }
  async function fetchPage(offset: number) {
    if (busy) return;
    busy = true; error = ''; render();
    try { setData(await load({ ...data?.filters, offset })); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; render(); }
  }
  async function submitRating(rating: string) {
    const card = data?.cards[index];
    if (!card || !flipped || busy) return;
    busy = true; error = ''; render();
    try {
      if (pendingReview?.itemId !== card.id || pendingReview.rating !== rating) pendingReview = { itemId: card.id, rating, eventId: crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` };
      await rate(card.id, rating, pendingReview.eventId);
      pendingReview = null;
      reviewed++;
      saved = `已保存「${card.front[0]?.lines[0] ?? '卡片'}」的复习结果`;
      data!.cards.splice(index, 1);
      data!.total = Math.max(0, data!.total - 1);
      flipped = false;
      if (index >= data!.cards.length) index = 0;
      if (!data!.cards.length && data!.filters.only_due !== false) {
        try {
          const next = await load({ ...data!.filters, offset: 0 });
          setData(next);
        } catch {
          error = '评价已保存，但读取下一组失败。请重新加载。';
        }
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; render(); }
  }
  function render() {
    const section = node('section', '', 'review-cards');
    const header = node('header');
    header.append(node('span', 'JLPT · 复习卡片', 'eyebrow'), node('p', '先回想，再翻面评价。评价会保存到你的学习进度。', 'muted'));
    section.append(header);
    if (saved) { const status = node('p', saved, 'saved'); status.setAttribute('role', 'status'); section.append(status); }
    if (error) { const alert = node('p', error, 'error'); alert.setAttribute('role', 'alert'); section.append(alert); }
    const card = data?.cards[index];
    if (card && data) {
      const position = node('p', `本次已复习 ${reviewed} 张 · 当前还有 ${data.total} 张到期`, 'position');
      position.setAttribute('aria-live', 'polite'); section.append(position);
      const face = node('article', '', 'card');
      face.setAttribute('aria-label', flipped ? '卡片背面' : '卡片正面');
      face.append(node('span', flipped ? '背面' : '正面', 'eyebrow'));
      const entries = flipped ? card.back : card.front;
      for (const entry of entries) {
        if (entry.field === 'original') {
          const title = node('h1'); title.lang = 'ja'; lookupText(title, entry.lines.join('\n'), true, `复习卡片 · ${card.reference || card.id}\n${entry.lines.join('\n')}`); face.append(title);
        } else {
          const group = node('div', '', 'field');
          group.append(node('h2', memoryCardFieldLabels[data.locale]?.[entry.field] ?? entry.field));
          for (const line of entry.lines) { const text = node('p'); lookupText(text, line, ['reading', 'meaning_ja', 'examples', 'conjugations'].includes(entry.field), `复习卡片 · ${card.reference || card.id}\n${line}`); group.append(text); }
          face.append(group);
        }
      }
      if (!entries.length) face.append(node('p', '这张卡片没有配置可显示的背面文字。'));
      section.append(face);
      const controls = node('nav'); controls.setAttribute('aria-label', '卡片复习');
      if (!flipped) controls.append(button('翻面查看答案', () => { flipped = true; render(); }, busy));
      else {
        for (const [rating, label, interval] of [['forgot', '忘记', '10 分钟'], ['hard', '困难', '1 天'], ['remembered', '记得', '3 天'], ['easy', '简单', '7 天']]) {
          const action = button(`${label} · ${interval}`, () => void submitRating(rating), busy);
          action.dataset.rating = rating;
          controls.append(action);
        }
      }
      section.append(controls);
    } else {
      section.append(node('p', busy ? '正在读取复习卡片…' : data ? reviewed ? `本次完成 ${reviewed} 张卡片；下次复习时间已保存。` : '今天没有到期的卡片。' : '连接后读取你的到期复习卡片。', 'empty'));
      section.append(button('重新加载', () => void fetchPage(0), busy));
    }
    root.replaceChildren(section);
  }
  render();
  return { setData, load: () => fetchPage(0), hasData: () => data !== null,
    showError(message: string) { error = message; render(); } };
}
