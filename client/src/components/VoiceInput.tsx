import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

// 基于浏览器 Web Speech API 的语音听写按钮。
// Chrome/Edge/安卓浏览器与 iOS Safari(14.5+) 支持；不支持的浏览器不渲染按钮。
// 识别结果通过 onText 追加给调用方，识别语言跟随界面语言。

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  return Ctor ? new Ctor() : null;
}

const LANG_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en-US', ms: 'ms-MY' };

export default function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const { t, lang } = useI18n();
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => getRecognition() !== null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition()!;
    recRef.current = rec;
    rec.lang = LANG_MAP[lang] || 'zh-CN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) onText(text);
        }
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return (
    <button
      type="button"
      className={`btn btn-sm voice-btn ${listening ? 'listening' : ''}`}
      onClick={toggle}
    >
      {listening ? t('voice.listening') : t('voice.speak')}
    </button>
  );
}
