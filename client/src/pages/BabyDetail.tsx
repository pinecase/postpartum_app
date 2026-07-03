import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api, fmtTime, dayOfLife, localDatetimeValue, BabyDetailData } from '../api';
import { useStaff } from '../StaffContext';
import Modal from '../components/Modal';

type Tab = 'feeds' | 'diapers' | 'vitals' | 'cares';
type ModalKind = Tab | null;

const TABS: { key: Tab; label: string }[] = [
  { key: 'feeds', label: '喂养' },
  { key: 'diapers', label: '大小便' },
  { key: 'vitals', label: '体征测量' },
  { key: 'cares', label: '护理项目' },
];

export default function BabyDetail() {
  const { id } = useParams();
  const { current } = useStaff();
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

  const chartData = useMemo(() => {
    if (!data) return { weights: [], jaundice: [], temps: [], dailyFeeds: [] as { day: string; total: number; count: number }[] };
    const byTimeAsc = <T extends { time: string }>(rows: T[]) => [...rows].sort((a, b) => a.time.localeCompare(b.time));
    const weights = byTimeAsc(data.vitals.filter((v) => v.weight_g != null)).map((v) => ({
      t: fmtTime(v.time), 体重: v.weight_g,
    }));
    const jaundice = byTimeAsc(data.vitals.filter((v) => v.jaundice_mg_dl != null)).map((v) => ({
      t: fmtTime(v.time), 黄疸: v.jaundice_mg_dl,
    }));
    const temps = byTimeAsc(data.vitals.filter((v) => v.temperature_c != null)).map((v) => ({
      t: fmtTime(v.time), 体温: v.temperature_c,
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
  }, [data]);

  if (error) return <div className="card">加载失败：{error}</div>;
  if (!data) return <div className="empty">加载中…</div>;

  const latestWeight = data.vitals.find((v) => v.weight_g != null);
  const latestJaundice = data.vitals.find((v) => v.jaundice_mg_dl != null);

  return (
    <>
      <div className="page-title">
        👶 {data.name}
        <span className="badge badge-room">{data.room} 房</span>
        <span className="sub">
          {data.sex} · 出生 {data.birth_date}（第 {dayOfLife(data.birth_date)} 天） · 母亲{' '}
          <Link to={`/mothers/${data.mother_id}`} style={{ textDecoration: 'underline' }}>
            {data.mother_name}
          </Link>
        </span>
      </div>

      <div className="card">
        <div className="info-list">
          <div><div className="k">出生体重</div>{data.birth_weight_g ? `${data.birth_weight_g} g` : '—'}</div>
          <div><div className="k">最近体重</div>{latestWeight ? `${latestWeight.weight_g} g（${fmtTime(latestWeight.time)}）` : '—'}</div>
          <div><div className="k">最近黄疸</div>{latestJaundice ? `${latestJaundice.jaundice_mg_dl} mg/dL（${fmtTime(latestJaundice.time)}）` : '—'}</div>
          <div><div className="k">孕周</div>{data.gestational_age_weeks ? `${data.gestational_age_weeks} 周` : '—'}</div>
          {data.notes && <div><div className="k">备注</div>{data.notes}</div>}
        </div>
      </div>

      <div className="chart-grid" style={{ marginBottom: 14 }}>
        {chartData.weights.length > 1 && (
          <div className="chart-box">
            <h4>体重趋势（g）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.weights}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={['auto', 'auto']} fontSize={11} width={45} />
                <Tooltip />
                {data.birth_weight_g && (
                  <ReferenceLine y={data.birth_weight_g} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '出生体重', fontSize: 11 }} />
                )}
                <Line type="monotone" dataKey="体重" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.jaundice.length > 1 && (
          <div className="chart-box">
            <h4>黄疸趋势（mg/dL）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.jaundice}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[0, 20]} fontSize={11} width={35} />
                <Tooltip />
                <ReferenceLine y={12} stroke="#b45309" strokeDasharray="4 4" label={{ value: '关注 12', fontSize: 11 }} />
                <ReferenceLine y={15} stroke="#b91c1c" strokeDasharray="4 4" label={{ value: '预警 15', fontSize: 11 }} />
                <Line type="monotone" dataKey="黄疸" stroke="#b45309" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.dailyFeeds.length > 1 && (
          <div className="chart-box">
            <h4>每日奶量（ml，瓶喂部分）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData.dailyFeeds}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} width={40} />
                <Tooltip />
                <Bar dataKey="total" name="奶量" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartData.temps.length > 1 && (
          <div className="chart-box">
            <h4>体温趋势（°C）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData.temps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[35.5, 38.5]} fontSize={11} width={40} />
                <Tooltip />
                <ReferenceLine y={37.5} stroke="#b91c1c" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="体温" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
          <button className="active" style={{ marginLeft: 'auto', background: 'var(--pink)', borderColor: 'var(--pink)' }} onClick={() => setModal(tab)}>
            ＋ 添加{TABS.find((t) => t.key === tab)?.label}记录
          </button>
        </div>

        <div className="table-wrap">
          {tab === 'feeds' && (
            <table>
              <thead>
                <tr><th>时间</th><th>方式</th><th>奶量</th><th>时长</th><th>备注</th><th>记录人</th></tr>
              </thead>
              <tbody>
                {data.feeds.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtTime(f.time)}</td>
                    <td>{f.method}</td>
                    <td>{f.amount_ml ? `${f.amount_ml} ml` : '—'}</td>
                    <td>{f.duration_min ? `${f.duration_min} 分钟` : '—'}</td>
                    <td className="wrap">{f.notes || '—'}</td>
                    <td>{f.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.feeds.length === 0 && <tr><td colSpan={6} className="empty">暂无记录</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'diapers' && (
            <table>
              <thead>
                <tr><th>时间</th><th>类型</th><th>大便颜色</th><th>性状</th><th>备注</th><th>记录人</th></tr>
              </thead>
              <tbody>
                {data.diapers.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtTime(d.time)}</td>
                    <td>{d.type}</td>
                    <td>{d.stool_color || '—'}</td>
                    <td>{d.stool_consistency || '—'}</td>
                    <td className="wrap">{d.notes || '—'}</td>
                    <td>{d.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.diapers.length === 0 && <tr><td colSpan={6} className="empty">暂无记录</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'vitals' && (
            <table>
              <thead>
                <tr><th>时间</th><th>体温</th><th>体重</th><th>黄疸</th><th>心率</th><th>呼吸</th><th>记录人</th></tr>
              </thead>
              <tbody>
                {data.vitals.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtTime(v.time)}</td>
                    <td>{v.temperature_c != null ? `${v.temperature_c}°C` : '—'}</td>
                    <td>{v.weight_g != null ? `${v.weight_g} g` : '—'}</td>
                    <td>{v.jaundice_mg_dl != null ? `${v.jaundice_mg_dl} mg/dL` : '—'}</td>
                    <td>{v.heart_rate ?? '—'}</td>
                    <td>{v.resp_rate ?? '—'}</td>
                    <td>{v.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.vitals.length === 0 && <tr><td colSpan={7} className="empty">暂无记录</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'cares' && (
            <table>
              <thead>
                <tr><th>时间</th><th>护理项目</th><th>备注</th><th>记录人</th></tr>
              </thead>
              <tbody>
                {data.cares.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtTime(c.time)}</td>
                    <td>{c.care_type}</td>
                    <td className="wrap">{c.notes || '—'}</td>
                    <td>{c.recorded_by || '—'}</td>
                  </tr>
                ))}
                {data.cares.length === 0 && <tr><td colSpan={4} className="empty">暂无记录</td></tr>}
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
    feeds: '添加喂养记录',
    diapers: '添加大小便记录',
    vitals: '添加体征测量',
    cares: '添加护理项目',
  };

  return (
    <Modal title={titles[kind]} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>时间</label>
            <input type="datetime-local" name="time" defaultValue={localDatetimeValue()} required />
          </div>
          {kind === 'feeds' && (
            <>
              <div className="field">
                <label>喂养方式 *</label>
                <select name="method" required>
                  <option>母乳亲喂</option>
                  <option>瓶喂母乳</option>
                  <option>配方奶</option>
                  <option>混合喂养</option>
                </select>
              </div>
              <div className="field"><label>奶量（ml）</label><input type="number" name="amount_ml" min={0} /></div>
              <div className="field"><label>时长（分钟）</label><input type="number" name="duration_min" min={0} /></div>
            </>
          )}
          {kind === 'diapers' && (
            <>
              <div className="field">
                <label>类型 *</label>
                <select name="type" required>
                  <option>尿</option>
                  <option>便</option>
                  <option>尿+便</option>
                </select>
              </div>
              <div className="field">
                <label>大便颜色</label>
                <select name="stool_color" defaultValue="">
                  <option value="">—</option>
                  <option>黄色</option>
                  <option>黄绿色</option>
                  <option>绿色</option>
                  <option>墨绿色（胎便）</option>
                  <option>灰白色</option>
                </select>
              </div>
              <div className="field">
                <label>性状</label>
                <select name="stool_consistency" defaultValue="">
                  <option value="">—</option>
                  <option>糊状</option>
                  <option>稀水样</option>
                  <option>颗粒状</option>
                  <option>成形</option>
                </select>
              </div>
            </>
          )}
          {kind === 'vitals' && (
            <>
              <div className="field"><label>体温（°C）</label><input type="number" name="temperature_c" step="0.1" min={30} max={43} /></div>
              <div className="field"><label>体重（g）</label><input type="number" name="weight_g" min={0} /></div>
              <div className="field"><label>经皮黄疸（mg/dL）</label><input type="number" name="jaundice_mg_dl" step="0.1" min={0} /></div>
              <div className="field"><label>心率（次/分）</label><input type="number" name="heart_rate" min={0} /></div>
              <div className="field"><label>呼吸（次/分）</label><input type="number" name="resp_rate" min={0} /></div>
            </>
          )}
          {kind === 'cares' && (
            <div className="field">
              <label>护理项目 *</label>
              <select name="care_type" required>
                <option>洗澡</option>
                <option>抚触</option>
                <option>脐部护理</option>
                <option>臀部护理</option>
                <option>游泳</option>
                <option>晒太阳/光照</option>
                <option>其他</option>
              </select>
            </div>
          )}
          <div className="field full"><label>备注</label><textarea name="notes" /></div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </Modal>
  );
}
