import { QuestionAudioPlayer } from '../../components/QuestionAudioPlayer';
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
export function ExamAudio({ src, token, loading, unavailable }: { src: string; token: string; loading: string; unavailable: string }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setAudioUrl('');
    setError('');
    fetch(src, { headers: token && src.startsWith('/api/') ? { authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : unavailable);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token, unavailable]);

  if (error) return <p className="text-xs font-semibold text-[#973f3f]">{unavailable}</p>;
  if (!audioUrl) return <div className="flex h-10 items-center gap-2 text-xs font-semibold text-[#775516]"><LoaderCircle className="animate-spin" size={16} />{loading}</div>;
  return <QuestionAudioPlayer src={audioUrl} />;
}
