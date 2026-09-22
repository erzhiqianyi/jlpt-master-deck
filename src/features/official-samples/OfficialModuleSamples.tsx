import { LearningCatalog } from '../../components/LearningCatalog';
import { LearningList, LearningListRow } from '../../components/LearningList';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  officialModuleMeta,
  samplesForModule,
  type OfficialModuleSample,
  type OfficialSampleModule,
} from '../../data/officialModuleSamples';
import type { Locale } from '../../types';

const OFFICIAL_TYPES_URL = 'https://www.jlpt.jp/e/guideline/testsections.html';
const OFFICIAL_PURPOSES_URL = 'https://www.jlpt.jp/e/guideline/pdf/n1_e_revised.pdf';
const OFFICIAL_SAMPLES_URL = 'https://www.jlpt.jp/e/samples/sampleindex.html';
const SAMPLE_INDEX_PAGE_SIZE = 8;
const localOfficialNotice: Record<Locale, string> = {
  'zh-CN': '已载入本机 .local 官方题 demo；这些资源仅供个人本地备考使用。',
  ja: 'ローカルの .local 公式問題デモを読み込みました。個人学習用です。',
  en: 'Loaded local .local official-question demo resources for personal study.',
};
const localOfficialBadge: Record<Locale, string> = {
  'zh-CN': '本地官方题 · 不进 Git',
  ja: 'ローカル公式問題・Git対象外',
  en: 'Local official item · not in Git',
};

type SharedProps = {
  module: OfficialSampleModule;
  labels: Record<string, string>;
  locale: Locale;
  token?: string;
};

export function OfficialModuleSamples({ module, sampleId, labels, locale, token, onOpen, onBack }: SharedProps & {
  sampleId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  return sampleId
    ? <OfficialSampleDetail module={module} sampleId={sampleId} labels={labels} locale={locale} token={token} onBack={onBack} />
    : <OfficialSampleIndex module={module} labels={labels} locale={locale} token={token} onOpen={onOpen} />;
}

export function OfficialSampleEntry({ module, labels, locale, onOpen }: SharedProps & { onOpen: () => void }) {
  const meta = officialModuleMeta[module];
  const count = samplesForModule(module).length;

  return (
    <section className="flex min-w-0 flex-col gap-3 border-b border-[#d7dfd6] pb-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold text-[#7d6032]">{labels.sampleOfficialStructure}</p>
        <h2 className="mt-1 text-lg font-semibold text-[#27312c]">{meta.title[locale]}</h2>
        <p className="mt-1 text-sm leading-6 text-[#68716b]">{labels.sampleEntryBody.replace('{count}', String(count))}</p>
      </div>
      <button type="button" onClick={onOpen} className="h-10 shrink-0 rounded-md border border-[#c8d1c8] bg-white px-4 text-sm font-semibold text-[#31564c] hover:bg-[#f3f6f1]">
        {labels.sampleOpenIndex} →
      </button>
    </section>
  );
}

function OfficialSampleIndex({ module, labels, locale, onOpen }: SharedProps & { onOpen: (id: string) => void }) {
  const meta = officialModuleMeta[module];
  const localSamples = useLocalOfficialSamples(module);
  const samples = [...localSamples, ...samplesForModule(module)];
  return (
    <section className="min-w-0">
      <LearningCatalog columnLabels={locale === "ja" ? ["サンプル", "目安時間", null] : locale === "en" ? ["Sample", "Estimated time", null] : ["样题", "预计用时", null]} title={meta.title[locale]} items={samples} locale={locale} notice={<>{meta.body[locale]} {localSamples.length ? localOfficialNotice[locale] : ''}</>} searchText={(sample) => `${sample.title[locale]} ${sample.officialName}`} renderRow={(sample) => <LearningListRow key={sample.id} title={sample.title[locale]} reading={sample.officialName} description={labels.sampleEstimatedMinutes.replace('{minutes}', String(sample.estimatedMinutes))} locale={locale} onOpen={() => onOpen(sample.id)}/>}/>

      <OfficialSourceFooter labels={labels} />
    </section>
  );
}

function OfficialSampleDetail({ module, sampleId, labels, locale, onBack }: SharedProps & { sampleId: string; onBack: () => void }) {
  const localSamples = useLocalOfficialSamples(module);
  const sample = [...localSamples, ...samplesForModule(module)].find((candidate) => candidate.id === sampleId);
  const [selected, setSelected] = useState<number | null>(null);
  const [subAnswers, setSubAnswers] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const subQuestions = sample?.subQuestions ?? [];
  const hasSubQuestions = subQuestions.length > 0;
  const answeredCount = subQuestions.filter((item) => subAnswers[item.id] !== undefined).length;
  const correctCount = subQuestions.filter((item) => subAnswers[item.id] === item.answerIndex).length;

  useEffect(() => {
    setSelected(null);
    setSubAnswers({});
    setRevealed(false);
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    return () => window.speechSynthesis?.cancel();
  }, [sampleId]);

  if (!sample) {
    return (
      <section className="py-10">
        <p className="text-sm text-[#68716b]">{labels.sampleNotFound}</p>
        <button type="button" onClick={onBack} className="mt-4 min-h-10 text-sm font-semibold text-[#31564c] hover:underline">← {labels.sampleBackToIndex}</button>
      </section>
    );
  }

  function playSpeech() {
    if (!sample?.ttsText || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sample.ttsText);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.92;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  return (
    <article className="min-w-0">
      <button type="button" onClick={onBack} className="min-h-10 text-sm font-semibold text-[#31564c] hover:underline">← {labels.sampleBackToIndex}</button>

      <header className="mt-3 border-b border-[#d7dfd6] pb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#7d6032]">JLPT N1 · {sample.officialName}</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#27312c]">{sample.title[locale]}</h1>
            <p className="mt-2 text-sm leading-6 text-[#68716b]">{sample.summary[locale]}</p>
          </div>
          <span className="w-fit rounded bg-[#f1ead7] px-2 py-1 text-xs font-semibold text-[#765c25]">{sample.sourceKind === 'local_official' ? localOfficialBadge[locale] : labels.sampleOriginalBadge}</span>
        </div>
      </header>

      <section className="border-b border-[#dfe5dc] py-6">
        <p className="text-sm leading-7 text-[#4f5b55]">{sample.instruction}</p>

        {sample.audioUrl ? (
          <div className="mt-5 border-l-2 border-[#9eb4b7] pl-4">
            <audio controls preload="metadata" src={sample.audioUrl} className="w-full max-w-3xl" />
          </div>
        ) : null}

        {sample.questionPdfUrl || sample.answerPdfUrl || sample.transcriptPdfUrl ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {sample.questionPdfUrl ? <OfficialFileLink href={sample.questionPdfUrl} label="問題PDF" /> : null}
            {sample.answerPdfUrl ? <OfficialFileLink href={sample.answerPdfUrl} label="正答表PDF" /> : null}
            {sample.transcriptPdfUrl ? <OfficialFileLink href={sample.transcriptPdfUrl} label="スクリプトPDF" /> : null}
          </div>
        ) : null}

        {sample.ttsText ? (
          <div className="mt-5 border-l-2 border-[#9eb4b7] pl-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={speaking ? stopSpeech : playSpeech} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white">
                {speaking ? labels.sampleStopAudio : labels.samplePlayAudio}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#7a807b]">{labels.sampleTtsNotice}</p>
          </div>
        ) : null}

        {sample.stimulus?.map((part, index) => (
          <div key={index} className="mt-5 max-w-4xl whitespace-pre-wrap border-l-2 border-[#c8d1c8] pl-4 text-base leading-8 text-[#313934]">
            {part.label ? <p className="mb-2 text-sm font-semibold text-[#7d6032]">{part.label}</p> : null}
            <p>{part.text}</p>
          </div>
        ))}

        <h2 className="mt-6 text-lg font-semibold leading-7 text-[#27312c]">{sample.question}</h2>
        {hasSubQuestions ? (
          <div className="mt-4 grid gap-3">
            {subQuestions.map((item) => (
              <fieldset key={item.id} className="rounded-md border border-[#d8e0d7] bg-white p-3">
                <legend className="px-1 text-sm font-semibold text-[#27312c]">{item.label}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.choices.map((choice, index) => {
                    const resultClass = revealed
                      ? index === item.answerIndex ? 'border-[#6f947c] bg-[#edf5ee]' : subAnswers[item.id] === index ? 'border-[#c9907d] bg-[#fbf1ed]' : 'border-[#d8e0d7] bg-white'
                      : subAnswers[item.id] === index ? 'border-[#31564c] bg-[#edf3ef]' : 'border-[#d8e0d7] bg-white hover:bg-[#f7f9f5]';
                    return (
                      <label key={choice} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${resultClass}`}>
                        <input type="radio" name={item.id} checked={subAnswers[item.id] === index} onChange={() => { setSubAnswers((current) => ({ ...current, [item.id]: index })); setRevealed(false); }} />
                        <span>{choice}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {sample.choices.map((choice, index) => {
              const resultClass = revealed
                ? index === sample.answerIndex ? 'border-[#6f947c] bg-[#edf5ee]' : selected === index ? 'border-[#c9907d] bg-[#fbf1ed]' : 'border-[#d8e0d7] bg-white'
                : selected === index ? 'border-[#31564c] bg-[#edf3ef]' : 'border-[#d8e0d7] bg-white hover:bg-[#f7f9f5]';
              return (
                <label key={index} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${resultClass}`}>
                  <input type="radio" name={`official-sample-${sample.id}`} checked={selected === index} onChange={() => { setSelected(index); setRevealed(false); }} />
                  <span>{index + 1}. {choice}</span>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={hasSubQuestions ? answeredCount < subQuestions.length : selected === null} onClick={() => setRevealed(true)} className="h-10 rounded-md bg-[#31564c] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{labels.sampleCheckAnswer}</button>
          {revealed && hasSubQuestions ? <p role="status" className={`text-sm font-semibold ${correctCount === subQuestions.length ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{correctCount} / {subQuestions.length}</p> : null}
          {revealed && !hasSubQuestions && selected !== null ? <p role="status" className={`text-sm font-semibold ${selected === sample.answerIndex ? 'text-[#356146]' : 'text-[#8a493c]'}`}>{selected === sample.answerIndex ? labels.listeningCorrect : labels.listeningWrong}</p> : null}
        </div>
      </section>

      {revealed ? (
        <section className="border-b border-[#dfe5dc] py-6">
          <p className="text-xs font-semibold text-[#6b746e]">{labels.sampleExplanation}</p>
          <p className="mt-2 max-w-4xl text-base leading-7 text-[#3f5149]">{sample.explanation[locale]}</p>
          {sample.ttsText ? (
            <div className="mt-5 max-w-4xl">
              <p className="text-xs font-semibold text-[#6b746e]">{labels.sampleTranscript}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#4f5b55]">{sample.ttsText}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <OfficialSourceFooter labels={labels} />
    </article>
  );
}

function OfficialFileLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md border border-[#c8d1c8] bg-white px-3 text-sm font-semibold text-[#31564c] hover:bg-[#f3f6f1]">
      {label} ↗
    </a>
  );
}

function OfficialSourceFooter({ labels }: { labels: Record<string, string> }) {
  return (
    <footer className="pt-5">
      <p className="border-l-2 border-[#c9d8ce] pl-3 text-xs leading-5 text-[#596760]">{labels.samplePracticeNotice}</p>
      <p className="mt-3 text-xs leading-5 text-[#7a807b]">{labels.sampleCopyrightNotice}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        <a href={OFFICIAL_TYPES_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#31564c] hover:underline">{labels.sampleOfficialTypes} ↗</a>
        <a href={OFFICIAL_PURPOSES_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#31564c] hover:underline">{labels.sampleOfficialPurposes} ↗</a>
        <a href={OFFICIAL_SAMPLES_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#31564c] hover:underline">{labels.sampleOfficialWorkbook} ↗</a>
      </div>
    </footer>
  );
}

function useLocalOfficialSamples(module: OfficialSampleModule) {
  const [samples, setSamples] = useState<OfficialModuleSample[]>([]);

  useEffect(() => {
    let disposed = false;
    fetch(`/api/local-official-samples?module=${encodeURIComponent(module)}`)
      .then((response) => response.ok ? response.json() : { samples: [] })
      .then((payload) => {
        if (!disposed) setSamples(Array.isArray(payload.samples) ? payload.samples : []);
      })
      .catch(() => {
        if (!disposed) setSamples([]);
      });
    return () => {
      disposed = true;
    };
  }, [module]);

  return samples;
}
