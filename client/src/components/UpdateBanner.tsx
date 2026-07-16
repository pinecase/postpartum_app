import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

// 定时比对线上 index.html 引用的 JS 包名，与当前运行的不一致时提示刷新，
// 根治浏览器缓存旧版本的问题。
const CHECK_INTERVAL = 5 * 60 * 1000;

export default function UpdateBanner() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const cur = (document.querySelector('script[type="module"]') as HTMLScriptElement | null)?.src;
    if (!cur || cur.includes('/src/main')) return; // 开发模式跳过

    const check = async () => {
      try {
        const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
        const m = html.match(/\/assets\/index-[^"]+\.js/);
        if (m && !cur.includes(m[0])) setAvailable(true);
      } catch {
        /* 网络异常时静默 */
      }
    };
    const timer = setInterval(check, CHECK_INTERVAL);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="update-banner" onClick={() => window.location.reload()}>
      {t('update.available')} <span className="update-btn">{t('update.refresh')}</span>
    </div>
  );
}
