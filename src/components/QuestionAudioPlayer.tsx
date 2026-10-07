import {useEffect,useRef,useState,type RefObject} from 'react';
import './question-renderer.css';

/** A shared, minimal player. Authorized containers resolve the media URL. */
export function QuestionAudioPlayer({src,audioRef,playLabel='播放',pauseLabel='暂停',seekLabel='播放进度',onEnded}:{src:string;audioRef?:RefObject<HTMLAudioElement|null>;playLabel?:string;pauseLabel?:string;seekLabel?:string;onEnded?:()=>void}) {
 const ownRef=useRef<HTMLAudioElement>(null);const ref=audioRef??ownRef;
 const [playing,setPlaying]=useState(false);const [position,setPosition]=useState(0);const [duration,setDuration]=useState(0);const [error,setError]=useState('');
 useEffect(()=>{ref.current?.pause();setPlaying(false);setPosition(0);setDuration(0);setError('');},[src,ref]);
 async function toggle(){const audio=ref.current;if(!audio)return;setError('');if(audio.paused){try{await audio.play();}catch{setError('音频暂时无法播放，请重试');}}else audio.pause();}
 return <div className="question-audio-player">
   <audio ref={ref} src={src} preload="metadata" onLoadedMetadata={()=>setDuration(Number.isFinite(ref.current?.duration)?ref.current!.duration:0)} onTimeUpdate={()=>setPosition(ref.current?.currentTime??0)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onEnded?.();}} onError={()=>setError('音频暂时无法播放，请重试')} />
   <button type="button" aria-label={playing?pauseLabel:playLabel} aria-pressed={playing} onClick={()=>void toggle()}>{playing?pauseLabel:playLabel}</button>
   <input type="range" aria-label={seekLabel} min={0} max={duration||1} step={.1} value={Math.min(position,duration||1)} disabled={!duration} onChange={event=>{const time=Number(event.target.value);if(ref.current)ref.current.currentTime=time;setPosition(time);}} />
   {error?<p role="alert">{error}</p>:null}
 </div>;
}
