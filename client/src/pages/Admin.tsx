import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { api, fmtTime, dayOfLife, Alert } from '../api';
import { useI18n } from '../i18n';
import { downloadCsv } from '../csv';

interface BabySummary {
  id: number;
  name: string;
  sex: string;
  birth_date: string;
  birth_weight_g: number | null;
  status: string;
  mother_name: string;
  room: string;
  latest_weight: number | null;
  latest_jaundice: number | null;
  latest_temp: number | null;
  feeds_today: number;
  milk_today: number;
  stools_today: number;
}

interface MotherSummary {
  id: number;
  name: string;
  room: string;
  status: string;
  admission_date: string;
  expected_discharge_date: string | null;
  delivery_date: string;
  delivery_type: string;
  baby_count: number;
  latest_temp: number | null;
  latest_systolic: number | null;
  latest_diastolic: number | null;
  latest_lochia: string | null;
  latest_mood: number | null;
  latest_pain: number | null;
}

interface Summary {
  totals: {
    mothers_in_house: number;
    babies_in_house: number;
    mothers_total: number;
    admissions_30d: number;
    records_total: number;
  };
  babies: BabySummary[];
  mothers: MotherSummary[];
  trends: {
    admissions: { d: string; c: number }[];
    discharges: { d: string; c: number }[];
    milk_daily: { d: string; total: number; feeds: number }[];
    delivery_dist: { k: string; c: number }[];
  };
  alerts: Alert[];
}

// 校验通过的图表色（见 dataviz 规范）：主青 #0d9488、对比琥珀 #b45309
const C_TEAL = '#0d9488';
const C_AMBER = '#b45309';

const EXPORT_TYPES = ['feeds', 'diapers', 'baby_vitals', 'cares', 'mother_vitals'] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

// 各明细类型的列定义：key 对应 API 字段，label 为 i18n 键，tv 表示值需按语言翻译
const EXPORT_COLUMNS: Record<ExportType, { key: string; label: string; tv?: boolean }[]> = {
  feeds: [
    { key: 'time', label: 'common.time' },
    { key: 'room', label: 'common.room' },
    { key: 'baby_name', label: 'common.baby' },
    { key: 'mother_name', label: 'common.mother' },
    { key: 'method', label: 'feeds.method', tv: true },
    { key: 'amount_ml', label: 'feeds.amountMl' },
    { key: 'duration_min', label: 'feeds.durationMin' },
    { key: 'notes', label: 'common.notes' },
    { key: 'recorded_by', label: 'common.recordedBy' },
  ],
  diapers: [
    { key: 'time', label: 'common.time' },
    { key: 'room', label: 'common.room' },
    { key: 'baby_name', label: 'common.baby' },
    { key: 'mother_name', label: 'common.mother' },
    { key: 'type', label: 'diapers.type', tv: true },
    { key: 'stool_color', label: 'diapers.stoolColor', tv: true },
    { key: 'stool_consistency', label: 'diapers.consistency', tv: true },
    { key: 'notes', label: 'common.notes' },
    { key: 'recorded_by', label: 'common.recordedBy' },
  ],
  baby_vitals: [
    { key: 'time', label: 'common.time' },
    { key: 'room', label: 'common.room' },
    { key: 'baby_name', label: 'common.baby' },
    { key: 'mother_name', label: 'common.mother' },
    { key: 'temperature_c', label: 'vitals.tempC' },
    { key: 'weight_g', label: 'vitals.weightG' },
    { key: 'jaundice_mg_dl', label: 'vitals.jaundiceUnit' },
    { key: 'heart_rate', label: 'vitals.heartRateUnit' },
    { key: 'resp_rate', label: 'vitals.respUnit' },
    { key: 'notes', label: 'common.notes' },
    { key: 'recorded_by', label: 'common.recordedBy' },
  ],
  cares: [
    { key: 'time', label: 'common.time' },
    { key: 'room', label: 'common.room' },
    { key: 'baby_name', label: 'common.baby' },
    { key: 'mother_name', label: 'common.mother' },
    { key: 'care_type', label: 'cares.type', tv: true },
    { key: 'notes', label: 'common.notes' },
    { key: 'recorded_by', label: 'common.recordedBy' },
  ],
  mother_vitals: [
    { key: 'time', label: 'common.time' },
    { key: 'room', label: 'common.room' },
    { key: 'mother_name', label: 'common.mother' },
    { key: 'temperature_c', label: 'vitals.tempC' },
    { key: 'systolic', label: 'mother.sys' },
    { key: 'diastolic', label: 'mother.dia' },
    { key: 'pulse', label: 'mother.pulseUnit' },
    { key: 'lochia_amount', label: 'mother.lochiaAmount', tv: true },
    { key: 'lochia_color', label: 'mother.lochiaColor', tv: true },
    { key: 'wound_status', label: 'mother.woundStatus' },
    { key: 'breast_status', label: 'mother.breastStatus' },
    { key: 'mood_score', label: 'mother.mood' },
    { key: 'pain_score', label: 'mother.pain' },
    { key: 'notes', label: 'common.notes' },
    { key: 'recorded_by', label: 'common.recordedBy' },
  ],
};

// 访问码设置：全店一个 4-8 位数字，设置后所有人打开需输入一次
function PinSection() {
  const { t } = useI18n();
  const [pinSet, setPinSet] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/auth/status').then((r) => r.json()).then((j) => setPinSet(j.pin_set));
  }, []);

  const save = async () => {
    setMsg('');
    const res = await fetch('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_pin: oldPin, new_pin: newPin }),
    });
    const j = await res.json();
    if (res.ok) {
      localStorage.setItem('app_pin', newPin);
      setPinSet(true);
      setOldPin('');
      setNewPin('');
      setMsg(t('pin.saved'));
    } else {
      setMsg(j.error || 'error');
    }
  };

  return (
    <div className="card">
      <h3>🔐 {t('pin.section')}</h3>
      {!pinSet && <p className="meta" style={{ color: 'var(--danger)', marginBottom: 8 }}>{t('pin.unsetWarning')}</p>}
      <div className="form-grid">
        {pinSet && (
          <div className="field">
            <label>{t('pin.old')}</label>
            <input type="password" inputMode="numeric" value={oldPin} onChange={(e) => setOldPin(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>{t('pin.new')}</label>
          <input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="4-8 位数字" />
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={!/^\d{4,8}$/.test(newPin)}>
            {t('common.save')}
          </button>
        </div>
      </div>
      {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

const lastNDays = (n: number) => {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return days;
};

export default function Admin() {
  const { t, tv } = useI18n();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [expType, setExpType] = useState<ExportType>('feeds');
  const [expFrom, setExpFrom] = useState(lastNDays(7)[0]);
  const [expTo, setExpTo] = useState(lastNDays(1)[0]);
  const [expBusy, setExpBusy] = useState(false);
  const [expMsg, setExpMsg] = useState('');

  useEffect(() => {
    api.get<Summary>('/api/admin/summary').then(setData).catch((e) => setError(e.message));
  }, []);

  const trendData = useMemo(() => {
    if (!data) return [];
    const adm = new Map(data.trends.admissions.map((r) => [r.d, r.c]));
    const dis = new Map(data.trends.discharges.map((r) => [r.d, r.c]));
    return lastNDays(14).map((d) => ({
      d: d.slice(5),
      [t('admin.series.adm')]: adm.get(d) || 0,
      [t('admin.series.dis')]: dis.get(d) || 0,
    }));
  }, [data, t]);

  const milkData = useMemo(() => {
    if (!data) return [];
    const m = new Map(data.trends.milk_daily.map((r) => [r.d, r.total]));
    return lastNDays(14).map((d) => ({ d: d.slice(5), total: m.get(d) || 0 }));
  }, [data]);

  if (error) return <div className="card">{t('common.loadFailed')}：{error}</div>;
  if (!data) return <div className="empty">{t('common.loading')}</div>;

  const weightChangePct = (b: BabySummary) =>
    b.birth_weight_g && b.latest_weight
      ? ((b.latest_weight - b.birth_weight_g) / b.birth_weight_g) * 100
      : null;

  const exportBabies = () => {
    downloadCsv(
      `babies_${expTo}.csv`,
      [t('common.room'), t('common.baby'), t('common.mother'), t('admin.status'), t('admission.sex'),
        t('admin.dayAge'), t('baby.birthWeight'), t('baby.latestWeight'), t('admin.vsBirth'),
        t('baby.latestJaundice'), t('vitals.temp'), t('admin.feedsToday'), t('admin.milkToday'), t('admin.stoolsToday')],
      data.babies.map((b) => {
        const pct = weightChangePct(b);
        return [b.room, b.name, b.mother_name, tv(b.status), tv(b.sex), dayOfLife(b.birth_date),
          b.birth_weight_g, b.latest_weight, pct != null ? `${pct.toFixed(1)}%` : '',
          b.latest_jaundice, b.latest_temp, b.feeds_today, b.milk_today, b.stools_today];
      })
    );
  };

  const exportMothers = () => {
    downloadCsv(
      `mothers_${expTo}.csv`,
      [t('common.room'), t('common.name'), t('admin.status'), t('admin.dayAge'),
        t('admission.deliveryType'), t('admin.babyCount'), t('vitals.temp'), t('mother.bp'),
        t('mother.lochia'), t('mother.mood'), t('mother.pain'), t('overview.admitted'), t('mother.expectedDischarge')],
      data.mothers.map((m) => [
        m.room, m.name, tv(m.status), dayOfLife(m.delivery_date), tv(m.delivery_type), m.baby_count,
        m.latest_temp, m.latest_systolic != null ? `${m.latest_systolic}/${m.latest_diastolic}` : '',
        tv(m.latest_lochia), m.latest_mood, m.latest_pain, m.admission_date, m.expected_discharge_date,
      ])
    );
  };

  const exportDetail = async () => {
    setExpBusy(true);
    setExpMsg('');
    try {
      const rows = await api.get<Record<string, unknown>[]>(
        `/api/admin/records?type=${expType}&from=${expFrom}&to=${expTo}`
      );
      if (!rows.length) {
        setExpMsg(t('admin.exportEmpty'));
        return;
      }
      const cols = EXPORT_COLUMNS[expType];
      downloadCsv(
        `${expType}_${expFrom}_${expTo}.csv`,
        cols.map((c) => t(c.label)),
        rows.map((r) =>
          cols.map((c) => {
            const v = r[c.key];
            if (c.key === 'time') return fmtTime(v as string);
            if (c.tv) return tv(v as string | null);
            return v as string | number | null;
          })
        )
      );
    } catch (e) {
      setExpMsg((e as Error).message);
    } finally {
      setExpBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">{t('admin.title')}</div>

      <div className="grid grid-stats">
        <div className="stat"><div className="num">{data.totals.mothers_in_house}</div><div className="label">{t('stats.mothersInHouse')}</div></div>
        <div className="stat"><div className="num">{data.totals.babies_in_house}</div><div className="label">{t('stats.babiesInHouse')}</div></div>
        <div className="stat"><div className="num">{data.totals.admissions_30d}</div><div className="label">{t('admin.adm30')}</div></div>
        <div className="stat"><div className="num">{data.totals.mothers_total}</div><div className="label">{t('admin.mothersTotal')}</div></div>
        <div className="stat"><div className="num">{data.totals.records_total}</div><div className="label">{t('admin.recordsTotal')}</div></div>
        <div className="stat">
          <div className="num" style={{ color: data.alerts.some((a) => a.level === 'danger') ? 'var(--danger)' : undefined }}>
            {data.alerts.length}
          </div>
          <div className="label">{t('overview.alerts').replace('⚠️ ', '')}</div>
        </div>
      </div>

      <div className="chart-grid" style={{ marginBottom: 14 }}>
        <div className="chart-box">
          <h4>{t('admin.trend14')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="d" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={30} />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('admin.series.adm')} fill={C_TEAL} radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('admin.series.dis')} fill={C_AMBER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h4>{t('admin.milk14')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={milkData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="d" fontSize={11} />
              <YAxis fontSize={11} width={45} />
              <Tooltip />
              <Bar dataKey="total" name={t('baby.chart.milk')} fill={C_TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h4>{t('admin.deliveryDist')}</h4>
          {data.trends.delivery_dist.map((row) => {
            const max = Math.max(...data.trends.delivery_dist.map((r) => r.c));
            return (
              <div className="dist-row" key={row.k}>
                <span className="dist-label">{tv(row.k)}</span>
                <span className="dist-bar" style={{ width: `${(row.c / max) * 100}%` }} />
                <span className="dist-num">{row.c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>
          👶 {t('admin.babyTable')}（{data.babies.length}）
          <button className="btn btn-sm" onClick={exportBabies}>{t('admin.exportCsv')}</button>
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('common.room')}</th><th>{t('common.baby')}</th><th>{t('common.mother')}</th>
                <th>{t('admin.status')}</th><th>{t('admin.dayAge')}</th><th>{t('baby.birthWeight')}</th>
                <th>{t('baby.latestWeight')}</th><th>{t('admin.vsBirth')}</th><th>{t('vitals.jaundice')}</th>
                <th>{t('vitals.temp')}</th><th>{t('admin.feedsToday')}</th><th>{t('admin.milkToday')}</th>
                <th>{t('admin.stoolsToday')}</th>
              </tr>
            </thead>
            <tbody>
              {data.babies.map((b) => {
                const pct = weightChangePct(b);
                return (
                  <tr key={b.id}>
                    <td><span className="badge badge-room">{b.room}</span></td>
                    <td><Link to={`/babies/${b.id}`} style={{ textDecoration: 'underline' }}>{b.name}</Link></td>
                    <td>{b.mother_name}</td>
                    <td><span className={`badge ${b.status === '在住' ? 'badge-baby' : 'badge-done'}`}>{tv(b.status)}</span></td>
                    <td>{dayOfLife(b.birth_date)}</td>
                    <td>{b.birth_weight_g ?? '—'}</td>
                    <td>{b.latest_weight ?? '—'}</td>
                    <td className={pct != null && pct <= -10 ? 'cell-danger' : ''}>
                      {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className={b.latest_jaundice != null && b.latest_jaundice >= 15 ? 'cell-danger' : b.latest_jaundice != null && b.latest_jaundice >= 12 ? 'cell-warning' : ''}>
                      {b.latest_jaundice ?? '—'}
                    </td>
                    <td className={b.latest_temp != null && b.latest_temp >= 37.5 ? 'cell-danger' : ''}>
                      {b.latest_temp ?? '—'}
                    </td>
                    <td>{b.feeds_today}</td>
                    <td>{b.milk_today}</td>
                    <td>{b.stools_today}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>
          🤱 {t('admin.motherTable')}（{data.mothers.length}）
          <button className="btn btn-sm" onClick={exportMothers}>{t('admin.exportCsv')}</button>
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('common.room')}</th><th>{t('common.name')}</th><th>{t('admin.status')}</th>
                <th>{t('admin.dayAge')}</th><th>{t('admission.deliveryType')}</th><th>{t('admin.babyCount')}</th>
                <th>{t('vitals.temp')}</th><th>{t('mother.bp')}</th><th>{t('mother.lochia')}</th>
                <th>{t('mother.mood')}</th><th>{t('mother.pain')}</th><th>{t('overview.admitted')}</th>
                <th>{t('mother.expectedDischarge')}</th>
              </tr>
            </thead>
            <tbody>
              {data.mothers.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge badge-room">{m.room}</span></td>
                  <td><Link to={`/mothers/${m.id}`} style={{ textDecoration: 'underline' }}>{m.name}</Link></td>
                  <td><span className={`badge ${m.status === '在住' ? 'badge-mother' : 'badge-done'}`}>{tv(m.status)}</span></td>
                  <td>{dayOfLife(m.delivery_date)}</td>
                  <td>{tv(m.delivery_type)}</td>
                  <td>{m.baby_count}</td>
                  <td className={m.latest_temp != null && m.latest_temp >= 38 ? 'cell-danger' : ''}>{m.latest_temp ?? '—'}</td>
                  <td className={m.latest_systolic != null && (m.latest_systolic >= 140 || (m.latest_diastolic ?? 0) >= 90) ? 'cell-danger' : ''}>
                    {m.latest_systolic != null ? `${m.latest_systolic}/${m.latest_diastolic}` : '—'}
                  </td>
                  <td className={m.latest_lochia === '多' ? 'cell-warning' : ''}>{tv(m.latest_lochia)}</td>
                  <td className={m.latest_mood != null && m.latest_mood <= 2 ? 'cell-warning' : ''}>{m.latest_mood ?? '—'}</td>
                  <td className={m.latest_pain != null && m.latest_pain >= 7 ? 'cell-warning' : ''}>{m.latest_pain ?? '—'}</td>
                  <td>{m.admission_date}</td>
                  <td>{m.expected_discharge_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PinSection />

      <div className="card">
        <h3>{t('admin.exportDetail')}</h3>
        <div className="form-grid">
          <div className="field">
            <label>{t('admin.recordType')}</label>
            <select value={expType} onChange={(e) => setExpType(e.target.value as ExportType)}>
              {EXPORT_TYPES.map((k) => (
                <option key={k} value={k}>{t(`admin.type.${k}`)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('admin.from')}</label>
            <input type="date" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('admin.to')}</label>
            <input type="date" value={expTo} onChange={(e) => setExpTo(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={exportDetail} disabled={expBusy}>
              {expBusy ? t('common.submitting') : t('admin.exportCsv')}
            </button>
          </div>
        </div>
        {expMsg && <div className="form-error" style={{ marginTop: 8 }}>{expMsg}</div>}
      </div>
    </>
  );
}
