import type { ConfirmationOptions } from '../../components/confirmation';
import type { Locale } from '../../types';

export const listeningShareCopy = {
  'zh-CN': { title: '公开分享听力素材？', publish: '公开分享', cancel: '取消', copy: '复制链接', busy: '处理中…', link: '听力分享链接', failed: '分享失败，请重试。' },
  ja: { title: '聴解教材を公開しますか？', publish: '公開する', cancel: 'キャンセル', copy: 'リンクをコピー', busy: '処理中…', link: '聴解の共有リンク', failed: '共有できませんでした。もう一度お試しください。' },
  en: { title: 'Share listening material publicly?', publish: 'Share publicly', cancel: 'Cancel', copy: 'Copy link', busy: 'Working…', link: 'Listening share link', failed: 'Sharing failed. Please try again.' },
};

export async function requestListeningShare<T>({ filename, questionCount, locale, confirm, publish }: {
  filename: string;
  questionCount: number;
  locale: Locale;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  publish: () => Promise<T>;
}): Promise<T | null> {
  const copy = listeningShareCopy[locale];
  const description = locale === 'ja'
    ? `「${filename}」を「発見」に公開します。音声、${questionCount} 問の問題・正解・解説、登録済みの原文と翻訳が含まれ、他のユーザーが閲覧・試聴・取り込みできます。`
    : locale === 'en'
      ? `Publish “${filename}” to Discover for other users to view, listen to, and import. This includes the audio, ${questionCount} questions with answers and explanations, and any saved transcript and translation.`
      : `将“${filename}”发布到发现页，其他用户可以查看、试听和导入。分享包括音频、${questionCount} 道题目及答案解析，以及已保存的原文和翻译。`;
  if (!(await confirm({ title: copy.title, description, confirmLabel: copy.publish, cancelLabel: copy.cancel }))) return null;
  return publish();
}
