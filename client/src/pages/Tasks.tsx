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

// 结构化填写项：每种任务类型对应独立的输入格子，保存时自动合成说明文字。
// short 为合成文字用的中文短名（经 tv() 按界面语言翻译）；labelKey 为格子标题的 i18n 键。
interface FieldDef {
  id: string;
  labelKey: string;
  short: string;
  kind: 'number' | 'select' | 'text';
  unit?: string;
  step?: string;
  options?: string[];
}

const num = (id: string, labelKey: string, short: string, unit: string, step?: string): FieldDef =>
  ({ id, labelKey, short, kind: 'number', unit, step });
const sel = (id: string, labelKey: string, short: string, options: string[]): FieldDef =>
  ({ id, labelKey, short, kind: 'select', options });

const TYPE_FIELDS: Record<string, FieldDef[]> = {
  '体征测量': [
    num('temp', 'vitals.tempC', '体温', '°C', '0.1'),
    num('weight', 'vitals.weightG', '体重', 'g'),
    num('jaundice', 'vitals.jaundiceUnit', '黄疸', 'mg/dL', '0.1'),
    num('hr', 'vitals.heartRateUnit', '心率', 'bpm'),
    num('rr', 'vitals.respUnit', '呼吸', '/min'),
  ],
  '换尿布': [
    sel('dtype', 'diapers.type', '类型', ['小便', '大便', '小便+大便']),
    sel('consistency', 'diapers.consistency', '性状', ['糊状', '稀水样', '颗粒状', '成形']),
    sel('color', 'diapers.stoolColor', '颜色', ['黄色', '黄绿色', '绿色', '墨绿色（胎便）', '灰白色']),
  ],
  '喂奶时间': [
    sel('method', 'feeds.method', '方式', ['母乳亲喂', '瓶喂母乳', '配方奶', '混合喂养']),
    num('amount', 'feeds.amountMl', '奶量', 'ml'),
    num('duration', 'feeds.durationMin', '时长', 'min'),
  ],
  '脚部按摩': [
    sel('side', 'tasks.side', '部位', ['双侧', '左脚', '右脚']),
    num('duration', 'feeds.durationMin', '时长', 'min'),
  ],
  '鼻泪管按摩': [sel('side', 'tasks.side', '部位', ['双侧', '左眼', '右眼'])],
  '晾臀': [num('duration', 'feeds.durationMin', '时长', 'min')],
  '补充剂/用药': [
    sel('med', 'tasks.med', '药品', ['维生素D', '益生菌', '退黄药物', '其他药物']),
    { id: 'dose', labelKey: 'tasks.dose', short: '', kind: 'text' },
  ],
  '母婴同室': [num('duration', 'feeds.durationMin', '时长', 'min')],
  '洗澡记录': [num('watertemp', 'tasks.waterTemp', '水温', '°C', '0.1')],
};

// 根据任务类型与已填内容，生成需要同步写入的护理记录（宝宝详情页可见）。
// 返回 null 表示纯待办任务，不生成记录。
interface SyncInput {
  subjectType: 'mother' | 'baby';
  subjectId: number;
  taskType: string;
  title: string;
  fieldValues: Record<string, string>;
  timeIso: string;
  notes: string;
  recordedBy: string;
  photos?: { data: string; mime: string }[];
}

function buildRecordSync(s: SyncInput): { url: string; payload: Record<string, unknown> } | null {
  const v = (k: string) => (s.fieldValues[k] || '').trim();
  const n = (k: string) => (v(k) ? Number(v(k)) : null);
  const hasAnyField = (TYPE_FIELDS[s.taskType] || []).some((f) => v(f.id));
  const hasContent = hasAnyField || !!s.notes || !!s.photos?.length;
  const common = {
    time: s.timeIso,
    notes: s.notes || null,
    recorded_by: s.recordedBy,
    ...(s.photos ? { photos: s.photos } : {}),
  };

  if (s.subjectType === 'mother') {
    // 产妇仅体征测量同步到查房记录，其余类型保留为任务
    if (s.taskType === '体征测量' && hasAnyField) {
      return {
        url: `/api/mothers/${s.subjectId}/vitals`,
        payload: { ...common, temperature_c: n('temp'), pulse: n('hr') },
      };
    }
    return null;
  }

  if (s.taskType === '体征测量' && hasAnyField) {
    return {
      url: `/api/babies/${s.subjectId}/vitals`,
      payload: {
        ...common,
        temperature_c: n('temp'), weight_g: n('weight'), jaundice_mg_dl: n('jaundice'),
        heart_rate: n('hr'), resp_rate: n('rr'),
      },
    };
  }
  if (s.taskType === '换尿布' && v('dtype')) {
    const typeMap: Record<string, string> = { '小便': '尿', '大便': '便', '小便+大便': '尿+便' };
    return {
      url: `/api/babies/${s.subjectId}/diapers`,
      payload: {
        ...common,
        type: typeMap[v('dtype')] || v('dtype'),
        stool_consistency: v('consistency') || null,
        stool_color: v('color') || null,
      },
    };
  }
  if (s.taskType === '喂奶时间' && v('method')) {
    return {
      url: `/api/babies/${s.subjectId}/feeds`,
      payload: { ...common, method: v('method'), amount_ml: n('amount'), duration_min: n('duration') },
    };
  }
  // 其余类型（洗澡/按摩/晾臀/用药/观察/拍照/自定义等）：有内容时记入护理项目
  if (hasContent) {
    const extraParts: string[] = [];
    for (const f of TYPE_FIELDS[s.taskType] || []) {
      const val = v(f.id);
      if (!val) continue;
      extraParts.push(f.kind === 'number' ? `${f.short} ${val}${f.unit || ''}` : val);
    }
    const notes = [...extraParts, s.notes].filter(Boolean).join('、');
    return {
      url: `/api/babies/${s.subjectId}/cares`,
      payload: { ...common, care_type: s.title, notes: notes || null },
    };
  }
  return null;
}

// 补充标注：不适合做成格子的定性内容，点选追加进说明
const DETAIL_PRESETS: Record<string, string[]> = {
  '护理记录/观察': ['精神状态好', '睡眠安稳', '哭闹较多', '吐奶', '溢奶', '皮肤黄染', '皮疹', '脐部干燥'],
  '换尿布': ['尿布疹', '臀部护理', '涂护臀膏'],
  '体征测量': [],
  '汇总统计': ['今日喂养汇总', '今日大小便汇总', '今日体征汇总'],
  '宝宝拍照': ['日常照', '伤口/皮肤记录', '黄疸对比照'],
  '脚部按摩': [],
  '鼻泪管按摩': ['分泌物增多', '已清洁'],
  '晾臀': ['红臀观察', '涂护臀膏'],
  '补充剂/用药': ['遵医嘱用药'],
  '母婴同室': ['哺乳指导'],
  '喂奶时间': ['拍嗝'],
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
  const [taskType, setTaskTypeState] = useState(TASK_TYPES[0]);
  const [detail, setDetail] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const setTaskType = (type: string) => {
    setTaskTypeState(type);
    setFieldValues({}); // 切换类型清空已填格子
  };

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
    // 已填格子合成说明前缀：数字带短名与单位，下拉直接用选项值，文本原样
    const parts: string[] = [];
    for (const f of TYPE_FIELDS[taskType] || []) {
      const v = (fieldValues[f.id] || '').trim();
      if (!v) continue;
      if (f.kind === 'number') parts.push(`${tv(f.short)} ${v}${f.unit || ''}`);
      else if (f.kind === 'select') parts.push(tv(v));
      else parts.push(v);
    }
    const combinedDetail = [...parts, detail.trim()].filter(Boolean).join('、');

    const subjectId = Number(fd.get('subject_id'));
    const timeIso = new Date(String(fd.get('due_time'))).toISOString();
    const title = taskType === '其他' ? String(fd.get('title')) : taskType;
    const photoPayload = photos.length ? photos.map((p) => ({ data: p.data, mime: p.mime })) : undefined;

    // 同步计划：填了数据时，同时写入对应的护理记录表（宝宝详情页可见），
    // 照片挂在记录上；纯待办（什么都没填）只建任务
    const recordSync = buildRecordSync({
      subjectType, subjectId, taskType, title, fieldValues, timeIso,
      notes: detail.trim(), recordedBy: createdBy, photos: photoPayload,
    });

    const body: Record<string, unknown> = {
      subject_type: subjectType,
      subject_id: subjectId,
      title,
      detail: combinedDetail || null,
      due_time: timeIso,
      created_by: createdBy,
    };
    // 有同步记录时照片挂记录；否则挂任务
    if (photoPayload && !recordSync) body.photos = photoPayload;

    setBusy(true);
    setErr('');
    try {
      await api.post('/api/tasks', body);
      if (recordSync) await api.post(recordSync.url, recordSync.payload);
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
          {(TYPE_FIELDS[taskType] || []).map((f) => (
            <div className="field" key={f.id}>
              <label>{t(f.labelKey)}</label>
              {f.kind === 'select' ? (
                <select
                  value={fieldValues[f.id] || ''}
                  onChange={(e) => setFieldValues((fv) => ({ ...fv, [f.id]: e.target.value }))}
                >
                  <option value="">—</option>
                  {f.options!.map((o) => (
                    <option key={o} value={o}>{tv(o)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  step={f.step}
                  placeholder={f.unit || ''}
                  value={fieldValues[f.id] || ''}
                  onChange={(e) => setFieldValues((fv) => ({ ...fv, [f.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
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
