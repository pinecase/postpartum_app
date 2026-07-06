import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtTime, dayOfLife, Overview } from '../api';
import { useI18n } from '../i18n';
import { useStaff } from '../StaffContext';

// 距上次喂养的计时环：<2h 绿色，2-3h 琥珀，>3h 红色
function FeedRing({ lastFeedTime, label }: { lastFeedTime: string | null; label: string }) {
  const minutes = lastFeedTime
    ? Math.max(0, Math.floor((Date.now() - new Date(lastFeedTime).getTime()) / 60000))
    : null;
  const frac = minutes == null ? 1 : Math.min(1, minutes / 240);
  const color = minutes == null || minutes >= 180 ? 'var(--danger)' : minutes >= 120 ? 'var(--warning)' : 'var(--brand)';
  const text =
    minutes == null ? '—' : minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes}'`;
  const R = 24;
  const C = 2 * Math.PI * R;
  return (
    <div className="feed-ring">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle cx="29" cy="29" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="29" cy="29" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${C * frac} ${C}`}
        />
      </svg>
      <div className="ring-text" style={{ color }}>
        {text}
        <small>{label}</small>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, tv } = useI18n();
  const { current } = useStaff();
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

  const allBabies = data.rooms.flatMap((r) => r.babies);
  const feedsToday = allBabies.reduce((s, b) => s + b.feeds_today, 0);
  const milkToday = allBabies.reduce((s, b) => s + (b.milk_today || 0), 0);
  const diapersToday = allBabies.reduce((s, b) => s + b.diapers_today, 0);
  const today = new Date();

  return (
    <>
      <div className="hero">
        <div className="hero-sub">
          {today.getMonth() + 1}/{today.getDate()} · {current}
        </div>
        <h2>{t('dash.hero')}</h2>
        <div className="hero-stats">
          <div>
            <div className="num">{data.stats.babies_in_house}</div>
            <div className="label">{t('dash.inHouse')}</div>
          </div>
          <div>
            <div className="num">{feedsToday}</div>
            <div className="label">{t('dash.feedsToday')}</div>
          </div>
          <div>
            <div className="num">{milkToday}</div>
            <div className="label">{t('dash.milkToday')}</div>
          </div>
          <div>
            <div className="num">{diapersToday}</div>
            <div className="label">{t('dash.diapersToday')}</div>
          </div>
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
                  <FeedRing lastFeedTime={b.last_feed?.time ?? null} label={t('dash.sinceFeed')} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <span className="badge badge-baby">{t('common.baby')}</span>{' '}
                      <span className="name">{b.name}</span>
                    </div>
                    <span className="meta">
                      {t('overview.lifeDay', { n: dayOfLife(b.birth_date) })} ·{' '}
                      {t('overview.feedsToday', { n: b.feeds_today })} ·{' '}
                      {t('overview.diapersToday', { n: b.diapers_today })}
                      {b.last_feed && ` · ${t('overview.lastFeed', { t: fmtTime(b.last_feed.time) })}`}
                    </span>
                  </div>
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
              <span className="title">{tv(tk.title)}</span>
              {tk.detail && <span className="meta">{tk.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
