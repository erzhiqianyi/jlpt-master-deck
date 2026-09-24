import { memoryCardFieldLabels, type MemoryCardField } from '../domain/memoryCards';
import type { Locale } from '../types';
import './review-cards.css';

type Face = { field: MemoryCardField; lines: string[] }[];
export type ReviewCards = {
  title: string; locale: Locale; total: number; offset: number; next_offset: number | null;
  filters: Record<string, unknown>;
  cards: { id: string; reference?: string; deck: string; front: Face; back: Face }[];
};

export function createReviewCardsView(root: HTMLElement, load: (filters: Record<string, unknown>) => Promise<ReviewCards>) {
  let data: ReviewCards | null = null;
  let index = 0;
  let flipped = false;
  let busy = false;
  let error = '';
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
  function render() {
    const section = node('section', '', 'review-cards');
    const header = node('header');
    header.append(node('span', 'JLPT · 复习卡片', 'eyebrow'), node('p', '翻面回想，按自己的节奏复习。不会修改掌握度。', 'muted'));
    section.append(header);
    if (error) { const alert = node('p', error, 'error'); alert.setAttribute('role', 'alert'); section.append(alert); }
    const card = data?.cards[index];
    if (card && data) {
      const position = node('p', `${data.offset + index + 1} / ${data.total}`, 'position');
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
      const controls = node('nav'); controls.setAttribute('aria-label', '卡片导航');
      controls.append(button('上一张', () => { index--; flipped = false; render(); }, busy || index === 0),
        button(flipped ? '查看正面' : '翻面查看', () => { flipped = !flipped; render(); }, busy),
        button('下一张', () => { index++; flipped = false; render(); }, busy || index >= data.cards.length - 1));
      section.append(controls);
      const pages = node('footer');
      const limit = Number(data.filters.limit ?? 20);
      pages.append(button('上一组', () => void fetchPage(Math.max(0, data!.offset - limit)), busy || data.offset === 0),
        button(busy ? '加载中…' : '下一组', () => void fetchPage(data!.next_offset!), busy || data.next_offset === null));
      section.append(pages);
    } else {
      section.append(node('p', busy ? '正在读取复习卡片…' : data ? '没有符合条件的卡片。' : '连接后读取你的到期复习卡片。', 'empty'));
      section.append(button('重新加载', () => void fetchPage(0), busy));
    }
    root.replaceChildren(section);
  }
  render();
  return { setData, load: () => fetchPage(0), hasData: () => data !== null,
    showError(message: string) { error = message; render(); } };
}
