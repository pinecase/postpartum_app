import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtTime, dayOfLife, Overview } from '../api';
import { useI18n } from '../i18n';

export default function Dashboard() {
  const { t, tv } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  const load = () => api.get<Overview>('/api/overview').then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <div className="card">{t('common.loadFailed')}：{error}</div>;
  if (!data) return <div className="empty">{t('common.loading')}</div>;

  return (
    <>
      <div className="grid grid-stats">
        <div className="stat">
          <div className="num">{data.stats.mothers_in_house}</div>
          <div className="label">{t('stats.mothersInHouse')}</div>
        </div>
        <div className="stat">
          <div className="num">{data.stats.babies_in_house}</div>
          <div className="label">{t('stats.babiesInHouse')}</div>
        </div>
        <div className="stat">
          <div className="num">{data.alerts.filter((a) => a.level === 'danger').length}</div>
          <div className="label">{t('stats.dangerAlerts')}</div>
        </div>
        <div className="stat">
          <div className="num">{data.stats.pending_task_count}</div>
          <div className="label">{t('stats.pendingTasks')}</div>
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div className="card">
          <h3>{t('overview.alerts')}</h3>
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
                <span>{a.code ? t(`alert.${a.code}`, a.params) : a.message}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-rooms">
        {data.rooms.map(({ mother, babies }) => (
          <div className="card room-card" key={mother.id}>
            <h3>
              <span className="badge badge-room">
                {mother.room} {t('overview.roomSuffix')}
              </span>
              <span className="meta">
                {t('overview.admitted')} {mother.admission_date} · {tv(mother.delivery_type)}
              </span>
            </h3>
            <Link to={`/mothers/${mother.id}`}>
              <div className="mother-row">
                <span className="badge badge-mother">{t('common.mother')}</span>
                <span className="name">{mother.name}</span>
                <span className="meta">
                  {t('overview.postpartumDay', { n: dayOfLife(mother.delivery_date) })}
                  {mother.latest_vital?.temperature_c != null &&
                    ` · ${t('overview.temp')} ${mother.latest_vital.temperature_c}°C`}
                  {mother.latest_vital?.systolic != null &&
                    ` · ${t('overview.bp')} ${mother.latest_vital.systolic}/${mother.latest_vital.diastolic}`}
                </span>
              </div>
            </Link>
            {babies.map((b) => (
              <Link to={`/babies/${b.id}`} key={b.id}>
                <div className="baby-row">
                  <span className="badge badge-baby">{t('common.baby')}</span>
                  <span className="name">{b.name}</span>
                  <span className="meta">
                    {t('overview.lifeDay', { n: dayOfLife(b.birth_date) })} ·{' '}
                    {t('overview.feedsToday', { n: b.feeds_today })} ·{' '}
                    {t('overview.diapersToday', { n: b.diapers_today })}
                    {b.last_feed && ` · ${t('overview.lastFeed', { t: fmtTime(b.last_feed.time) })}`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))}
        {data.rooms.length === 0 && (
          <div className="card empty">
            <Link to="/admission">{t('overview.noResidents')}</Link>
          </div>
        )}
      </div>

      {data.pending_tasks.length > 0 && (
        <div className="card">
          <h3>
            {t('overview.recentTasks')}
            <Link to="/tasks" className="meta">
              <span className="btn btn-sm">{t('overview.allTasks')}</span>
            </Link>
          </h3>
          {data.pending_tasks.slice(0, 6).map((tk) => (
            <div className="task-item" key={tk.id}>
              <span className="badge badge-warning">{fmtTime(tk.due_time)}</span>
              <span className="title">{tk.title}</span>
              {tk.detail && <span className="meta">{tk.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
