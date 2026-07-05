import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Lang, LANGS, MESSAGES, translateValue } from './translations';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** 界面文案：t('overview.feedsToday', {n: 3}) */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 数据枚举值（中文存储）按当前语言显示 */
  tv: (value: string | null | undefined) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: 'zh',
  setLang: () => {},
  t: (k) => k,
  tv: (v) => v ?? '—',
});

function detectLang(): Lang {
  const saved = localStorage.getItem('lang');
  // 曾选过已下架语言（如 ms）的用户自动回退到浏览器语言
  if (saved === 'zh' || saved === 'en') return saved;
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : l;
  };

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let s = MESSAGES[lang][key] ?? MESSAGES.zh[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    [lang]
  );

  const tv = useCallback((value: string | null | undefined) => translateValue(value, lang), [lang]);

  return <Ctx.Provider value={{ lang, setLang, t, tv }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export { LANGS };
export type { Lang };
