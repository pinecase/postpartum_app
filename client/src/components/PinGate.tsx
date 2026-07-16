import { FormEvent, useEffect, useState } from 'react';
import { useI18n } from '../i18n';

// PIN 访问锁：设置了访问码后，任何 API 返回 401 都会弹出此锁屏。
// 验证通过后 PIN 存本机，之后请求自动携带。
export default function PinGate() {
  const { t } = useI18n();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const onRequired = () => setLocked(true);
    window.addEventListener('pin-required', onRequired);
    return () => window.removeEventListener('pin-required', onRequired);
  }, []);

  if (!locked) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      localStorage.setItem('app_pin', pin);
      window.location.reload();
    } else {
      setErr(t('pin.wrong'));
      setPin('');
    }
  };

  return (
    <div className="pin-gate">
      <form className="pin-box" onSubmit={submit}>
        <div className="pin-icon">🔐</div>
        <h3>{t('pin.title')}</h3>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="••••"
        />
        {err && <div className="form-error">{err}</div>}
        <button type="submit" className="btn btn-primary" disabled={pin.length < 4}>
          {t('pin.enter')}
        </button>
      </form>
    </div>
  );
}
