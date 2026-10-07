import { buildQuestionIndex, buildQuestions } from './questions';
import { filterableTags, itemInWordbook } from './wordbooks';
import { officialN1QuestionTypes } from '../data/questionTypes';
import type { Locale, VocabItem, ReadingQuestion, ListeningQuestion } from '../types';
export function indexedPracticeKind(q: {kind:string;questionTypeId?:string}) {
 return q.questionTypeId==='grammar-composition'||q.questionTypeId==='grammar-text'?q.questionTypeId:q.kind;
}
export type PracticeModule = 'vocabulary' | 'grammar' | 'reading' | 'listening';
export function readingQuestionKind(q: ReadingQuestion) {
  if(q.questionTypeId&& (q.questionTypeId==='reading-basic-training'||officialN1QuestionTypes.some(type=>type.id===q.questionTypeId))) return q.questionTypeId;
  return q.tags?.find(tag => officialN1QuestionTypes.some(type => type.section === 'reading' && type.id === tag)) ?? 'unclassified';
}
export function practiceKindName(kind: string, locale: Locale) {
  const names: Record<string, string[]> = {'listening-expression':['发话表达（N3–N5）','発話表現（N3–N5）','Verbal expression (N3–N5)'],'reading-basic-training':['基础训练','基礎練習','Basic training'],'listening-basic-training':['基础训练','基礎練習','Basic training'],grammar:['语法选择','文法選択','Grammar selection'],kanji_to_kana:['汉字读音','漢字読み','Kanji reading'],kana_to_kanji:['汉字表记','漢字表記','Kanji spelling'],moji_goi:['语境规定','文脈規定','Context'],meaning:['近义替换','言い換え','Paraphrase'],usage:['用法','用法','Usage'],word_formation:['词语构成','語形成','Word formation'],unclassified:['未分类','未分類','Unclassified']};
  return officialN1QuestionTypes.find(type=>type.id===kind)?.name[locale] ?? names[kind]?.[locale==='zh-CN'?0:locale==='ja'?1:2] ?? kind;
}
export function typePracticeCandidates(module: PracticeModule, items: VocabItem[], reading: ReadingQuestion[], listening: ListeningQuestion[], book='all', tag='all') {
  if(module==='reading') return reading.filter(q=>tag==='all'||q.tags?.includes(tag)).map(q=>({id:q.id,kind:readingQuestionKind(q)}));
  if(module==='listening') return listening.map(q=>({id:q.id,kind:q.questionTypeId}));
  return buildQuestionIndex(items.filter(item=>(module==='grammar')===(item.deck==='grammar_expression') && item.type!=='proper_name' && itemInWordbook(item,book) && (tag==='all'||filterableTags(item).includes(tag)))).map(q=>({...q,kind:indexedPracticeKind(q)}));
}
export function samplePractice<T>(pool:T[],count:number):T[]{const result=[...pool];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result.slice(0,count);}
export function quickTypePractice(module:PracticeModule,kind:string,book:string,items:VocabItem[],reading:ReadingQuestion[],listening:ListeningQuestion[],locale:Locale){
 const candidates=typePracticeCandidates(module,items,reading,listening,book).filter(q=>q.kind===kind);
 const ids=new Set(samplePractice(candidates,10).map(q=>q.id));
 const moduleName=locale==='zh-CN'?{vocabulary:'单词',grammar:'语法',reading:'阅读',listening:'听力'}[module]:locale==='ja'?{vocabulary:'単語',grammar:'文法',reading:'読解',listening:'聴解'}[module]:module;
 return {module,title:`${locale==='zh-CN'?'题型练习':locale==='ja'?'問題形式別練習':'Question type practice'} · ${moduleName} · ${practiceKindName(kind,locale)}`,questions: module==='vocabulary'||module==='grammar'?samplePractice(buildQuestions(items.filter(item=>itemInWordbook(item,book)),locale).filter(q=>ids.has(q.id)),10):[],reading:module==='reading'?samplePractice(reading.filter(q=>ids.has(q.id)),10):[],listening:module==='listening'?samplePractice(listening.filter(q=>ids.has(q.id)),10):[]};
}
