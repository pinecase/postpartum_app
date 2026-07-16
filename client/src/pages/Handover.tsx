import { FormEvent, useEffect, useState } from 'react';
import { api, fmtTime, Handover as HandoverType, Mother, Baby } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';

export default function Handover() {
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [items, setItems] = useState<HandoverType[]>([]);
  const [search, setSearch] = useState('');
  const [mothers, setMothers] = useState<(Mother & { babies?: Baby[] })[]>([]);
  const [room, setRoom] = useState('');
  const [babyName, setBabyName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const kw = search.trim().toLowerCase();
  const filtered = kw
    ? items.filter((h) =>
        [h.content, h.author, h.date, h.shift, h.room || '', h.mother_name || '', h.baby_name || '']
          .some((s) => s.toLowerCase().includes(kw))
      )
    : items;

  const selMother = mothers.find((m) => m.room === room);

  const load = () => api.get<HandoverType[]>('/api/handovers').then(setItems);
  useEffect(() => {
    load();
    api.get<Mother[]>('/api/mothers?status=在住').then(async (ms) => {
      const withBabies = await Promise.all(
        ms.map(async (m) => {
          const d = await api.get<Mother & { babies: Baby[] }>(`/api/mothers/${m.id}`);
          return { ...m, babies: d.babies.filter((b) => b.status === '在住') };
        })
      );
      setMothers(withBabies);
    });
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
        room: room || null,
        mother_name: selMother?.name || null,
        baby_name: babyName || null,
      });
      form.reset();
      setRoom('');
      setBabyName('');
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
                {['AM班', 'PM班', 'MID班'].map((v) => (
                  <option key={v} value={v}>{tv(v)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('common.recordedBy')}</label>
              <input value={current} readOnly />
            </div>
            <div className="field">
              <label>{t('handover.room')}</label>
              <select value={room} onChange={(e) => { setRoom(e.target.value); setBabyName(''); }}>
                <option value="">—</option>
                {mothers.map((m) => (
                  <option key={m.id} value={m.room}>{m.room} · {m.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('handover.baby')}</label>
              <select value={babyName} onChange={(e) => setBabyName(e.target.value)} disabled={!selMother}>
                <option value="">—</option>
                {(selMother?.babies || []).map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
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
        <h3>
          {t('handover.history')}
          <input
            className="handover-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('handover.search')}
          />
        </h3>
        {filtered.map((h) => (
          <div className="handover-item" key={h.id}>
            <div className="head">
              <span className="badge badge-room">{h.date}</span>
              <span className={`badge ${h.shift.includes('MID') || h.shift === '夜班' ? 'badge-info' : 'badge-warning'}`}>{tv(h.shift)}</span>
              {h.room && <span className="badge badge-room">{h.room}</span>}
              {h.mother_name && <span className="badge badge-mother">{h.mother_name}</span>}
              {h.baby_name && <span className="badge badge-baby">{h.baby_name}</span>}
              <span>{h.author}</span>
              <span>· {t('handover.submittedAt')} {fmtTime(h.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{h.content}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">{t('handover.empty')}</div>}
      </div>
    </>
  );
}
