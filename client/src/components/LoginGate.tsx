import { FormEvent, useEffect, useState } from 'react';
import { AuthStatus, Staff, getAuthToken, setAuth, clearAuth } from '../api';
import { useI18n } from '../i18n';

type Mode = 'login' | 'setup' | 'pin';

// 访问锁屏：
//   已建账号 → 邮箱+密码登录（可选 PIN 兜底）
//   未建账号且未设 PIN → 引导初始化第一个管理员（可跳过）
//   仅设 PIN → 输入访问码
export default function LoginGate() {
  const { t } = useI18n();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const lockFor = (s: AuthStatus) => {
    setStatus(s);
    if (s.accounts_exist) setMode('login');
    else if (s.pin_set) setMode('pin');
    else setMode('setup');
    setLocked(true);
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const s: AuthStatus = await fetch('/api/auth/status')
        .then((r) => r.json())
        .catch(() => ({ pin_set: false, accounts_exist: false }));
      if (cancelled) return;
      setStatus(s);
      if (s.accounts_exist) {
        const token = getAuthToken();
        if (!token) return lockFor(s);
        const ok = await fetch('/api/auth/me', { headers: { 'X-Auth-Token': token } }).then((r) => r.ok).catch(() => false);
        if (cancelled) return;
        if (!ok) {
          clearAuth();
          lockFor(s);
        }
      } else if (!s.pin_set && !sessionStorage.getItem('auth_setup_skip')) {
        // 全新系统：引导创建第一个管理员账号
        lockFor(s);
      }
    };
    check();
    const onRequired = () => {
      fetch('/api/auth/status')
        .then((r) => r.json())
        .then((s: AuthStatus) => lockFor(s))
        .catch(() => setLocked(true));
    };
    window.addEventListener('auth-required', onRequired);
    return () => {
      cancelled = true;
      window.removeEventListener('auth-required', onRequired);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked) return null;

  const doLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error || t('auth.wrong'));
      setAuth((j as { token: string }).token, (j as { staff: Staff }).staff);
      window.location.reload();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const doSetup = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password !== confirm) return setErr(t('auth.mismatch'));
    setBusy(true);
    try {
      const r = await fetch('/api/auth/register-first', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error || 'error');
      setAuth((j as { token: string }).token, (j as { staff: Staff }).staff);
      window.location.reload();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const doPin = async (e: FormEvent) => {
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

  const skipSetup = () => {
    sessionStorage.setItem('auth_setup_skip', '1');
    setLocked(false);
  };

  return (
    <div className="pin-gate">
      {mode === 'login' && (
        <form className="pin-box" onSubmit={doLogin}>
          <div className="pin-icon">🔐</div>
          <h3>{t('auth.loginTitle')}</h3>
          <input
            className="auth-input"
            type="email"
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
          />
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
          />
          {err && <div className="form-error">{err}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !email || !password}>
            {t('auth.login')}
          </button>
          {status?.pin_set && (
            <button type="button" className="btn-link" onClick={() => { setErr(''); setMode('pin'); }}>
              {t('auth.usePin')}
            </button>
          )}
        </form>
      )}

      {mode === 'setup' && (
        <form className="pin-box" onSubmit={doSetup}>
          <div className="pin-icon">👩‍⚕️</div>
          <h3>{t('auth.setupTitle')}</h3>
          <p className="meta">{t('auth.setupHint')}</p>
          <input className="auth-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.name')} />
          <input className="auth-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} />
          <input className="auth-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordMin')} />
          <input className="auth-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('auth.confirm')} />
          {err && <div className="form-error">{err}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !name || !email || password.length < 6}>
            {t('auth.create')}
          </button>
          <button type="button" className="btn-link" onClick={skipSetup}>
            {t('auth.skip')}
          </button>
        </form>
      )}

      {mode === 'pin' && (
        <form className="pin-box" onSubmit={doPin}>
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
          {status?.accounts_exist && (
            <button type="button" className="btn-link" onClick={() => { setErr(''); setMode('login'); }}>
              {t('auth.backToLogin')}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
