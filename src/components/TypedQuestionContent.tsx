import {useEffect,useState,type ReactNode} from 'react';
import {assemblyOption,presentationComplete,presentationMaterial,presentationVisible,type TypedPresentation,type TypedMaterial} from '../domain/typedPresentation';
import {readAssemblyDraft,writeAssemblyDraft} from '../domain/assemblyDraft.mjs';
import {QuestionPrompt} from './QuestionPrompt';
import {QuestionOptions} from './QuestionOptions';
import {QuestionAudioPlayer} from './QuestionAudioPlayer';
import {JapaneseText} from './JapaneseText';
import type {JapaneseAnnotation} from '../types';

export function TypedQuestionContent({presentation,selected,reveal=false,disabled=false,audioFinished=false,onSelect,renderText,initialOrder=[],draftKey,resolveAudio}:{presentation:TypedPresentation;selected?:number|null;reveal?:boolean;disabled?:boolean;audioFinished?:boolean;onSelect:(index:number,order?:string[])=>void;renderText?:(text:string,index:number)=>ReactNode;initialOrder?:string[];draftKey?:string;resolveAudio?:(ref:{id:string;revision:number})=>Promise<string>}) {
  const {payload}=presentation,content=payload.legacy;
  const [order,setOrder]=useState<string[]>(()=>{try{return initialOrder.length?initialOrder:readAssemblyDraft(localStorage,draftKey,presentation);}catch{return initialOrder;}});
  const [draftError,setDraftError]=useState(false);
  function changeOrder(next:string[]) {setOrder(next);try {setDraftError(!writeAssemblyDraft(localStorage,draftKey,presentation,next));}catch{setDraftError(Boolean(draftKey));}}
  const [audioUrl,setAudioUrl]=useState(''),[finished,setFinished]=useState(false),[audioError,setAudioError]=useState('');
  useEffect(()=>{let disposed=false;setFinished(false);setAudioUrl('');setAudioError('');const ref=payload.materialRefs?.find(ref=>presentationMaterial(presentation,ref)?.type==='audio');if(ref&&resolveAudio)void resolveAudio(ref).then(url=>{if(!disposed)setAudioUrl(url);}).catch(()=>{if(!disposed)setAudioError('音频暂时无法读取');});return ()=>{disposed=true;};},[presentation,resolveAudio]);
  useEffect(()=>{try {setOrder(initialOrder.length?initialOrder:readAssemblyDraft(localStorage,draftKey,presentation));}catch{setOrder(initialOrder);}setDraftError(false);},[presentation,draftKey]);
  const locked=disabled||!presentationComplete(presentation),options=payload.options??[];
  const articleRefs=(payload.materialRefs??[]).filter(ref=>['article','table'].includes(presentationMaterial(presentation,ref)?.type??''));
  const prompt=content.prompt??content.question??'';
  function article(text:string){const blank=content.blankId,start=blank?text.indexOf(blank):-1;return <JapaneseText text={text} annotations={content.japaneseAnnotations as JapaneseAnnotation[]|undefined} ruby={reveal} targetSpan={blank&&start>=0?{start,end:start+blank.length,text:blank}:undefined}/>;}
  function table(material:TypedMaterial){const data=material.headers?material:material.blocks?.find(b=>b.type==='table');return data?.headers?<div className="typed-table-scroll" tabIndex={0}><table><thead><tr>{data.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{data.rows?.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>:null;}
  function image(material:TypedMaterial|undefined){return material?.url&&/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(material.url)?<img className="typed-option-image" src={material.url} alt={material.alt??''}/>:<p role="alert">图片素材不可用</p>;}
  return <>
    {audioUrl?<QuestionAudioPlayer src={audioUrl} onEnded={()=>setFinished(true)}/>:audioError?<p role="alert">{audioError}</p>:null}
    {articleRefs.map((ref,index)=>{const material=presentationMaterial(presentation,ref)!;return <section key={`${ref.id}@${ref.revision}`} className="typed-article"><h3>{payload.questionTypeId==='reading-integrated'?`${String.fromCharCode(65+index)} · `:''}{material.title}</h3>{material.type==='table'?table(material):material.blocks?.map((block,i)=><p key={block.id??i}>{article(block.text??'')}</p>)}</section>;})}
    {!articleRefs.length&&typeof content.context==='string'&&content.context.trim()&&content.context!==prompt?<p className="typed-article">{article(content.context)}</p>:null}
    {content.taskConditions?.length?<ul>{content.taskConditions.map((condition,i)=><li key={i}>{condition}</li>)}</ul>:null}
    {!presentationComplete(presentation)?<p role="alert">题目素材不完整，暂不能作答</p>:null}
    {presentationVisible(presentation,audioFinished||finished||reveal,true)?<div className="question-renderer-prompt">{content.targetSpan?<JapaneseText text={prompt} annotations={content.japaneseAnnotations as JapaneseAnnotation[]|undefined} ruby={reveal} targetSpan={content.targetSpan}/>:<QuestionPrompt text={prompt}/>}</div>:<p role="status">请先听完音频</p>}
    {presentationVisible(presentation,audioFinished||finished||reveal,false)?content.assembly?<div className="typed-assembly">
      {draftError?<p role="alert">排列进度无法保存，请勿关闭页面。</p>:null}<ol>{options.map((_,i)=><li key={i}><strong>{i===content.assembly!.starSlot?'★':i+1}</strong> {options.find(o=>o.id===order[i])?.text??'＿＿'}{order[i]&&!locked&&!reveal?<button type="button" aria-label={`移除第${i+1}空`} onClick={()=>changeOrder(order.filter((_,j)=>j!==i))}>移除</button>:null}</li>)}</ol>
      {options.map(option=><button type="button" key={option.id} disabled={locked||reveal||order.includes(option.id)} onClick={()=>changeOrder([...order,option.id])}>{option.text}</button>)}
      <button type="button" disabled={locked||reveal||assemblyOption(presentation,order)===null} onClick={()=>{const index=assemblyOption(presentation,order);if(index!==null)onSelect(index,order);}}>确认排列</button>
      {reveal&&content.assembly.correctOrder?<p>完整排列：{content.assembly.correctOrder.map(id=>options.find(o=>o.id===id)?.text).join(' → ')}</p>:null}
    </div>:<QuestionOptions choices={options.map(o=>o.text)} selected={selected} answerIndex={reveal?options.findIndex(o=>o.id===payload.answer?.optionId):undefined} reveal={reveal} disabled={locked} onSelect={onSelect} renderText={(text,index)=><>{content.optionMaterials?.filter(entry=>entry.optionId===options[index].id).map(entry=><span key={entry.materialRef.id}>{image(presentationMaterial(presentation,entry.materialRef))}</span>)}{renderText?renderText(text,index):text}</>}/>:null}
  </>;
}
