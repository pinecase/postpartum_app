import { FormEvent, useEffect, useState } from 'react';
import { api, fmtTime, Handover as HandoverType } from '../api';
import { useStaff } from '../StaffContext';

export default function Handover() {
  const { current } = useStaff();
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
      <div className="page-title">🔄 交接班记录</div>

      <div className="card">
        <h3>写交接班</h3>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>日期</label>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="field">
              <label>班次</label>
              <select name="shift" required>
                <option>白班</option>
                <option>夜班</option>
              </select>
            </div>
            <div className="field">
              <label>记录人</label>
              <input value={current} readOnly />
            </div>
            <div className="field full">
              <label>交接内容 *</label>
              <textarea
                name="content"
                required
                rows={4}
                placeholder="记录本班母婴情况、异常事项、需下一班关注的重点…"
              />
            </div>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '提交中…' : '提交交接班'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>历史记录</h3>
        {items.map((h) => (
          <div className="handover-item" key={h.id}>
            <div className="head">
              <span className="badge badge-room">{h.date}</span>
              <span className={`badge ${h.shift === '夜班' ? 'badge-info' : 'badge-warning'}`}>{h.shift}</span>
              <span>{h.author}</span>
              <span>· 提交于 {fmtTime(h.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{h.content}</div>
          </div>
        ))}
        {items.length === 0 && <div className="empty">暂无交接班记录</div>}
      </div>
    </>
  );
}
