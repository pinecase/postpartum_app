import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtTime, CareTask, Mother, Baby, BabyDetailData } from '../api';
import { useStaff } from '../StaffContext';
import { useI18n } from '../i18n';
import Modal from '../components/Modal';
import PhotoInput, { PhotoDraft } from '../components/PhotoInput';
import { PhotoBadge } from '../components/PhotoViewer';
import VoiceInput from '../components/VoiceInput';

const FILTERS = ['待办', '已完成', '全部'] as const;
type Filter = (typeof FILTERS)[number];

// 任务类型（中文为存储值，显示时按语言翻译）；「其他」时手动输入标题
const TASK_TYPES = [
  '喂奶时间', '换尿布', '体征测量', '洗澡记录', '晾臀', '母婴同室',
  '脚部按摩', '鼻泪管按摩', '补充剂/用药', '护理记录/观察', '汇总统计', '宝宝拍照', '其他',
];

// 结构化填写项。short 为合成文字用的中文短名（经 tv() 翻译）；
// showIf 控制字段随其它选择动态显示（如亲喂才出现哺乳侧）。
interface FieldDef {
  id: string;
  labelKey: string;
  short: string;
  kind: 'number' | 'select' | 'text' | 'time';
  unit?: string;
  step?: string;
  options?: string[];
  showIf?: (fv: Record<string, string>) => boolean;
}

const num = (id: string, labelKey: string, short: string, unit: string, step?: string, showIf?: FieldDef['showIf']): FieldDef =>
  ({ id, labelKey, short, kind: 'number', unit, step, showIf });
const sel = (id: string, labelKey: string, short: string, options: string[], showIf?: FieldDef['showIf']): FieldDef =>
  ({ id, labelKey, short, kind: 'select', options, showIf });
const tim = (id: string, labelKey: string, short: string): FieldDef =>
  ({ id, labelKey, short, kind: 'time' });

const isBF = (fv: Record<string, string>) => fv.method === '母乳亲喂';
const isMixed = (fv: Record<string, string>) => fv.method === '混合喂养';
const isBottle = (fv: Record<string, string>) => fv.method === '瓶喂母乳' || fv.method === '配方奶';
const hasStool = (fv: Record<string, string>) => !!fv.stool && fv.stool !== '无';

const URINE_STOOL: FieldDef[] = [
  sel('urine', 'tasks.urineAmt', '小便量', ['无', '少', '中', '多']),
  sel('stool', 'tasks.stoolAmt', '大便量', ['无', '少', '中', '多']),
];

const CLEAN_OPTS = ['已清洁', '有分泌物', '红肿'];

const TYPE_FIELDS: Record<string, FieldDef[]> = {
  '喂奶时间': [
    sel('method', 'feeds.method', '方式', ['母乳亲喂', '瓶喂母乳', '配方奶', '混合喂养']),
    sel('side', 'tasks.sideBreast', '哺乳侧', ['左', '右', '双侧'], isBF),
    sel('position', 'tasks.position', '姿势', ['摇篮式', '橄榄球式', '侧躺式', '半躺式'], isBF),
    num('duration', 'feeds.durationMin', '时长', 'min', undefined, isBF),
    num('bm', 'tasks.bmMl', '母乳', 'ml', undefined, isMixed),
    num('fm', 'tasks.fmMl', '配方奶', 'ml', undefined, isMixed),
    num('amount', 'feeds.amountMl', '奶量', 'ml', undefined, isBottle),
    ...URINE_STOOL,
  ],
  '换尿布': [
    ...URINE_STOOL,
    sel('consistency', 'diapers.consistency', '性状', ['正常', '偏硬', '水样', '成形', '有异味'], hasStool),
    sel('color', 'diapers.stoolColor', '颜色', ['黄色', '黄绿色', '绿色', '墨绿色（胎便）', '灰白色'], hasStool),
  ],
  '体征测量': [
    num('hr', 'vitals.heartRateUnit', '心率', 'bpm'),
    num('rr', 'vitals.respUnit', '呼吸', '/min'),
    num('spo2', 'tasks.spo2', 'SpO₂', '%'),
  ],
  // 洗澡：与 mother care 一致的结构化护理清单
  '洗澡记录': [
    num('weight', 'vitals.weightG', '体重', 'g'),
    num('jaundice', 'vitals.jaundiceUnit', '黄疸', 'mg/dL', '0.1'),
    sel('oral', 'tasks.oral', '口腔', CLEAN_OPTS),
    sel('nasal', 'tasks.nasal', '鼻腔', CLEAN_OPTS),
    sel('eye', 'tasks.eye', '眼部', CLEAN_OPTS),
    sel('ear', 'tasks.ear', '耳部', CLEAN_OPTS),
    sel('cord', 'tasks.cord', '脐部', ['干燥正常', '红肿', '渗液', '已消毒']),
  ],
  '晾臀': [tim('start', 'tasks.startTime', '开始'), tim('end', 'tasks.endTime', '结束')],
  '母婴同室': [sel('inout', 'tasks.inout', '入/出', ['入室', '出室']), ...URINE_STOOL],
};

// 洗澡清单类字段：合成文字时带上部位名（如「口腔·已清洁」）
const LABELED_FIELDS = new Set(['oral', 'nasal', 'eye', 'ear', 'cord']);
const labelWord: Record<string, string> = { oral: '口腔', nasal: '鼻腔', eye: '眼部', ear: '耳部', cord: '脐部' };

// 补充标注：定性内容点选填入说明
const DETAIL_PRESETS: Record<string, string[]> = {
  '喂奶时间': ['拍嗝', '吐奶', '溢奶', '腹部按摩'],
  '换尿布': ['晾臀', '尿布疹', '涂护臀膏', '吐奶'],
  '体征测量': [],
  '洗澡记录': ['吐奶', '腹部按摩', 'Jaundice Bath', 'JYH Bath', 'Beauty Bath', 'Bath Class'],
  '晾臀': ['红臀观察', '涂护臀膏'],
  '母婴同室': ['Review', '协助亲喂', '瓶喂 1 set', '换尿布 1 set', '哄睡教学', '办护照', 'SG Baby', 'Prayer', '吐奶'],
  '脚部按摩': ['已完成'],
  '鼻泪管按摩': ['已完成', '分泌物增多', '已清洁'],
  '补充剂/用药': ['维生素D', '益生菌', '退黄药物', '遵医嘱用药'],
  '护理记录/观察': [], // Nurse note：只用内部备注，不写档案
  '汇总统计': [],
  '宝宝拍照': ['日常照', '伤口/皮肤记录', '黄疸对比照'],
  '其他': [],
};

// 根据任务类型与已填内容生成需同步写入的护理记录（可多条）。
export interface SyncInput {
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

export function buildRecordSyncs(s: SyncInput): { url: string; payload: Record<string, unknown> }[] {
  const v = (k: string) => (s.fieldValues[k] || '').trim();
  const n = (k: string) => (v(k) ? Number(v(k)) : null);
  const visible = (TYPE_FIELDS[s.taskType] || []).filter((f) => !f.showIf || f.showIf(s.fieldValues));
  const hasAnyField = visible.some((f) => v(f.id) && v(f.id) !== '无');
  const hasContent = hasAnyField || !!s.notes || !!s.photos?.length;
  const base = { time: s.timeIso, recorded_by: s.recordedBy };
  const out: { url: string; payload: Record<string, unknown> }[] = [];

  // Nurse note（护理记录/观察）：仅内部备注，不写入档案
  if (s.taskType === '护理记录/观察') return out;

  if (s.subjectType === 'mother') {
    if (s.taskType === '体征测量' && hasAnyField) {
      out.push({
        url: `/api/mothers/${s.subjectId}/vitals`,
        payload: { ...base, pulse: n('hr'), notes: s.notes || null, ...(s.photos ? { photos: s.photos } : {}) },
      });
    }
    return out;
  }

  const B = (p: string) => `/api/babies/${s.subjectId}/${p}`;

  // 小便/大便量下拉（喂奶/母婴同室/换尿布共用）→ 大小便记录
  const pushDiaperFromAmounts = (withStoolDetail: boolean) => {
    const urine = v('urine') && v('urine') !== '无';
    const stool = hasStool(s.fieldValues);
    if (!urine && !stool) return;
    const amt: string[] = [];
    if (urine) amt.push(`小便·${v('urine')}`);
    if (stool) amt.push(`大便·${v('stool')}`);
    out.push({
      url: B('diapers'),
      payload: {
        ...base,
        type: urine && stool ? '尿+便' : urine ? '尿' : '便',
        stool_consistency: withStoolDetail && stool ? v('consistency') || null : null,
        stool_color: withStoolDetail && stool ? v('color') || null : null,
        notes: amt.join('、') || null,
      },
    });
  };

  if (s.taskType === '喂奶时间' && v('method')) {
    const extra: string[] = [];
    if (v('side')) extra.push(v('side'));
    if (v('position')) extra.push(v('position'));
    if (v('bm')) extra.push(`母乳 ${v('bm')}ml`);
    if (v('fm')) extra.push(`配方奶 ${v('fm')}ml`);
    const amount = v('method') === '混合喂养'
      ? (Number(v('bm') || 0) + Number(v('fm') || 0)) || null
      : n('amount');
    out.push({
      url: B('feeds'),
      payload: {
        ...base, method: v('method'), amount_ml: amount, duration_min: n('duration'),
        notes: [...extra, s.notes].filter(Boolean).join('、') || null,
      },
    });
    pushDiaperFromAmounts(false);
  } else if (s.taskType === '换尿布') {
    pushDiaperFromAmounts(true);
  } else if (s.taskType === '母婴同室' && hasContent) {
    const inout = v('inout') ? [v('inout')] : [];
    out.push({
      url: B('cares'),
      payload: { ...base, care_type: s.title, notes: [...inout, s.notes].filter(Boolean).join('、') || null },
    });
    pushDiaperFromAmounts(false);
  } else if (s.taskType === '体征测量' && hasAnyField) {
    out.push({
      url: B('vitals'),
      payload: { ...base, heart_rate: n('hr'), resp_rate: n('rr'), spo2: n('spo2'), notes: s.notes || null },
    });
  } else if (s.taskType === '洗澡记录' && hasContent) {
    const checklist: string[] = [];
    for (const id of ['oral', 'nasal', 'eye', 'ear', 'cord']) {
      if (v(id)) checklist.push(`${labelWord[id]}·${v(id)}`);
    }
    out.push({
      url: B('cares'),
      payload: { ...base, care_type: s.title, notes: [...checklist, s.notes].filter(Boolean).join('、') || null },
    });
    if (v('weight') || v('jaundice')) {
      out.push({ url: B('vitals'), payload: { ...base, weight_g: n('weight'), jaundice_mg_dl: n('jaundice') } });
    }
  } else if (hasContent) {
    const extraParts: string[] = [];
    for (const f of visible) {
      const val = v(f.id);
      if (!val || val === '无') continue;
      if (f.kind === 'number') extraParts.push(`${f.short} ${val}${f.unit || ''}`);
      else if (f.kind === 'time') extraParts.push(`${f.short} ${val}`);
      else if (LABELED_FIELDS.has(f.id)) extraParts.push(`${labelWord[f.id]}·${val}`);
      else extraParts.push(val);
    }
    out.push({
      url: B('cares'),
      payload: { ...base, care_type: s.title, notes: [...extraParts, s.notes].filter(Boolean).join('、') || null },
    });
  }

  if (out.length && s.photos) out[0].payload.photos = s.photos;
  return out;
}

export default function Tasks() {
  const { current } = useStaff();
  const { t, tv } = useI18n();
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [filter, setFilter] = useState<Filter>('待办');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CareTask | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [preset, setPreset] = useState<{ type?: string; babyId?: number } | null>(null);

  // 从宝宝页快捷按钮跳转过来：自动打开预选好的新建弹窗
  useEffect(() => {
    const type = searchParams.get('new');
    if (!type) return;
    setPreset({ type, babyId: Number(searchParams.get('baby')) || undefined });
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

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

  const remove = async (tk: CareTask) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    await api.del(`/api/tasks/${tk.id}`);
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
            {tk.internal_note && <span className="meta">🔒 {tk.internal_note}</span>}
            {tk.photos && tk.photos.length > 0 && <PhotoBadge refs={tk.photos} />}
            <span className="spacer" />
            {tk.status === '已完成' ? (
              <span className="meta">
                {tk.completed_by} · {fmtTime(tk.completed_at)}
              </span>
            ) : (
              <button className="btn btn-sm" onClick={() => complete(tk)}>{t('tasks.complete')}</button>
            )}
            <button className="btn btn-sm" title={t('common.edit')} onClick={() => setEditing(tk)}>✎</button>
            <button className="btn btn-sm" title={t('tasks.deleteTask')} onClick={() => remove(tk)}>✕</button>
          </div>
        ))}
        {tasks.length === 0 && <div className="empty">{t('tasks.empty')}</div>}
      </div>

      {showForm && (
        <TaskModal
          createdBy={current}
          initialType={preset?.type}
          initialSubjectId={preset?.babyId}
          onClose={() => {
            setShowForm(false);
            setPreset(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setPreset(null);
            load();
          }}
        />
      )}
      {editing && (
        <EditTaskModal
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

// 编辑任务：改说明/内部备注/计划时间（同步过的档案记录请在宝宝页单独编辑）
function EditTaskModal({
  task, onClose, onSaved,
}: {
  task: CareTask;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tv } = useI18n();
  const [detail, setDetail] = useState(task.detail || '');
  const [internalNote, setInternalNote] = useState(task.internal_note || '');
  const due = new Date(task.due_time);
  const [dueTime, setDueTime] = useState(`${pad(due.getHours())}:${pad(due.getMinutes())}`);
  const [dueDate, setDueDate] = useState(
    `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
  );
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/api/tasks/${task.id}`, {
        detail: detail.trim() || null,
        internal_note: internalNote.trim() || null,
        due_time: new Date(`${dueDate}T${dueTime}`).toISOString(),
      });
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`${t('common.edit')} · ${tv(task.title)}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('tasks.dueTime')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} required style={{ flex: 1 }} />
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required style={{ flex: 1.4 }} />
            </div>
          </div>
          <div className="field full">
            <label>{t('tasks.detail')}</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
          </div>
          <div className="field full">
            <label>{t('tasks.internalNote')}</label>
            <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} />
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

const pad = (x: number) => String(x).padStart(2, '0');

function TaskModal({
  createdBy, onClose, onSaved, initialType, initialSubjectId,
}: {
  createdBy: string;
  onClose: () => void;
  onSaved: () => void;
  initialType?: string;
  initialSubjectId?: number;
}) {
  const { t, tv } = useI18n();
  const [mothers, setMothers] = useState<Mother[]>([]);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [subjectType, setSubjectType] = useState<'mother' | 'baby'>('baby');
  const [subjectId, setSubjectId] = useState<number>(initialSubjectId || 0);
  const [taskType, setTaskTypeState] = useState(
    initialType && TASK_TYPES.includes(initialType) ? initialType : TASK_TYPES[0]
  );
  const [detail, setDetail] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const now = new Date();
  const [dueTime, setDueTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [dueDate, setDueDate] = useState(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  );
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // 亲喂计时器
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setTaskType = (type: string) => {
    setTaskTypeState(type);
    setFieldValues({});
  };

  useEffect(() => {
    api.get<Mother[]>('/api/mothers?status=在住').then(async (ms) => {
      setMothers(ms);
      const all: Baby[] = [];
      for (const m of ms) {
        const d = await api.get<Mother & { babies: Baby[] }>(`/api/mothers/${m.id}`);
        all.push(...d.babies.filter((b) => b.status === '在住'));
      }
      setBabies(all);
      if (initialSubjectId && all.some((b) => b.id === initialSubjectId)) setSubjectId(initialSubjectId);
      else if (all.length) setSubjectId(all[0].id);
      else if (ms.length) setSubjectId(ms[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const list = subjectType === 'baby' ? babies : mothers;
    if (list.length && !list.some((s) => s.id === subjectId)) setSubjectId(list[0].id);
  }, [subjectType, babies, mothers, subjectId]);

  // 汇总统计：自动结算当日数据填入说明
  useEffect(() => {
    if (taskType !== '汇总统计' || subjectType !== 'baby' || !subjectId) return;
    api.get<BabyDetailData>(`/api/babies/${subjectId}`).then((b) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = (time: string) => new Date(time) >= today;
      const feeds = b.feeds.filter((f) => isToday(f.time));
      const milk = feeds.reduce((s, f) => s + (f.amount_ml || 0), 0);
      const diapers = b.diapers.filter((d) => isToday(d.time));
      const urine = diapers.filter((d) => d.type.includes('尿')).length;
      const stool = diapers.filter((d) => d.type.includes('便')).length;
      const latestV = b.vitals[0];
      const parts = [
        `${tv('今日喂养汇总')}: ${feeds.length}x / ${milk}ml`,
        `${tv('小便')} ${urine}x`,
        `${tv('大便')} ${stool}x`,
      ];
      if (latestV?.temperature_c != null) parts.push(`${tv('体温')} ${latestV.temperature_c}°C`);
      if (latestV?.weight_g != null) parts.push(`${tv('体重')} ${latestV.weight_g}g`);
      if (latestV?.jaundice_mg_dl != null) parts.push(`${tv('黄疸')} ${latestV.jaundice_mg_dl}mg/dL`);
      setDetail(parts.join('、'));
    });
  }, [taskType, subjectType, subjectId, tv]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const toggleTimer = () => {
    if (timerStart == null) {
      const start = Date.now();
      setTimerStart(start);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
      setFieldValues((fv) => ({ ...fv, duration: String(mins) }));
      setTimerStart(null);
    }
  };

  const toggleChip = (chipText: string) => {
    setDetail((d) => {
      if (d.includes(chipText)) {
        return d.split('、').filter((part) => part.trim() !== chipText).join('、');
      }
      return d ? `${d}、${chipText}` : chipText;
    });
  };

  // 自定义药品/用品（本机记住，供下次点选）
  const [customMeds, setCustomMeds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('custom_meds') || '[]');
    } catch {
      return [];
    }
  });
  const [newMed, setNewMed] = useState('');
  const addCustomMed = () => {
    const name = newMed.trim();
    if (!name) return;
    if (!customMeds.includes(name)) {
      const next = [...customMeds, name];
      setCustomMeds(next);
      localStorage.setItem('custom_meds', JSON.stringify(next));
    }
    if (!detail.includes(name)) toggleChip(name);
    setNewMed('');
  };

  const chips = taskType === '补充剂/用药'
    ? [...(DETAIL_PRESETS[taskType] || []), ...customMeds]
    : DETAIL_PRESETS[taskType] || [];
  const isNurseNote = taskType === '护理记录/观察';

  const visibleFields = (TYPE_FIELDS[taskType] || []).filter((f) => !f.showIf || f.showIf(fieldValues));

  // 数值合理范围校验（防止手误，如体重把 kg 填成 g）
  const RANGES: Record<string, [number, number]> = {
    temp: [34, 43], jaundice: [0, 35], hr: [40, 260], rr: [10, 120], spo2: [50, 100],
    amount: [1, 500], bm: [1, 500], fm: [1, 500], duration: [1, 240], weight: [100, 8000],
  };

  // 返回校验后（可能已做 kg→g 换算）的字段值；error 非空时中止提交
  const validateFields = (): { error: string | null; values: Record<string, string> } => {
    const fv = { ...fieldValues };
    const w = Number(fv.weight);
    if (fv.weight && w > 0 && w < 100) {
      // 疑似填了 kg，确认后自动换算
      if (window.confirm(t('val.weightKg', { v: fv.weight, g: Math.round(w * 1000) }))) {
        fv.weight = String(Math.round(w * 1000));
        setFieldValues(fv);
      } else {
        return { error: t('val.range', { label: t('vitals.weightG') }), values: fv };
      }
    }
    for (const f of visibleFields) {
      if (f.kind !== 'number') continue;
      const raw = (fv[f.id] || '').trim();
      if (!raw) continue;
      const [lo, hi] = RANGES[f.id] || [0, Infinity];
      const val = Number(raw);
      if (Number.isNaN(val) || val < lo || val > hi) {
        return { error: `${t('val.range', { label: t(f.labelKey) })}（${lo}-${hi}）`, values: fv };
      }
    }
    return { error: null, values: fv };
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const checked = validateFields();
    if (checked.error) {
      setErr(checked.error);
      return;
    }
    const values = checked.values;
    const fd = new FormData(e.currentTarget);
    const parts: string[] = [];
    for (const f of visibleFields) {
      const v = (values[f.id] || '').trim();
      if (!v || v === '无') continue;
      if (f.kind === 'number') parts.push(`${tv(f.short)} ${v}${f.unit || ''}`);
      else if (f.kind === 'time') parts.push(`${tv(f.short)} ${v}`);
      else if (LABELED_FIELDS.has(f.id)) parts.push(`${tv(labelWord[f.id])}·${tv(v)}`);
      else if (f.kind === 'select') parts.push(tv(v));
      else parts.push(v);
    }
    const combinedDetail = [...parts, detail.trim()].filter(Boolean).join('、');
    const timeIso = new Date(`${dueDate}T${dueTime}`).toISOString();
    const title = taskType === '其他' ? String(fd.get('title')) : taskType;
    const photoPayload = photos.length ? photos.map((p) => ({ data: p.data, mime: p.mime })) : undefined;

    const syncs = buildRecordSyncs({
      subjectType, subjectId, taskType, title, fieldValues: values, timeIso,
      notes: detail.trim(), recordedBy: createdBy, photos: photoPayload,
    });

    const body: Record<string, unknown> = {
      subject_type: subjectType,
      subject_id: subjectId,
      title,
      detail: combinedDetail || null,
      internal_note: internalNote.trim() || null,
      due_time: timeIso,
      created_by: createdBy,
    };
    if (photoPayload && !syncs.length) body.photos = photoPayload;

    setBusy(true);
    setErr('');
    try {
      await api.post('/api/tasks', body);
      for (const s of syncs) await api.post(s.url, s.payload);
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
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
            <select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {(subjectType === 'baby' ? babies : mothers).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* 时间在前、日期在后，符合先选时间的习惯 */}
          <div className="field">
            <label>{t('tasks.dueTime')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} required style={{ flex: 1 }} />
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required style={{ flex: 1.4 }} />
            </div>
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
          {visibleFields.map((f) => (
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
                  type={f.kind === 'number' ? 'number' : f.kind === 'time' ? 'time' : 'text'}
                  step={f.step}
                  placeholder={f.unit || ''}
                  value={fieldValues[f.id] || ''}
                  onChange={(e) => setFieldValues((fv) => ({ ...fv, [f.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {taskType === '喂奶时间' && isBF(fieldValues) && (
            <div className="field full">
              <button
                type="button"
                className={`btn ${timerStart != null ? 'voice-btn listening' : ''}`}
                onClick={toggleTimer}
              >
                {timerStart != null
                  ? `${t('tasks.timerStop')} ${Math.floor(elapsed / 60)}:${pad(elapsed % 60)}`
                  : t('tasks.timerStart')}
              </button>
            </div>
          )}
          {chips.length > 0 && (
            <div className="field full">
              <label>{t('tasks.quickDetail')}</label>
              <div className="chip-row">
                {chips.map((chip) => (
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
          {taskType === '补充剂/用药' && (
            <div className="field full">
              <label>{t('tasks.addCustomMed')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={newMed} onChange={(e) => setNewMed(e.target.value)} style={{ flex: 1 }} />
                <button type="button" className="btn" onClick={addCustomMed}>＋</button>
              </div>
            </div>
          )}
          {!isNurseNote && (
            <div className="field full">
              <label>{t('tasks.detail')}</label>
              <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
              <VoiceInput onText={(text) => setDetail((d) => (d ? `${d} ${text}` : text))} />
            </div>
          )}
          <div className="field full">
            <label>{t('photo.photos')}</label>
            <PhotoInput photos={photos} onChange={setPhotos} />
          </div>
          <div className="field full">
            <label>{t('tasks.internalNote')}</label>
            <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={isNurseNote ? 4 : 2} />
            {isNurseNote && <VoiceInput onText={(text) => setInternalNote((d) => (d ? `${d} ${text}` : text))} />}
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
