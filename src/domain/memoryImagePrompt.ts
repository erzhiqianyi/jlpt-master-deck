import type { VocabItem } from '../types';

/** A self-contained brief that a learner can paste into any image-capable agent. */
export function memoryImagePrompt(item: VocabItem): string {
  const grammar = item.deck === 'grammar_expression' || item.type === 'grammar';
  const pattern = item.patterns?.find((entry) => entry.pattern?.trim())?.pattern?.trim();
  const example = item.examples?.find((entry) => entry.ja?.trim() && entry.zh?.trim());
  const missing = [
    ...(grammar && !pattern ? ['接续形式'] : []),
    ...(!item.meaning_zh?.trim() ? ['中文含义'] : []),
    ...(!example ? ['日文例句及对应中文翻译'] : []),
  ];

  return [
    '请为下面的 JLPT 词条制作一张记忆图片。画面要对应例句，且把学习内容清晰写进图中；请逐字保留给定文字。',
    `词条 ID：${item.id}`,
    `词条：${item.original}`,
    ...(item.reading ? [`读音：${item.reading}`] : []),
    ...(grammar ? [`接续：${pattern ?? '【资料缺失】'}`] : []),
    `中文含义：${item.meaning_zh?.trim() || '【资料缺失】'}`,
    `例句：${example?.ja?.trim() ?? '【资料缺失】'}`,
    `译文：${example?.zh?.trim() ?? '【资料缺失】'}`,
    ...(grammar && /辞書形.*た形/u.test(pattern ?? '') ? ['形式提示：辞書形／た形＝普通体'] : []),
    ...(missing.length ? [`缺少${missing.join('、')}；请先补齐并核对词条资料，再生成图片，不要猜测。`] : []),
    '要求：一个与例句一致的具体场景；词条最醒目，接续、含义、例句和译文清晰可读；日文与中文分行；不添加无关文字、假名标注、标志或水印。生成后放大检查每个汉字、假名和标点，发现错误要重做。',
    '如已连接 JLPT MCP，请用 attach_review_item_image 上传；先确认新版已关联并能显示，再移除旧图。MCP 仅校验文件格式和大小，不能证明图片中文字正确。',
  ].join('\n');
}
