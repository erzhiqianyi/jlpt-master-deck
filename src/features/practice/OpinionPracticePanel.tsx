import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { opinionPractices } from '../../data/opinionPractice';
import './opinion-practice.css';

const timingSteps = [
  ['立场', '20秒'],
  ['理由', '30秒'],
  ['具体例', '35秒'],
  ['回应另一面', '20秒'],
  ['总结', '15秒'],
];

const splitOutline = (outline: string) => outline.split('→').map((part) => part.trim()).filter(Boolean);

export function OpinionPracticePanel({ topicId }: { topicId?: string }) {
  const topic = opinionPractices.find((item) => item.id === topicId);
  if (topicId && !topic) return <p role="status">没有找到这个主题，请返回意见表达列表重新选择。</p>;
  if (!topic) return (
    <LearningCatalog title="意见表达" items={opinionPractices} searchText={(item) => `${item.title} ${item.description}`} onBack={() => { window.location.hash = '#/mixed/tips'; }} renderRow={(item) => <LearningListRow key={item.id} title={item.title} description={item.description} onOpen={() => { window.location.hash = `#/mixed/tips/opinion/${item.id}`; }}/>}/>

  );
  return (
    <article className="opinion-practice" aria-label={topic.title}>
      <p className="opinion-meta">意见表达 · 约2分钟 · {topic.description}</p>
      <div className="opinion-layout">
        <section className="opinion-panel opinion-question" aria-labelledby="opinion-question-title">
          <span className="opinion-section-label">题目 · {topic.title}</span>
          <h3 id="opinion-question-title" lang="ja">{topic.prompt}</h3>
          <div className="opinion-task">
            <span>你的任务</span>
            <p>{topic.task}</p>
          </div>
        </section>
        <aside className="opinion-panel opinion-tips" aria-labelledby="opinion-tips-title">
          <span className="opinion-section-label">技巧</span>
          <h3 id="opinion-tips-title">先用提纲说一遍</h3>
          <div className="opinion-outline" role="list">
            {splitOutline(topic.outline).map((item, index) => (
              <div className="opinion-outline-step" role="listitem" key={item}>
                <span aria-hidden="true">{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <details className="opinion-guide">
            <summary>时间怎么分配？</summary>
            <dl className="opinion-timing">
              {timingSteps.map(([label, time]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{time}</dd>
                </div>
              ))}
            </dl>
            <p>先记关键词，自己说一遍；再看参考表达，最后脱稿重说。建议控制在1分45秒到2分15秒。</p>
          </details>
        </aside>
      </div>
      <details className="opinion-panel opinion-reference" key={topic.id}>
        <summary>
          <span>参考表达</span>
          <strong>说过一遍后再打开</strong>
        </summary>
        <div className="opinion-reference-body">
          <p className="opinion-reference-note">以下是表达示例，不是唯一答案。可以借用句型，再换成自己的理由和例子。</p>
          {topic.voices.length > 0 ? (
            <section>
              <h3>对方的意见</h3>
              {topic.voices.map((voice) => <p lang="ja" key={voice}>{voice}</p>)}
            </section>
          ) : null}
          {topic.models.map((model) => (
            <section key={model.title}>
              <h3>{model.title}</h3>
              <p lang="ja">{model.lines.join('')}</p>
            </section>
          ))}
        </div>
      </details>
      <div className="opinion-status">
        <strong>现在可以练：</strong>
        <span>看题目 → 用技巧组织 → 说完后看参考表达。录音与 shadowing 尚未开放。</span>
      </div>
    </article>
  );
}
