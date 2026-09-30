import { memoryCardFieldLabels, type MemoryCardField } from '../domain/memoryCards';
import type { Locale } from '../types';
import './review-cards.css';

type Face = { field: MemoryCardField; lines: string[] }[];
export type ReviewCards = {
  title: string; locale: Locale; total: number; offset: number; next_offset: number | null;
  filters: Record<string, unknown>;
  cards: { id: string; reference?: string; deck: string; front: Face; back: Face }[];
};

export function createReviewCardsView(root: HTMLElement, load: (filters: Record<string, unknown>) => Promise<ReviewCards>, rate: (itemId: string, rating: string) => Promise<void>) {
  let data: ReviewCards | null = null;
  let index = 0;
  let flipped = false;
  let busy = false;
  let error = '';
  let saved = '';
  let reviewed = 0;
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
      await rate(card.id, rating);
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
          const title = node('h1', entry.lines.join('\n')); title.lang = 'ja'; face.append(title);
        } else {
          const group = node('div', '', 'field');
          group.append(node('h2', memoryCardFieldLabels[data.locale]?.[entry.field] ?? entry.field));
          for (const line of entry.lines) group.append(node('p', line));
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
