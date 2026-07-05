import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api, fmtTime, dayOfLife, localDatetimeValue, BabyDetailData, PhotoRef } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';
import Modal from '../components/Modal';
import PhotoInput, { PhotoDraft } from '../components/PhotoInput';
import { PhotoBadge } from '../components/PhotoViewer';

type Tab = 'feeds' | 'diapers' | 'vitals' | 'cares';
type ModalKind = Tab | null;

const TAB_KEYS: Tab[] = ['feeds', 'diapers', 'vitals', 'cares'];

export default function BabyDetail() {
  const { id } = useParams();
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [data, setData] = useState<BabyDetailData | null>(null);
  const [tab, setTab] = useState<Tab>('feeds');
  const [modal, setModal] = useState<ModalKind>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api.get<BabyDetailData>(`/api/babies/${id}`).then(setData).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  const seriesW = t('baby.series.weight');
  const seriesJ = t('baby.series.jaundice');
  const seriesT = t('baby.series.temp');

  const chartData = useMemo(() => {
    if (!data) return { weights: [], jaundice: [], temps: [], dailyFeeds: [] as { day: string; total: number; count: number }[] };
    const byTimeAsc = <T extends { time: string }>(rows: T[]) => [...rows].sort((a, b) => a.time.localeCompare(b.time));
    const weights = byTimeAsc(data.vitals.filter((v) => v.weight_g != null)).map((v) => ({
      t: fmtTime(v.time), [seriesW]: v.weight_g,
    }));
    const jaundice = byTimeAsc(data.vitals.filter((v) => v.jaundice_mg_dl != null)).map((v) => ({
      t: fmtTime(v.time), [seriesJ]: v.jaundice_mg_dl,
    }));
    const temps = byTimeAsc(data.vitals.filter((v) => v.temperature_c != null)).map((v) => ({
      t: fmtTime(v.time), [seriesT]: v.temperature_c,
    }));
    const daily = new Map<string, { total: number; count: number }>();
    for (const f of data.feeds) {
      const day = f.time.slice(5, 10);
      const e = daily.get(day) || { total: 0, count: 0 };
      e.total += f.amount_ml || 0;
      e.count += 1;
      daily.set(day, e);
    }
    const dailyFeeds = [...daily.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, e]) => ({ day, total: e.total, count: e.count }));
    return { weights, jaundice, temps, dailyFeeds };
  }, [data, seriesW, seriesJ, seriesT]);

  if (error) return <div className="card">{t('common.loadFailed')}：{error}</div>;
  if (!data) return <div className="empty">{t('common.loading')}</div>;

  const latestWeight = data.vitals.find((v) => v.weight_g != null);
  const latestJaundice = data.vitals.find((v) => v.jaundice_mg_dl != null);
  const refsFor = (type: Tab, recordId: number): PhotoRef[] =>
    data.photos.filter((p) => p.record_type === type && p.record_id === recordId);

  return (
    <>
      <div className="page-title">
        👶 {data.name}
        <span className="badge badge-room">{data.room} {t('overview.roomSuffix')}</span>
        <span className="sub">
          {tv(data.sex)} · {t('baby.born')} {data.birth_date}（{t('overview.lifeDay', { n: dayOfLife(data.birth_date) })}）·{' '}
          {t('baby.motherLabel')}{' '}
          <Link to={`/mothers/${data.mother_id}`} style={{ textDecoration: 'underline' }}>
            {data.mother_name}
          </Link>
        </span>
      </div>

      <div className="card">
        <div className="info-list">
          <div><div className="k">{t('baby.birthWeight')}</div>{data.birth_weight_g ? `${data.birth_weight_g} g` : '—'}</div>
          <div><div className="k">{t('baby.latestWeight')}</div>{latestWeight ? `${latestWeight.weight_g} g（${fmtTime(latestWeight.time)}）` : '—'}</div>
          <div><div className="k">{t('baby.latestJaundice')}</div>{latestJaundice ? `${latestJaundice.jaundice_mg_dl} mg/dL（${fmtTime(latestJaundice.time)}）` : '—'}</div>
          <div><div className="k">{t('baby.gestAge')}</div>{data.gestational_age_weeks ? t('baby.gestWeeks', { n: data.gestational_age_weeks }) : '—'}</div>
          {data.notes && <div><div className="k">{t('common.notes')}</div>{data.notes}</div>}
        </div>
      </div>

      <div className="chart-grid" style={{ marginBottom: 14 }}>
        {chartData.weights.length > 1 && (
          <div className="chart-box">
            <h4>{t('baby.chart.weight')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.weights}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={['auto', 'auto']} fontSize={11} width={45} />
                <Tooltip />
                {data.birth_weight_g && (
                  <ReferenceLine y={data.birth_weight_g} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: t('baby.chart.birthWeightLine'), fontSize: 11 }} />
                )}
                <Line type="monotone" dataKey={seriesW} stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.jaundice.length > 1 && (
          <div className="chart-box">
            <h4>{t('baby.chart.jaundice')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.jaundice}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[0, 20]} fontSize={11} width={35} />
                <Tooltip />
                <ReferenceLine y={12} stroke="#b45309" strokeDasharray="4 4" label={{ value: t('baby.chart.watch12'), fontSize: 11 }} />
                <ReferenceLine y={15} stroke="#b91c1c" strokeDasharray="4 4" label={{ value: t('baby.chart.alert15'), fontSize: 11 }} />
                <Line type="monotone" dataKey={seriesJ} stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.dailyFeeds.length > 1 && (
          <div className="chart-box">
            <h4>{t('baby.chart.dailyMilk')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData.dailyFeeds}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} width={40} />
                <Tooltip />
                <Bar dataKey="total" name={t('baby.chart.milk')} fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.temps.length > 1 && (
          <div className="chart-box">
            <h4>{t('baby.chart.temp')}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.temps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[35.5, 38.5]} fontSize={11} width={40} />
                <Tooltip />
                <ReferenceLine y={37.5} stroke="#b91c1c" strokeDasharray="4 4" />
                <Line type="monotone" dataKey={seriesT} stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <div className="tabs">
          {TAB_KEYS.map((k) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {t(`tab.${k}`)}
            </button>
          ))}
          <button className="active" style={{ marginLeft: 'auto', background: 'var(--pink)', borderColor: 'var(--pink)' }} onClick={() => setModal(tab)}>
            {t('tab.addRecord', { tab: t(`tab.${tab}`) })}
          </button>
        </div>

        <div className="table-wrap">
          {tab === 'feeds' && (
            <table>
              <thead>
                <tr>
                  <th>{t('common.time')}</th><th>{t('feeds.method')}</th><th>{t('feeds.amount')}</th>
                  <th>{t('feeds.duration')}</th><th>{t('common.notes')}</th><th>{t('common.recordedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {data.feeds.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtTime(f.time)}</td>
                    <td>{tv(f.method)}</td>
                    <td>{f.amount_ml ? `${f.amount_ml} ml` : '—'}</td>
                    <td>{f.duration_min ? t('feeds.minutes', { n: f.duration_min }) : '—'}</td>
                    <td className="wrap">{f.notes || '—'} <PhotoBadge refs={refsFor('feeds', f.id)} /></td>
                    <td>{f.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.feeds.length === 0 && <tr><td colSpan={6} className="empty">{t('common.none')}</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'diapers' && (
            <table>
              <thead>
                <tr>
                  <th>{t('common.time')}</th><th>{t('diapers.type')}</th><th>{t('diapers.stoolColor')}</th>
                  <th>{t('diapers.consistency')}</th><th>{t('common.notes')}</th><th>{t('common.recordedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {data.diapers.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtTime(d.time)}</td>
                    <td>{tv(d.type)}</td>
                    <td>{tv(d.stool_color)}</td>
                    <td>{tv(d.stool_consistency)}</td>
                    <td className="wrap">{d.notes || '—'} <PhotoBadge refs={refsFor('diapers', d.id)} /></td>
                    <td>{d.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.diapers.length === 0 && <tr><td colSpan={6} className="empty">{t('common.none')}</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'vitals' && (
            <table>
              <thead>
                <tr>
                  <th>{t('common.time')}</th><th>{t('vitals.temp')}</th><th>{t('vitals.weight')}</th>
                  <th>{t('vitals.jaundice')}</th><th>{t('vitals.heartRate')}</th><th>{t('vitals.resp')}</th>
                  <th>{t('common.recordedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {data.vitals.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtTime(v.time)}</td>
                    <td>{v.temperature_c != null ? `${v.temperature_c}°C` : '—'}</td>
                    <td>{v.weight_g != null ? `${v.weight_g} g` : '—'}</td>
                    <td>{v.jaundice_mg_dl != null ? `${v.jaundice_mg_dl} mg/dL` : '—'}</td>
                    <td>{v.heart_rate ?? '—'}</td>
                    <td>{v.resp_rate ?? '—'} <PhotoBadge refs={refsFor('vitals', v.id)} /></td>
                    <td>{v.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.vitals.length === 0 && <tr><td colSpan={7} className="empty">{t('common.none')}</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'cares' && (
            <table>
              <thead>
                <tr>
                  <th>{t('common.time')}</th><th>{t('cares.type')}</th><th>{t('common.notes')}</th>
                  <th>{t('common.recordedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {data.cares.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtTime(c.time)}</td>
                    <td>{tv(c.care_type)}</td>
                    <td className="wrap">{c.notes || '—'} <PhotoBadge refs={refsFor('cares', c.id)} /></td>
                    <td>{c.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.cares.length === 0 && <tr><td colSpan={4} className="empty">{t('common.none')}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <RecordModal
          kind={modal}
          babyId={data.id}
          recordedBy={current}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </>
  );
}

function RecordModal({
  kind, babyId, recordedBy, onClose, onSaved,
}: {
  kind: Tab;
  babyId: number;
  recordedBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tv } = useI18n();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { recorded_by: recordedBy };
    fd.forEach((v, k) => {
      if (v !== '') body[k] = v;
    });
    if (body.time) body.time = new Date(String(body.time)).toISOString();
    for (const numKey of ['amount_ml', 'duration_min', 'temperature_c', 'weight_g', 'jaundice_mg_dl', 'heart_rate', 'resp_rate']) {
      if (body[numKey] != null) body[numKey] = Number(body[numKey]);
    }
    if (photos.length) body.photos = photos.map((p) => ({ data: p.data, mime: p.mime }));
    setBusy(true);
    setErr('');
    try {
      await api.post(`/api/babies/${babyId}/${kind}`, body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const titles: Record<Tab, string> = {
    feeds: t('modal.addFeed'),
    diapers: t('modal.addDiaper'),
    vitals: t('modal.addVitals'),
    cares: t('modal.addCare'),
  };

  // 选项 value 保持中文（数据库存储值），显示按语言翻译
  const opt = (v: string) => <option key={v} value={v}>{tv(v)}</option>;

  return (
    <Modal title={titles[kind]} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('common.time')}</label>
            <input type="datetime-local" name="time" defaultValue={localDatetimeValue()} required />
          </div>
          {kind === 'feeds' && (
            <>
              <div className="field">
                <label>{t('feeds.methodRequired')}</label>
                <select name="method" required>
                  {['母乳亲喂', '瓶喂母乳', '配方奶', '混合喂养'].map(opt)}
                </select>
              </div>
              <div className="field"><label>{t('feeds.amountMl')}</label><input type="number" name="amount_ml" min={0} /></div>
              <div className="field"><label>{t('feeds.durationMin')}</label><input type="number" name="duration_min" min={0} /></div>
            </>
          )}
          {kind === 'diapers' && (
            <>
              <div className="field">
                <label>{t('diapers.typeRequired')}</label>
                <select name="type" required>
                  {['尿', '便', '尿+便'].map(opt)}
                </select>
              </div>
              <div className="field">
                <label>{t('diapers.stoolColor')}</label>
                <select name="stool_color" defaultValue="">
                  <option value="">—</option>
                  {['黄色', '黄绿色', '绿色', '墨绿色（胎便）', '灰白色'].map(opt)}
                </select>
              </div>
              <div className="field">
                <label>{t('diapers.consistency')}</label>
                <select name="stool_consistency" defaultValue="">
                  <option value="">—</option>
                  {['糊状', '稀水样', '颗粒状', '成形'].map(opt)}
                </select>
              </div>
            </>
          )}
          {kind === 'vitals' && (
            <>
              <div className="field"><label>{t('vitals.tempC')}</label><input type="number" name="temperature_c" step="0.1" min={30} max={43} /></div>
              <div className="field"><label>{t('vitals.weightG')}</label><input type="number" name="weight_g" min={0} /></div>
              <div className="field"><label>{t('vitals.jaundiceUnit')}</label><input type="number" name="jaundice_mg_dl" step="0.1" min={0} /></div>
              <div className="field"><label>{t('vitals.heartRateUnit')}</label><input type="number" name="heart_rate" min={0} /></div>
              <div className="field"><label>{t('vitals.respUnit')}</label><input type="number" name="resp_rate" min={0} /></div>
            </>
          )}
          {kind === 'cares' && (
            <div className="field">
              <label>{t('cares.typeRequired')}</label>
              <select name="care_type" required>
                {['洗澡', '抚触', '脐部护理', '臀部护理', '游泳', '晒太阳/光照', '其他'].map(opt)}
              </select>
            </div>
          )}
          <div className="field full"><label>{t('common.notes')}</label><textarea name="notes" /></div>
          <div className="field full">
            <label>{t('photo.photos')}</label>
            <PhotoInput photos={photos} onChange={setPhotos} />
          </div>
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
