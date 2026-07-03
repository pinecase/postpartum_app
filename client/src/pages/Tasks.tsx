import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtTime, localDatetimeValue, CareTask, Mother, Baby } from '../api';
import { useStaff } from '../StaffContext';
import Modal from '../components/Modal';

export default function Tasks() {
  const { current } = useStaff();
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [filter, setFilter] = useState<'待办' | '已完成' | '全部'>('待办');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    const q = filter === '全部' ? '' : `?status=${encodeURIComponent(filter)}`;
    api.get<CareTask[]>(`/api/tasks${q}`).then(setTasks);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (t: CareTask) => {
    await api.patch(`/api/tasks/${t.id}`, { status: '已完成', completed_by: current });
    load();
  };

  return (
    <>
      <div className="page-title">📋 护理任务</div>
      <div className="card">
        <div className="tabs">
          {(['待办', '已完成', '全部'] as const).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
          <button
            className="active"
            style={{ marginLeft: 'auto', background: 'var(--pink)', borderColor: 'var(--pink)' }}
            onClick={() => setShowForm(true)}
          >
            ＋ 新建任务
          </button>
        </div>

        {tasks.map((t) => (
          <div className="task-item" key={t.id}>
            <span className={`badge ${t.status === '已完成' ? 'badge-done' : 'badge-warning'}`}>
              {t.status === '已完成' ? '已完成' : fmtTime(t.due_time)}
            </span>
            <span className="badge badge-room">{t.room}</span>
            <Link to={t.subject_type === 'baby' ? `/babies/${t.subject_id}` : `/mothers/${t.subject_id}`}>
              <span className={`badge ${t.subject_type === 'baby' ? 'badge-baby' : 'badge-mother'}`}>
                {t.subject_name}
              </span>
            </Link>
            <span className="title">{t.title}</span>
            {t.detail && <span className="meta">{t.detail}</span>}
            <span className="spacer" />
            {t.status === '已完成' ? (
              <span className="meta">
                {t.completed_by} · {fmtTime(t.completed_at)}
              </span>
            ) : (
              <button className="btn btn-sm" onClick={() => complete(t)}>✓ 完成</button>
            )}
          </div>
        ))}
        {tasks.length === 0 && <div className="empty">暂无任务</div>}
      </div>

      {showForm && (
        <TaskModal
          createdBy={current}
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

function TaskModal({
  createdBy, onClose, onSaved,
}: {
  createdBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mothers, setMothers] = useState<Mother[]>([]);
  const [babies, setBabies] = useState<(Baby & { mother_name?: string })[]>([]);
  const [subjectType, setSubjectType] = useState<'mother' | 'baby'>('baby');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Mother[]>('/api/mothers?status=在住').then(async (ms) => {
      setMothers(ms);
      const all: Baby[] = [];
      for (const m of ms) {
        const detail = await api.get<Mother & { babies: Baby[] }>(`/api/mothers/${m.id}`);
        all.push(...detail.babies.filter((b) => b.status === '在住'));
      }
      setBabies(all);
    });
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      subject_type: subjectType,
      subject_id: Number(fd.get('subject_id')),
      title: fd.get('title'),
      detail: fd.get('detail') || null,
      due_time: new Date(String(fd.get('due_time'))).toISOString(),
      created_by: createdBy,
    };
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/tasks', body);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="新建护理任务" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>对象类型</label>
            <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as 'mother' | 'baby')}>
              <option value="baby">宝宝</option>
              <option value="mother">产妇</option>
            </select>
          </div>
          <div className="field">
            <label>对象 *</label>
            <select name="subject_id" required>
              {(subjectType === 'baby' ? babies : mothers).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>计划时间 *</label>
            <input type="datetime-local" name="due_time" defaultValue={localDatetimeValue()} required />
          </div>
          <div className="field full"><label>任务标题 *</label><input name="title" required placeholder="如：复测黄疸" /></div>
          <div className="field full"><label>说明</label><textarea name="detail" /></div>
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
