import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { api, fmtTime, dayOfLife, localDatetimeValue, MotherDetailData } from '../api';
import { useStaff } from '../StaffContext';
import Modal from '../components/Modal';

export default function MotherDetail() {
  const { id } = useParams();
  const { current } = useStaff();
  const [data, setData] = useState<MotherDetailData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api.get<MotherDetailData>(`/api/mothers/${id}`).then(setData).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data.vitals]
      .sort((a, b) => a.time.localeCompare(b.time))
      .filter((v) => v.temperature_c != null || v.systolic != null)
      .map((v) => ({
        t: fmtTime(v.time),
        体温: v.temperature_c,
        收缩压: v.systolic,
        舒张压: v.diastolic,
      }));
  }, [data]);

  const discharge = async () => {
    if (!data) return;
    if (!window.confirm(`确认为 ${data.name} 办理离所？宝宝将一并标记为已离所。`)) return;
    await api.patch(`/api/mothers/${data.id}`, { status: '已离所' });
    load();
  };

  if (error) return <div className="card">加载失败：{error}</div>;
  if (!data) return <div className="empty">加载中…</div>;

  return (
    <>
      <div className="page-title">
        🤱 {data.name}
        <span className="badge badge-room">{data.room} 房</span>
        {data.status === '已离所' && <span className="badge badge-done">已离所</span>}
        <span className="sub">
          {data.delivery_type} · 产后第 {dayOfLife(data.delivery_date)} 天 · 入住 {data.admission_date}
        </span>
      </div>

      <div className="card">
        <div className="info-list">
          <div><div className="k">年龄</div>{data.age ?? '—'}</div>
          <div><div className="k">孕产史</div>{data.parity || '—'}</div>
          <div><div className="k">喂养计划</div>{data.feeding_plan || '—'}</div>
          <div><div className="k">过敏史</div>{data.allergies || '无'}</div>
          <div><div className="k">预计离所</div>{data.expected_discharge_date || '—'}</div>
          <div>
            <div className="k">宝宝</div>
            {data.babies.map((b, i) => (
              <span key={b.id}>
                {i > 0 && '、'}
                <Link to={`/babies/${b.id}`} style={{ textDecoration: 'underline' }}>{b.name}</Link>
              </span>
            ))}
            {data.babies.length === 0 && '—'}
          </div>
          {data.notes && <div><div className="k">备注</div>{data.notes}</div>}
        </div>
        {data.status === '在住' && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>＋ 添加查房记录</button>
            <button className="btn" onClick={discharge}>办理离所</button>
          </div>
        )}
      </div>

      {chartData.length > 1 && (
        <div className="chart-grid" style={{ marginBottom: 14 }}>
          <div className="chart-box">
            <h4>体温趋势（°C）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[35.5, 39]} fontSize={11} width={40} />
                <Tooltip />
                <ReferenceLine y={38} stroke="#b91c1c" strokeDasharray="4 4" label={{ value: '发热 38', fontSize: 11 }} />
                <Line type="monotone" dataKey="体温" stroke="#be185d" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-box">
            <h4>血压趋势（mmHg）</h4>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="t" fontSize={11} />
                <YAxis domain={[50, 160]} fontSize={11} width={40} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={140} stroke="#b91c1c" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="收缩压" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="舒张压" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <h3>查房记录</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th><th>体温</th><th>血压</th><th>脉搏</th><th>恶露</th>
                <th>伤口</th><th>乳房</th><th>情绪</th><th>疼痛</th><th>备注</th><th>记录人</th>
              </tr>
            </thead>
            <tbody>
              {data.vitals.map((v) => (
                <tr key={v.id}>
                  <td>{fmtTime(v.time)}</td>
                  <td>{v.temperature_c != null ? `${v.temperature_c}°C` : '—'}</td>
                  <td>{v.systolic != null ? `${v.systolic}/${v.diastolic}` : '—'}</td>
                  <td>{v.pulse ?? '—'}</td>
                  <td>{v.lochia_amount ? `${v.lochia_amount} · ${v.lochia_color || ''}` : '—'}</td>
                  <td className="wrap">{v.wound_status || '—'}</td>
                  <td className="wrap">{v.breast_status || '—'}</td>
                  <td>{v.mood_score != null ? `${v.mood_score}/5` : '—'}</td>
                  <td>{v.pain_score != null ? `${v.pain_score}/10` : '—'}</td>
                  <td className="wrap">{v.notes || '—'}</td>
                  <td>{v.recorded_by || '—'}</td>
                </tr>
              ))}
              {data.vitals.length === 0 && <tr><td colSpan={11} className="empty">暂无记录</td></tr>}
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
    </>
  );
}

function VitalModal({
  motherId, recordedBy, onClose, onSaved,
}: {
  motherId: number;
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
    for (const numKey of ['temperature_c', 'systolic', 'diastolic', 'pulse', 'mood_score', 'pain_score']) {
      if (body[numKey] != null) body[numKey] = Number(body[numKey]);
    }
    setBusy(true);
    setErr('');
    try {
      await api.post(`/api/mothers/${motherId}/vitals`, body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="添加产妇查房记录" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>时间</label>
            <input type="datetime-local" name="time" defaultValue={localDatetimeValue()} required />
          </div>
          <div className="field"><label>体温（°C）</label><input type="number" name="temperature_c" step="0.1" min={34} max={43} /></div>
          <div className="field"><label>收缩压</label><input type="number" name="systolic" min={0} /></div>
          <div className="field"><label>舒张压</label><input type="number" name="diastolic" min={0} /></div>
          <div className="field"><label>脉搏（次/分）</label><input type="number" name="pulse" min={0} /></div>
          <div className="field">
            <label>恶露量</label>
            <select name="lochia_amount" defaultValue="">
              <option value="">—</option><option>少</option><option>中</option><option>多</option>
            </select>
          </div>
          <div className="field">
            <label>恶露颜色</label>
            <select name="lochia_color" defaultValue="">
              <option value="">—</option><option>鲜红</option><option>暗红</option><option>淡红</option><option>白色</option>
            </select>
          </div>
          <div className="field"><label>伤口情况</label><input name="wound_status" placeholder="如：切口干燥无红肿" /></div>
          <div className="field"><label>乳房情况</label><input name="breast_status" placeholder="如：轻度胀奶" /></div>
          <div className="field">
            <label>情绪评分（1差—5好）</label>
            <select name="mood_score" defaultValue="">
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>疼痛评分（0—10）</label>
            <select name="pain_score" defaultValue="">
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, n) => <option key={n}>{n}</option>)}
            </select>
          </div>
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
