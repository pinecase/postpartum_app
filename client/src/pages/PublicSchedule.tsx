import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apptTimeRange, Appointment } from '../api';
import { useI18n } from '../i18n';

interface ScheduleData {
  mother: { name: string; room: string };
  appointments: Appointment[];
}

// 妈妈专属只读日程页：凭分享链接访问，无需登录，不显示任何其他母婴数据
export default function PublicSchedule() {
  const { token } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/schedule/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'error');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  if (error) return <div className="sched-page"><div className="card empty">{t('sched.invalid')}</div></div>;
  if (!data) return <div className="sched-page"><div className="empty">{t('common.loading')}</div></div>;

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = data.appointments.filter((a) => a.status === '待办' && a.date >= todayStr);
  const past = data.appointments.filter((a) => a.status !== '待办' || a.date < todayStr);

  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  };

  return (
    <div className="sched-page">
      <div className="sched-hero">
        <div className="sched-icon">🌸</div>
        <h2>{t('sched.title', { name: data.mother.name })}</h2>
        <div className="meta">{data.mother.room} {t('overview.roomSuffix')}</div>
      </div>

      <div className="card">
        <h3>{t('sched.upcoming')}</h3>
        {upcoming.map((a) => (
          <div className="task-item" key={a.id}>
            <span className={`badge ${a.date === todayStr ? 'badge-warning' : 'badge-info'}`}>
              {a.date === todayStr ? t('appt.today2') : fmtDate(a.date)} {apptTimeRange(a)}
            </span>
            <span className="title">{a.title}</span>
            {a.notes && <span className="meta">{a.notes}</span>}
          </div>
        ))}
        {upcoming.length === 0 && <div className="empty">{t('sched.none')}</div>}
      </div>

      {past.length > 0 && (
        <div className="card">
          <h3>{t('sched.past')}</h3>
          {past.slice(-30).reverse().map((a) => (
            <div className="task-item" key={a.id} style={{ opacity: 0.6 }}>
              <span className="badge badge-done">{fmtDate(a.date)} {apptTimeRange(a)}</span>
              <span className="title" style={{ textDecoration: a.status === '已完成' ? 'line-through' : 'none' }}>
                {a.title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="sched-foot meta">{t('sched.foot')}</div>
    </div>
  );
}
