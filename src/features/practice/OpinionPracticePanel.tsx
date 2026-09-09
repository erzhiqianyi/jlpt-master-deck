import { BookOpenText, ChevronRight } from 'lucide-react';
import { opinionPractices } from '../../data/opinionPractice';
import './opinion-practice.css';

export function OpinionPracticePanel({ topicId }: { topicId?: string }) {
  const topic = opinionPractices.find((item) => item.id === topicId);
  if (topicId && !topic) return <p role="status">没有找到这个主题，请返回意见表达列表重新选择。</p>;
  if (!topic) return (
    <section className="topic-library opinion-library" aria-label="意见表达列表">
      <div className="opinion-list-summary"><p>选一个主题，练习说清立场、理由和例子。</p><span>{opinionPractices.length} 个主题 · 每次约2分钟</span></div>
      <ul className="topic-library-rows">
        {opinionPractices.map((item) => (
          <li key={item.id}>
            <a className="topic-library-row" href={`#/mixed/tips/opinion/${item.id}`}>
              <span className="topic-library-icon"><BookOpenText size={26} aria-hidden="true" /></span>
              <span className="topic-library-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
              <span className="topic-library-status">约2分钟</span>
              <span className="topic-library-action">查看<ChevronRight size={18} aria-hidden="true" /></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <article className="opinion-practice" aria-label={topic.title}>
      <div className="opinion-content">
        <p className="opinion-note">意见表达 · 约2分钟 · 准备时间另计</p>
        <h2 lang="ja">{topic.prompt}</h2>
        <p><strong>你的任务：</strong>{topic.task}</p>
        <p><strong>提纲：</strong>{topic.outline}</p>
        <details className="opinion-guide">
          <summary>怎样组织这2分钟？</summary>
          <p>立场20秒 → 理由30秒 → 具体例35秒 → 回应另一面20秒 → 总结15秒。</p>
          <p>先记关键词，自己说一遍；再看参考表达，最后脱稿重说。建议控制在1分45秒—2分15秒，不必每段精确卡秒。</p>
          <p>可以练直接表达、赞同并补充，或委婉反对。不同立场都可以成立。</p>
        </details>
        <details className="opinion-reference" key={topic.id}>
          <summary>说过一遍后，查看参考表达</summary>
          <p>以下是局部表达示例，完整作答还需展开自己的理由和例子。</p>
          <h3>对方的意见</h3>
          {topic.voices.map((voice) => <p lang="ja" key={voice}>{voice}</p>)}
          {topic.models.map((model) => (
            <section key={model.title}><h3>{model.title}</h3><p lang="ja">{model.lines.join('')}</p></section>
          ))}
        </details>
      </div>
      <p className="opinion-note">当前可查看题目、提纲和参考表达。录音与 shadowing 尚未开放。</p>
    </article>
  );
}
