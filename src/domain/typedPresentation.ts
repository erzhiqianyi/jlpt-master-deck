export type MaterialRef = {id:string;revision:number};
export type TypedMaterial = {type:string;title?:string;blocks?:{id?:string;type?:string;text?:string;headers?:string[];rows?:string[][]}[];headers?:string[];rows?:string[][];url?:string;alt?:string;externalUrl?:string};
export type TypedPresentation = {
  payload:{schemaVersion:number;questionTypeId?:string;options?:{id:string;text:string}[];answer?:{type:string;optionId?:string};materialRefs?:MaterialRef[];
    legacy:{prompt?:string;question?:string;blankId?:string;targetSpan?:{start:number;end:number;text:string};taskConditions?:string[];assembly?:{starSlot:number;correctOrder?:string[]};optionMaterials?:{optionId:string;materialRef:MaterialRef}[];presentationPolicy?:{questionTiming?:string;optionsTiming?:string};[key:string]:unknown}};
  materials:{id:string;revision:number;payload:TypedMaterial}[];
};
export function presentationMaterial(presentation:TypedPresentation,ref:MaterialRef) {return presentation.materials.find(m=>m.id===ref.id&&m.revision===ref.revision)?.payload;}
export function assemblyOption(presentation:TypedPresentation,order:string[]) {
  const options=presentation.payload.options??[],assembly=presentation.payload.legacy.assembly;
  if(!assembly||order.length!==options.length||new Set(order).size!==options.length||order.some(id=>!options.some(o=>o.id===id))||!Number.isInteger(assembly.starSlot)||assembly.starSlot<0||assembly.starSlot>=order.length)return null;
  return options.findIndex(o=>o.id===order[assembly.starSlot]);
}
export function presentationVisible(presentation:TypedPresentation,audioFinished:boolean,question:boolean) {
  const policy=presentation.payload.legacy.presentationPolicy;
  const timing=(question?policy?.questionTiming:policy?.optionsTiming)??(presentation.payload.questionTypeId==='listening-outline'?'afterAudio':'beforeAudio');
  return audioFinished||timing!=='afterAudio';
}
export function presentationComplete(presentation:TypedPresentation) {
  const refs=presentation.payload.materialRefs??[];
  if(presentation.payload.schemaVersion!==1||refs.some(ref=>!presentationMaterial(presentation,ref)))return false;
  const materials=refs.map(ref=>presentationMaterial(presentation,ref)!);
  const type=presentation.payload.questionTypeId;
  if(type==='reading-integrated'&&materials.filter(m=>m.type==='article').length<2)return false;
  if(type==='reading-information'&&(!presentation.payload.legacy.taskConditions?.length||!materials.some(m=>m.type==='table'||m.blocks?.some(b=>b.type==='table'))))return false;
  if(type==='listening-expression'&&(!materials.some(m=>m.type==='audio')||!materials.some(m=>m.type==='image')))return false;
  if(type==='grammar-text') {const blank=presentation.payload.legacy.blankId;if(!blank||materials.flatMap(m=>m.blocks??[]).reduce((n,b)=>n+(b.text?.split(blank).length??1)-1,0)!==1)return false;}
  return true;
}
