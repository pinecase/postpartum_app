import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { api, fmtTime, dayOfLife, localDatetimeValue, MotherDetailData, Appointment } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';
import Modal from '../components/Modal';
import PhotoInput, { PhotoDraft } from '../components/PhotoInput';
import { PhotoBadge } from '../components/PhotoViewer';

export default function MotherDetail() {
  const { id } = useParams();
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [data, setData] = useState<MotherDetailData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api.get<MotherDetailData>(`/api/mothers/${id}`).then(setData).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  const seriesTemp = t('baby.series.temp');
  const seriesSys = t('mother.series.sys');
  const seriesDia = t('mother.series.dia');

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data.vitals]
      .sort((a, b) => a.time.localeCompare(b.time))
      .filter((v) => v.temperature_c != null || v.systolic != null)
      .map((v) => ({
        t: fmtTime(v.time),
        [seriesTemp]: v.temperature_c,
        [seriesSys]: v.systolic,
        [seriesDia]: v.diastolic,
      }));
  }, [data, seriesTemp, seriesSys, seriesDia]);

  const delRecord = async (recordId: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await api.del(`/api/records/mother_vitals/${recordId}`);
    load();
  };

  const discharge = async () => {
    if (!data) return;
    if (!window.confirm(t('mother.confirmDischarge', { name: data.name }))) return;
    await api.patch(`/api/mothers/${data.id}`, { status: '已离所' });
    load();
  };

  if (error) return <div className="card">{t('common.loadFailed')}：{error}</div>;
  if (!data) return <div className="empty">{t('common.loading')}</div>;

  return (
    <>
      <div className="page-title">
        🤱 {data.name}
        <span className="badge badge-room">{data.room} {t('overview.roomSuffix')}</span>
        {data.status === '已离所' && <span className="badge badge-done">{t('mother.discharged')}</span>}
        <span className="sub">
          {tv(data.delivery_type)} · {t('mother.postpartum', { n: dayOfLife(data.delivery_date) })} ·{' '}
          {t('mother.admittedOn', { d: data.admission_date })}
        </span>
      </div>

      <div className="card">
        <div className="info-list">
          <div><div className="k">{t('mother.age')}</div>{data.age ?? '—'}</div>
          <div><div className="k">{t('mother.parity')}</div>{data.parity || '—'}</div>
          <div><div className="k">{t('mother.feedingPlan')}</div>{tv(data.feeding_plan)}</div>
          <div><div className="k">{t('mother.allergies')}</div>{data.allergies && data.allergies !== '无' ? data.allergies : t('mother.noAllergy')}</div>
          <div><div className="k">{t('mother.expectedDischarge')}</div>{data.expected_discharge_date || '—'}</div>
          <div>
            <div className="k">{t('mother.babies')}</div>
            {data.babies.map((b, i) => (
              <span key={b.id}>
                {i > 0 && '、'}
                <Link to={`/babies/${b.id}`} style={{ textDecoration: 'underline' }}>{b.name}</Link>
              </span>
            ))}
            {data.babies.length === 0 && '—'}
          </div>
          {data.notes && <div><div className="k">{t('common.notes')}</div>{data.notes}</div>}
        </div>
        {data.status === '在住' && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('mother.addRound')}</button>
            <button className="btn" onClick={discharge}>{t('mother.discharge')}</button>
          </div>
        )}
      </div>

      <ApptSection motherId={data.id} createdBy={current} />

      {chartData.length > 1 && (
        <div className="chart-grid" style={{ marginBottom: 14 }}>
          <div className="chart-box">
            <h4>{t('mother.chart.temp')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[35.5, 39]} fontSize={11} width={40} />
                <Tooltip />
                <ReferenceLine y={38} stroke="#b91c1c" strokeDasharray="4 4" label={{ value: t('baby.chart.fever38'), fontSize: 11 }} />
                <Line type="monotone" dataKey={seriesTemp} stroke="#be185d" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-box">
            <h4>{t('mother.chart.bp')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[50, 160]} fontSize={11} width={40} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={140} stroke="#b91c1c" strokeDasharray="4 4" />
                <Line type="monotone" dataKey={seriesSys} stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey={seriesDia} stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <h3>{t('mother.rounds')}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('common.time')}</th><th>{t('vitals.temp')}</th><th>{t('mother.bp')}</th>
                <th>{t('mother.pulse')}</th><th>{t('mother.lochia')}</th><th>{t('mother.wound')}</th>
                <th>{t('mother.breast')}</th><th>{t('mother.mood')}</th><th>{t('mother.pain')}</th>
                <th>{t('common.notes')}</th><th>{t('common.recordedBy')}</th>
              </tr>
            </thead>
            <tbody>
              {data.vitals.map((v) => (
                <tr key={v.id}>
                  <td>{fmtTime(v.time)}</td>
                  <td>{v.temperature_c != null ? `${v.temperature_c}°C` : '—'}</td>
                  <td>{v.systolic != null ? `${v.systolic}/${v.diastolic}` : '—'}</td>
                  <td>{v.pulse ?? '—'}</td>
                  <td>{v.lochia_amount ? `${tv(v.lochia_amount)} · ${tv(v.lochia_color)}` : '—'}</td>
                  <td className="wrap">{v.wound_status || '—'}</td>
                  <td className="wrap">{v.breast_status || '—'}</td>
                  <td>{v.mood_score != null ? `${v.mood_score}/5` : '—'}</td>
                  <td>{v.pain_score != null ? `${v.pain_score}/10` : '—'}</td>
                  <td className="wrap">
                    {v.notes || '—'}{' '}
                    <PhotoBadge refs={data.photos.filter((p) => p.record_type === 'mother_vitals' && p.record_id === v.id)} />
                  </td>
                  <td>{v.recorded_by || '—'} <button className="row-del" onClick={() => setEditRec(v as unknown as Record<string, unknown>)}>✎</button><button className="row-del" onClick={() => delRecord(v.id)}>✕</button></td>
                </tr>
              ))}
              {data.vitals.length === 0 && <tr><td colSpan={11} className="empty">{t('common.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <VitalModal
          motherId={data.id}
          recordedBy={current}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {editRec && (
        <VitalModal
          motherId={data.id}
          recordedBy={current}
          editing={editRec}
          onClose={() => setEditRec(null)}
          onSaved={() => {
            setEditRec(null);
            load();
          }}
        />
      )}
    </>
  );
}

// 妈妈日常安排：洗头/照灯/针灸等，全员可见，工作台提前一天提醒
const APPT_PRESETS = ['洗头', '红外线照灯', '瘦身针灸', 'Kakak urut', 'Baby 拍摄', '产后修复', '中医调理'];

function ApptSection({ motherId, createdBy }: { motherId: number; createdBy: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Appointment[]>([]);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');

  const load = useCallback(
    () => api.get<Appointment[]>(`/api/mothers/${motherId}/appointments`).then(setItems),
    [motherId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!title.trim()) return;
    await api.post(`/api/mothers/${motherId}/appointments`, {
      date, time: time || null, title: title.trim(), created_by: createdBy,
    });
    setTitle('');
    setAdding(false);
    load();
  };

  const complete = async (a: Appointment) => {
    await api.patch(`/api/appointments/${a.id}`, { status: '已完成' });
    load();
  };

  const remove = async (a: Appointment) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await api.del(`/api/appointments/${a.id}`);
    load();
  };

  return (
    <div className="card">
      <h3>
        {t('appt.section')}
        <button className="btn btn-sm" onClick={() => setAdding(!adding)}>{t('appt.add')}</button>
      </h3>
      {adding && (
        <div style={{ marginBottom: 12 }}>
          <div className="form-grid">
            <div className="field">
              <label>{t('handover.date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('appt.time')}</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="field full">
              <label>{t('appt.item')}</label>
              <div className="chip-row" style={{ marginBottom: 6 }}>
                {APPT_PRESETS.map((p) => (
                  <button type="button" key={p} className={`chip ${title === p ? 'on' : ''}`} onClick={() => setTitle(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>{t('common.save')}</button>
          </div>
        </div>
      )}
      {items.map((a) => (
        <div className="task-item" key={a.id}>
          <span className={`badge ${a.status === '已完成' ? 'badge-done' : 'badge-info'}`}>
            {a.date} {a.time || ''}
          </span>
          <span className="title" style={a.status === '已完成' ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}}>
            {a.title}
          </span>
          {a.notes && <span className="meta">{a.notes}</span>}
          <span className="spacer" />
          {a.status !== '已完成' && (
            <button className="btn btn-sm" onClick={() => complete(a)}>✓</button>
          )}
          <button className="btn btn-sm" onClick={() => remove(a)}>✕</button>
        </div>
      ))}
      {items.length === 0 && !adding && <div className="empty">{t('appt.none')}</div>}
    </div>
  );
}

function VitalModal({
  motherId, recordedBy, onClose, onSaved, editing,
}: {
  motherId: number;
  recordedBy: string;
  onClose: () => void;
  onSaved: () => void;
  editing?: Record<string, unknown>;
}) {
  const { t, tv } = useI18n();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const ev = (k: string) => (editing?.[k] != null ? String(editing[k]) : undefined);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = editing ? {} : { recorded_by: recordedBy };
    fd.forEach((v, k) => {
      if (v !== '') body[k] = v;
    });
    if (body.time) body.time = new Date(String(body.time)).toISOString();
    for (const numKey of ['temperature_c', 'systolic', 'diastolic', 'pulse', 'mood_score', 'pain_score']) {
      if (body[numKey] != null) body[numKey] = Number(body[numKey]);
    }
    if (!editing && photos.length) body.photos = photos.map((p) => ({ data: p.data, mime: p.mime }));
    setBusy(true);
    setErr('');
    try {
      if (editing) await api.patch(`/api/records/mother_vitals/${editing.id}`, body);
      else await api.post(`/api/mothers/${motherId}/vitals`, body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const opt = (v: string) => <option key={v} value={v}>{tv(v)}</option>;

  return (
    <Modal title={t('modal.addMotherVitals')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('common.time')}</label>
            <input
              type="datetime-local"
              name="time"
              defaultValue={editing ? localDatetimeValue(new Date(String(editing.time))) : localDatetimeValue()}
              required
            />
          </div>
          <div className="field"><label>{t('vitals.tempC')}</label><input type="number" name="temperature_c" step="0.1" min={34} max={43} defaultValue={ev('temperature_c')} /></div>
          <div className="field"><label>{t('mother.sys')}</label><input type="number" name="systolic" min={0} defaultValue={ev('systolic')} /></div>
          <div className="field"><label>{t('mother.dia')}</label><input type="number" name="diastolic" min={0} defaultValue={ev('diastolic')} /></div>
          <div className="field"><label>{t('mother.pulseUnit')}</label><input type="number" name="pulse" min={0} defaultValue={ev('pulse')} /></div>
          <div className="field">
            <label>{t('mother.lochiaAmount')}</label>
            <select name="lochia_amount" defaultValue={ev('lochia_amount') ?? ''}>
              <option value="">—</option>
              {['少', '中', '多'].map(opt)}
            </select>
          </div>
          <div className="field">
            <label>{t('mother.lochiaColor')}</label>
            <select name="lochia_color" defaultValue={ev('lochia_color') ?? ''}>
              <option value="">—</option>
              {['鲜红', '暗红', '淡红', '白色'].map(opt)}
            </select>
          </div>
          <div className="field"><label>{t('mother.woundStatus')}</label><input name="wound_status" placeholder={t('mother.woundPlaceholder')} defaultValue={ev('wound_status')} /></div>
          <div className="field"><label>{t('mother.breastStatus')}</label><input name="breast_status" placeholder={t('mother.breastPlaceholder')} defaultValue={ev('breast_status')} /></div>
          <div className="field">
            <label>{t('mother.moodScore')}</label>
            <select name="mood_score" defaultValue={ev('mood_score') ?? ''}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t('mother.painScore')}</label>
            <select name="pain_score" defaultValue={ev('pain_score') ?? ''}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field full"><label>{t('common.notes')}</label><textarea name="notes" defaultValue={ev('notes')} /></div>
          {!editing && (
            <div className="field full">
              <label>{t('photo.photos')}</label>
              <PhotoInput photos={photos} onChange={setPhotos} />
            </div>
          )}
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
