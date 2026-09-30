import { splitListeningExplanation } from './listeningExplanation';
import type { ListeningQuestion } from '../types';

export function listeningTranscriptForPractice(item: ListeningQuestion): string {
  return item.transcript?.trim() || splitListeningExplanation(item.explanation ?? '').find((section) => section.kind === 'transcript')?.body || '';
}

export function splitReadAlongLines(transcript: string): string[] {
  const lines: string[] = [];
  for (const paragraph of transcript.split(/\n+/u).map((part) => part.trim()).filter(Boolean)) {
    const speaker = /^([^：:]{1,8}[：:])\s*/u.exec(paragraph)?.[1] ?? '';
    const body = speaker ? paragraph.slice(speaker.length).trim() : paragraph;
    const sentences = body.match(/[^。！？!?]+[。！？!?]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
    if (!sentences.length) continue;
    sentences.forEach((sentence, index) => lines.push(`${index === 0 ? speaker : ''}${sentence}`));
  }
  return lines;
}

export type ReadAlongToken = { text: string; kind: 'word' | 'particle' | 'number' | 'punctuation' };

const particles = new Set(['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'から', 'まで', 'より', 'や', 'か', 'ね', 'よ', 'ば', 'て', 'では', 'には', 'とは']);

export function colorReadAlongTokens(line: string): ReadAlongToken[] {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  return [...segmenter.segment(line)].map(({ segment, isWordLike }) => ({
    text: segment,
    kind: /^\d+[\d,.]*$/u.test(segment) ? 'number'
      : particles.has(segment) ? 'particle'
      : isWordLike ? 'word' : 'punctuation',
  }));
}

/** Decode separate browser recordings and encode a single mono 16 kHz WAV for the existing recording API. */
export async function mergeReadAlongClips(clips: Blob[]): Promise<Blob> {
  if (!clips.length) throw new Error('还没有逐句录音');
  const context = new AudioContext();
  try {
    const sampleRate = 16000;
    const parts: Float32Array[] = [];
    for (const clip of clips) {
      const decoded = await context.decodeAudioData(await clip.arrayBuffer());
      const frames = Math.ceil(decoded.duration * sampleRate);
      const samples = new Float32Array(frames);
      for (let index = 0; index < frames; index += 1) {
        const position = index * decoded.sampleRate / sampleRate;
        const lower = Math.min(Math.floor(position), decoded.length - 1);
        const upper = Math.min(lower + 1, decoded.length - 1);
        const fraction = position - lower;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const data = decoded.getChannelData(channel);
          samples[index] += (data[lower] * (1 - fraction) + data[upper] * fraction) / decoded.numberOfChannels;
        }
      }
      parts.push(samples, new Float32Array(Math.round(sampleRate * 0.2)));
    }
    parts.pop();
    const count = parts.reduce((sum, part) => sum + part.length, 0);
    if (44 + count * 2 > 25 * 1024 * 1024) throw new Error('合并后的录音超过 25 MB，请缩短录音');
    const wav = new ArrayBuffer(44 + count * 2);
    const view = new DataView(wav);
    const writeText = (at: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(at + index, value.charCodeAt(index)); };
    writeText(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); writeText(8, 'WAVE');
    writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeText(36, 'data'); view.setUint32(40, count * 2, true);
    let offset = 44;
    for (const part of parts) for (const sample of part) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
    return new Blob([wav], { type: 'audio/wav' });
  } finally {
    await context.close();
  }
}
