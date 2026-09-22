import { Fragment, type ReactNode } from 'react';
import './StudyText.css';

/** A deliberately small, text-only format. HTML and links are never interpreted. */
export function StudyText({ text, renderText = (value) => value, className = '' }: {
  text: string;
  renderText?: (value: string) => ReactNode;
  className?: string;
}) {
  const inline = (value: string): ReactNode => value.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{renderText(part.slice(2, -2))}</strong>;
    return <Fragment key={index}>{renderText(part)}</Fragment>;
  });
  // Imported notes sometimes contain escaped newlines rather than actual ones.
  // Preserve inline code verbatim, including examples containing a literal \n.
  const normalized = text.split(/(`[^`\n]+`)/g).map((part) => part.startsWith('`') ? part : part
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/([^\n])\s*(?=【[^】\n]{1,24}】)/g, '$1\n')).join('').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: ReactNode[] = [];
  const listMatch = (line: string) => line.match(/^\s*(?:([-+*])\s+|(\d+)[.)]\s+)(.+)$/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const section = line.match(/^【([^】]{1,24})】\s*(.*)$/);
    if (heading || section) {
      blocks.push(<h4 key={`heading-${index}`}>{inline((heading ?? section)![1])}</h4>);
      if (section?.[2]) blocks.push(<p key={`section-${index}`}>{inline(section[2])}</p>);
      index += 1;
      continue;
    }
    const list = listMatch(line);
    if (list) {
      const startIndex = index;
      const ordered = Boolean(list[2]);
      const entries: ReactNode[] = [];
      while (index < lines.length) {
        const entry = listMatch(lines[index]);
        if (!entry || Boolean(entry[2]) !== ordered) break;
        entries.push(<li key={index}>{inline(entry[3])}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={startIndex} start={Number(list[2])}>{entries}</ol> : <ul key={startIndex}>{entries}</ul>);
      continue;
    }
    const startIndex = index;
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s+.+|【[^】]{1,24}】)/.test(lines[index].trim()) && !listMatch(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={startIndex}>{inline(paragraph.join('\n'))}</p>);
  }
  return <div className={`study-text ${className}`}>{blocks}</div>;
}
