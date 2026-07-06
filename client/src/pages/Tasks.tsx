import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtTime, localDatetimeValue, CareTask, Mother, Baby } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';
import Modal from '../components/Modal';
import PhotoInput, { PhotoDraft } from '../components/PhotoInput';
import { PhotoBadge } from '../components/PhotoViewer';
import VoiceInput from '../components/VoiceInput';

const FILTERS = ['待办', '已完成', '全部'] as const;
type Filter = (typeof FILTERS)[number];

// 任务类型下拉选项（中文为存储值，显示时按语言翻译）；「其他」时手动输入标题
const TASK_TYPES = [
  '护理记录/观察', '换尿布', '体征测量', '汇总统计', '宝宝拍照', '脚部按摩',
  '鼻泪管按摩', '晾臀', '补充剂/用药', '母婴同室', '喂奶时间', '洗澡记录', '其他',
];

// 每种任务类型的常用细节，点选后填入说明，免去手动输入
const DETAIL_PRESETS: Record<string, string[]> = {
  '护理记录/观察': ['精神状态好', '睡眠安稳', '哭闹较多', '吐奶', '溢奶', '皮肤黄染', '皮疹', '脐部干燥'],
  '换尿布': ['小便', '大便·糊状', '大便·稀', '尿布疹', '臀部护理', '涂护臀膏'],
  '体征测量': ['体温', '体重', '黄疸', '心率', '呼吸'],
  '汇总统计': ['今日喂养汇总', '今日大小便汇总', '今日体征汇总'],
  '宝宝拍照': ['日常照', '伤口/皮肤记录', '黄疸对比照'],
  '脚部按摩': ['双侧', '左脚', '右脚', '10 分钟', '15 分钟'],
  '鼻泪管按摩': ['双侧', '左眼', '右眼', '分泌物增多', '已清洁'],
  '晾臀': ['10 分钟', '15 分钟', '红臀观察', '涂护臀膏'],
  '补充剂/用药': ['维生素D', '益生菌', '退黄药物', '遵医嘱用药'],
  '母婴同室': ['30 分钟', '1 小时', '2 小时', '哺乳指导'],
  '喂奶时间': ['母乳亲喂', '瓶喂母乳', '配方奶', '拍嗝', '奶量记录'],
  '洗澡记录': ['洗澡', '抚触', '脐部护理', '游泳'],
  '其他': [],
};

export default function Tasks() {
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [filter, setFilter] = useState<Filter>('待办');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    const q = filter === '全部' ? '' : `?status=${encodeURIComponent(filter)}`;
    api.get<CareTask[]>(`/api/tasks${q}`).then(setTasks);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (tk: CareTask) => {
    await api.patch(`/api/tasks/${tk.id}`, { status: '已完成', completed_by: current });
    load();
  };

  const filterLabel: Record<Filter, string> = {
    '待办': t('tasks.pending'),
    '已完成': t('tasks.done'),
    '全部': t('tasks.all'),
  };

  return (
    <>
      <div className="page-title">{t('tasks.title')}</div>
      <div className="card">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {filterLabel[f]}
            </button>
          ))}
          <button
            className="active"
            style={{ marginLeft: 'auto', background: 'var(--pink)', borderColor: 'var(--pink)' }}
            onClick={() => setShowForm(true)}
          >
            {t('tasks.new')}
          </button>
        </div>

        {tasks.map((tk) => (
          <div className="task-item" key={tk.id}>
            <span className={`badge ${tk.status === '已完成' ? 'badge-done' : 'badge-warning'}`}>
              {tk.status === '已完成' ? t('tasks.done') : fmtTime(tk.due_time)}
            </span>
            <span className="badge badge-room">{tk.room}</span>
            <Link to={tk.subject_type === 'baby' ? `/babies/${tk.subject_id}` : `/mothers/${tk.subject_id}`}>
              <span className={`badge ${tk.subject_type === 'baby' ? 'badge-baby' : 'badge-mother'}`}>
                {tk.subject_name}
              </span>
            </Link>
            <span className="title">{tv(tk.title)}</span>
            {tk.detail && <span className="meta">{tk.detail}</span>}
            {tk.photos && tk.photos.length > 0 && <PhotoBadge refs={tk.photos} />}
            <span className="spacer" />
            {tk.status === '已完成' ? (
              <span className="meta">
                {tk.completed_by} · {fmtTime(tk.completed_at)}
              </span>
            ) : (
              <button className="btn btn-sm" onClick={() => complete(tk)}>{t('tasks.complete')}</button>
            )}
          </div>
        ))}
        {tasks.length === 0 && <div className="empty">{t('tasks.empty')}</div>}
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
  const { t, tv } = useI18n();
  const [mothers, setMothers] = useState<Mother[]>([]);
  const [babies, setBabies] = useState<(Baby & { mother_name?: string })[]>([]);
  const [subjectType, setSubjectType] = useState<'mother' | 'baby'>('baby');
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [detail, setDetail] = useState('');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // 点选快捷项：已存在则移除，不存在则追加到说明
  const toggleChip = (chipText: string) => {
    setDetail((d) => {
      if (d.includes(chipText)) {
        return d
          .split('、')
          .filter((part) => part.trim() !== chipText)
          .join('、');
      }
      return d ? `${d}、${chipText}` : chipText;
    });
  };

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
      title: taskType === '其他' ? fd.get('title') : taskType,
      detail: detail.trim() || null,
      due_time: new Date(String(fd.get('due_time'))).toISOString(),
      created_by: createdBy,
    };
    if (photos.length) body.photos = photos.map((p) => ({ data: p.data, mime: p.mime }));
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
    <Modal title={t('modal.newTask')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('tasks.subjectType')}</label>
            <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as 'mother' | 'baby')}>
              <option value="baby">{t('common.baby')}</option>
              <option value="mother">{t('common.mother')}</option>
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.subject')}</label>
            <select name="subject_id" required>
              {(subjectType === 'baby' ? babies : mothers).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('tasks.dueTime')}</label>
            <input type="datetime-local" name="due_time" defaultValue={localDatetimeValue()} required />
          </div>
          <div className="field full">
            <label>{t('tasks.taskTitle')}</label>
            <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
              {TASK_TYPES.map((v) => (
                <option key={v} value={v}>{tv(v)}</option>
              ))}
            </select>
          </div>
          {taskType === '其他' && (
            <div className="field full">
              <label>{t('tasks.taskTitle')}</label>
              <input name="title" required placeholder={t('tasks.titlePlaceholder')} />
            </div>
          )}
          {DETAIL_PRESETS[taskType]?.length > 0 && (
            <div className="field full">
              <label>{t('tasks.quickDetail')}</label>
              <div className="chip-row">
                {DETAIL_PRESETS[taskType].map((chip) => (
                  <button
                    type="button"
                    key={chip}
                    className={`chip ${detail.includes(chip) ? 'on' : ''}`}
                    onClick={() => toggleChip(chip)}
                  >
                    {tv(chip)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field full">
            <label>{t('tasks.detail')}</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
            <VoiceInput onText={(text) => setDetail((d) => (d ? `${d} ${text}` : text))} />
          </div>
          <div className="field full">
            <label>{t('photo.photos')}</label>
            <PhotoInput photos={photos} onChange={setPhotos} />
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
