import { FormEvent, useEffect, useState } from 'react';
import { api, fmtTime, Handover as HandoverType } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';

export default function Handover() {
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [items, setItems] = useState<HandoverType[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<HandoverType[]>('/api/handovers').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/handovers', {
        date: fd.get('date'),
        shift: fd.get('shift'),
        author: current || String(fd.get('shift')),
        content: fd.get('content'),
      });
      form.reset();
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">{t('handover.title')}</div>

      <div className="card">
        <h3>{t('handover.write')}</h3>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>{t('handover.date')}</label>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="field">
              <label>{t('handover.shift')}</label>
              <select name="shift" required>
                {['白班', '夜班'].map((v) => (
                  <option key={v} value={v}>{tv(v)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('common.recordedBy')}</label>
              <input value={current} readOnly />
            </div>
            <div className="field full">
              <label>{t('handover.content')}</label>
              <textarea name="content" required rows={4} placeholder={t('handover.placeholder')} />
            </div>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('common.submitting') : t('handover.submit')}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>{t('handover.history')}</h3>
        {items.map((h) => (
          <div className="handover-item" key={h.id}>
            <div className="head">
              <span className="badge badge-room">{h.date}</span>
              <span className={`badge ${h.shift === '夜班' ? 'badge-info' : 'badge-warning'}`}>{tv(h.shift)}</span>
              <span>{h.author}</span>
              <span>· {t('handover.submittedAt')} {fmtTime(h.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{h.content}</div>
          </div>
        ))}
        {items.length === 0 && <div className="empty">{t('handover.empty')}</div>}
      </div>
    </>
  );
}
