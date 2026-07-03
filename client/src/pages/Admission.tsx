import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Mother } from '../api';

interface BabyDraft {
  name: string;
  sex: string;
  birth_weight_g: string;
  gestational_age_weeks: string;
}

const emptyBaby = (): BabyDraft => ({ name: '', sex: '女', birth_weight_g: '', gestational_age_weeks: '' });

export default function Admission() {
  const nav = useNavigate();
  const [mothers, setMothers] = useState<Mother[]>([]);
  const [babies, setBabies] = useState<BabyDraft[]>([emptyBaby()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Mother[]>('/api/mothers').then(setMothers);
  useEffect(() => {
    load();
  }, []);

  const setBaby = (i: number, patch: Partial<BabyDraft>) =>
    setBabies((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      age: fd.get('age') ? Number(fd.get('age')) : null,
      room: fd.get('room'),
      admission_date: fd.get('admission_date'),
      expected_discharge_date: fd.get('expected_discharge_date') || null,
      delivery_date: fd.get('delivery_date'),
      delivery_type: fd.get('delivery_type'),
      parity: fd.get('parity') || null,
      feeding_plan: fd.get('feeding_plan') || null,
      allergies: fd.get('allergies') || null,
      notes: fd.get('notes') || null,
      babies: babies
        .filter((b) => b.name.trim())
        .map((b) => ({
          name: b.name.trim(),
          sex: b.sex,
          birth_date: fd.get('delivery_date'),
          birth_weight_g: b.birth_weight_g ? Number(b.birth_weight_g) : null,
          gestational_age_weeks: b.gestational_age_weeks ? Number(b.gestational_age_weeks) : null,
        })),
    };
    setBusy(true);
    setErr('');
    try {
      const m = await api.post<Mother>('/api/mothers', body);
      nav(`/mothers/${m.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const inHouse = mothers.filter((m) => m.status === '在住');
  const discharged = mothers.filter((m) => m.status === '已离所');

  return (
    <>
      <div className="page-title">🏠 入住管理</div>

      <div className="card">
        <h3>办理入住</h3>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field"><label>产妇姓名 *</label><input name="name" required /></div>
            <div className="field"><label>年龄</label><input type="number" name="age" min={14} max={60} /></div>
            <div className="field"><label>房间号 *</label><input name="room" required placeholder="如 805" /></div>
            <div className="field">
              <label>入住日期 *</label>
              <input type="date" name="admission_date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="field"><label>预计离所日期</label><input type="date" name="expected_discharge_date" /></div>
            <div className="field"><label>分娩日期 *</label><input type="date" name="delivery_date" required /></div>
            <div className="field">
              <label>分娩方式</label>
              <select name="delivery_type">
                <option>顺产</option>
                <option>剖宫产</option>
                <option>产钳/胎吸助产</option>
              </select>
            </div>
            <div className="field"><label>孕产史</label><input name="parity" placeholder="如 G1P1" /></div>
            <div className="field">
              <label>喂养计划</label>
              <select name="feeding_plan">
                <option>母乳亲喂</option>
                <option>母乳为主</option>
                <option>混合喂养</option>
                <option>配方奶</option>
              </select>
            </div>
            <div className="field"><label>过敏史</label><input name="allergies" placeholder="无则留空" /></div>
            <div className="field full"><label>备注</label><textarea name="notes" /></div>
          </div>

          <h3 style={{ margin: '16px 0 10px' }}>随行宝宝</h3>
          {babies.map((b, i) => (
            <div className="form-grid" key={i} style={{ marginBottom: 10 }}>
              <div className="field"><label>宝宝姓名 *</label><input value={b.name} onChange={(e) => setBaby(i, { name: e.target.value })} /></div>
              <div className="field">
                <label>性别</label>
                <select value={b.sex} onChange={(e) => setBaby(i, { sex: e.target.value })}>
                  <option>女</option>
                  <option>男</option>
                </select>
              </div>
              <div className="field"><label>出生体重（g）</label><input type="number" value={b.birth_weight_g} onChange={(e) => setBaby(i, { birth_weight_g: e.target.value })} /></div>
              <div className="field"><label>孕周</label><input type="number" step="0.5" value={b.gestational_age_weeks} onChange={(e) => setBaby(i, { gestational_age_weeks: e.target.value })} /></div>
            </div>
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => setBabies((bs) => [...bs, emptyBaby()])}>
              ＋ 添加宝宝（双胞胎等）
            </button>
            {babies.length > 1 && (
              <button type="button" className="btn btn-sm" onClick={() => setBabies((bs) => bs.slice(0, -1))}>
                － 移除最后一个
              </button>
            )}
          </div>

          {err && <div className="form-error">{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '提交中…' : '完成入住'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>在住产妇（{inHouse.length}）</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>房间</th><th>姓名</th><th>入住日期</th><th>预计离所</th><th>分娩方式</th><th></th></tr>
            </thead>
            <tbody>
              {inHouse.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge badge-room">{m.room}</span></td>
                  <td>{m.name}</td>
                  <td>{m.admission_date}</td>
                  <td>{m.expected_discharge_date || '—'}</td>
                  <td>{m.delivery_type}</td>
                  <td><Link to={`/mothers/${m.id}`} className="btn btn-sm">查看</Link></td>
                </tr>
              ))}
              {inHouse.length === 0 && <tr><td colSpan={6} className="empty">暂无在住产妇</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {discharged.length > 0 && (
        <div className="card">
          <h3>已离所（{discharged.length}）</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>房间</th><th>姓名</th><th>入住日期</th><th>离所时间</th><th></th></tr>
              </thead>
              <tbody>
                {discharged.map((m) => (
                  <tr key={m.id}>
                    <td>{m.room}</td>
                    <td>{m.name}</td>
                    <td>{m.admission_date}</td>
                    <td>{m.discharged_at?.slice(0, 10) || '—'}</td>
                    <td><Link to={`/mothers/${m.id}`} className="btn btn-sm">查看</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
