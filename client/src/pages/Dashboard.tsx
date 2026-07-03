import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtTime, dayOfLife, Overview } from '../api';

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  const load = () => api.get<Overview>('/api/overview').then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <div className="card">加载失败：{error}</div>;
  if (!data) return <div className="empty">加载中…</div>;

  return (
    <>
      <div className="grid grid-stats">
        <div className="stat">
          <div className="num">{data.stats.mothers_in_house}</div>
          <div className="label">在住产妇</div>
        </div>
        <div className="stat">
          <div className="num">{data.stats.babies_in_house}</div>
          <div className="label">在住宝宝</div>
        </div>
        <div className="stat">
          <div className="num">{data.alerts.filter((a) => a.level === 'danger').length}</div>
          <div className="label">高危预警</div>
        </div>
        <div className="stat">
          <div className="num">{data.stats.pending_task_count}</div>
          <div className="label">待办任务</div>
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div className="card">
          <h3>⚠️ 异常预警</h3>
          {data.alerts.map((a, i) => (
            <Link
              key={i}
              to={a.subject_type === 'baby' ? `/babies/${a.subject_id}` : `/mothers/${a.subject_id}`}
            >
              <div className={`alert-item ${a.level}`}>
                <span className="badge badge-room">{a.room}</span>
                <span className="who">
                  {a.subject_type === 'baby' ? '👶' : '🤱'} {a.subject_name}
                </span>
                <span>{a.message}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-rooms">
        {data.rooms.map(({ mother, babies }) => (
          <div className="card room-card" key={mother.id}>
            <h3>
              <span className="badge badge-room">{mother.room} 房</span>
              <span className="meta">
                入住 {mother.admission_date} · {mother.delivery_type}
              </span>
            </h3>
            <Link to={`/mothers/${mother.id}`}>
              <div className="mother-row">
                <span className="badge badge-mother">产妇</span>
                <span className="name">{mother.name}</span>
                <span className="meta">
                  产后第 {dayOfLife(mother.delivery_date)} 天
                  {mother.latest_vital?.temperature_c != null &&
                    ` · 体温 ${mother.latest_vital.temperature_c}°C`}
                  {mother.latest_vital?.systolic != null &&
                    ` · 血压 ${mother.latest_vital.systolic}/${mother.latest_vital.diastolic}`}
                </span>
              </div>
            </Link>
            {babies.map((b) => (
              <Link to={`/babies/${b.id}`} key={b.id}>
                <div className="baby-row">
                  <span className="badge badge-baby">宝宝</span>
                  <span className="name">{b.name}</span>
                  <span className="meta">
                    第 {dayOfLife(b.birth_date)} 天 · 今日喂养 {b.feeds_today} 次 · 尿布{' '}
                    {b.diapers_today} 次
                    {b.last_feed && ` · 上次喂 ${fmtTime(b.last_feed.time)}`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))}
        {data.rooms.length === 0 && (
          <div className="card empty">
            暂无在住母婴，请前往 <Link to="/admission">入住管理</Link> 办理入住
          </div>
        )}
      </div>

      {data.pending_tasks.length > 0 && (
        <div className="card">
          <h3>
            📋 近期待办
            <Link to="/tasks" className="meta">
              <span className="btn btn-sm">全部任务</span>
            </Link>
          </h3>
          {data.pending_tasks.slice(0, 6).map((t) => (
            <div className="task-item" key={t.id}>
              <span className="badge badge-warning">{fmtTime(t.due_time)}</span>
              <span className="title">{t.title}</span>
              {t.detail && <span className="meta">{t.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
