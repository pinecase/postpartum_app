import { FormEvent, useEffect, useState } from 'react';
import { api, fmtTime, Handover as HandoverType, Mother, Baby, BabyDetailData } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';

// 班次时间窗（本地时间）：AM 07-15 点，PM 15-23 点，MID 23-次日07 点
const SHIFT_WINDOW: Record<string, [number, number]> = { 'AM班': [7, 15], 'PM班': [15, 23], 'MID班': [23, 31] };

export default function Handover() {
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [items, setItems] = useState<HandoverType[]>([]);
  const [search, setSearch] = useState('');
  const [mothers, setMothers] = useState<(Mother & { babies?: Baby[] })[]>([]);
  const [room, setRoom] = useState('');
  const [babyName, setBabyName] = useState('');
  const [content, setContent] = useState('');
  const [shift, setShift] = useState('AM班');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [genBusy, setGenBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // 自动汇总本班：把班次时间窗内全部宝宝记录按房间归纳成日报草稿
  const generate = async () => {
    setGenBusy(true);
    try {
      const [h0, h1] = SHIFT_WINDOW[shift] || [0, 24];
      const start = new Date(`${date}T00:00`);
      start.setHours(h0, 0, 0, 0);
      const end = new Date(`${date}T00:00`);
      end.setHours(h1, 0, 0, 0);
      const inRange = (time: string) => {
        const x = new Date(time);
        return x >= start && x < end;
      };
      const blocks: string[] = [];
      for (const m of mothers) {
        for (const b of m.babies || []) {
          const d = await api.get<BabyDetailData>(`/api/babies/${b.id}`);
          const feeds = d.feeds.filter((r) => inRange(r.time));
          const milk = feeds.reduce((s, r) => s + (r.amount_ml || 0), 0);
          const diapers = d.diapers.filter((r) => inRange(r.time));
          const urine = diapers.filter((r) => r.type.includes('尿')).length;
          const stool = diapers.filter((r) => r.type.includes('便')).length;
          const cares = d.cares.filter((r) => inRange(r.time));
          const vital = d.vitals.find((r) => inRange(r.time));
          const lines = [`*${m.room}* ${b.name}`];
          if (feeds.length) lines.push(`🍼 ${feeds.length}x / ${milk}ml`);
          if (urine || stool) lines.push(`💧${urine} 💩${stool}`);
          if (vital?.temperature_c != null) lines.push(`🌡 ${vital.temperature_c}°C`);
          if (vital?.jaundice_mg_dl != null) lines.push(`${tv('黄疸')} ${vital.jaundice_mg_dl}mg/dL`);
          if (vital?.weight_g != null) lines.push(`${tv('体重')} ${vital.weight_g}g`);
          for (const c of cares) {
            lines.push(`· ${tv(c.care_type)}${c.notes ? `：${c.notes}` : ''}`);
          }
          if (lines.length === 1) lines.push('—');
          blocks.push(lines.join('\n'));
        }
      }
      setContent(blocks.join('\n\n'));
    } finally {
      setGenBusy(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy:', text);
    }
  };

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
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/handovers', {
        date,
        shift,
        author: current || shift,
        content,
        room: room || null,
        mother_name: selMother?.name || null,
        baby_name: babyName || null,
      });
      setContent('');
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
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('handover.shift')}</label>
              <select value={shift} onChange={(e) => setShift(e.target.value)} required>
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
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={8}
                placeholder={t('handover.placeholder')}
              />
            </div>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={generate} disabled={genBusy}>
              {genBusy ? t('common.loading') : t('handover.autoSum')}
            </button>
            <button type="button" className="btn" onClick={() => copyText(content)} disabled={!content}>
              {copied ? t('handover.copied') : t('handover.copy')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !content.trim()}>
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
              <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => copyText(h.content)}>
                {t('handover.copy')}
              </button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{h.content}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">{t('handover.empty')}</div>}
      </div>
    </>
  );
}
