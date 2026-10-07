import {useCallback,useEffect,useRef} from 'react';
/** Resolve only authenticated immutable material revisions; release local playback URLs on unmount. */
export function useMaterialAudioResolver(token?:string|null) {
  const urls=useRef(new Map<string,string>());
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;for(const url of urls.current.values())URL.revokeObjectURL(url);urls.current.clear();},[token]);
  return useCallback(async(ref:{id:string;revision:number})=>{
    const key=`${ref.id}@${ref.revision}`;const cached=urls.current.get(key);if(cached)return cached;
    if(!token)throw new Error('Sign in to play audio');
    const requestGeneration=generation.current;
    const result=await fetch(`/api/materials/${encodeURIComponent(ref.id)}/versions/${ref.revision}/audio`,{headers:{authorization:`Bearer ${token}`}});
    if(!result.ok)throw new Error('Audio material unavailable');
    const bytes=await result.blob();if(requestGeneration!==generation.current)throw new Error('Audio session changed');
    const url=URL.createObjectURL(bytes);const existing=urls.current.get(key);if(existing){URL.revokeObjectURL(url);return existing;}urls.current.set(key,url);return url;
  },[token]);
}
