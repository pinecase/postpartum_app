import { FormEvent, useState } from 'react';
import { api, localDatetimeValue, BabyObservation, NeedsAnalysis, parseObservation } from '../api';
import { useI18n } from '../i18n';
import Modal from './Modal';
import PhotoInput, { PhotoDraft } from './PhotoInput';

// 选项 code 与 shared/needs-engine.js 保持一致，显示文案走 i18n（obs.cry.* / obs.sig.*）
export const CRY_TYPES = ['none', 'neh', 'owh', 'eh', 'eairh', 'heh', 'whimper', 'intense', 'high_pitch'];

export const SIGNAL_GROUPS: { key: string; codes: string[] }[] = [
  {
    key: 'expression',
    codes: ['frown', 'grimace', 'smile', 'pout', 'glazed_eyes', 'bright_eyes', 'half_closed_eyes', 'avoid_gaze'],
  },
  {
    key: 'action',
    codes: ['rooting', 'sucking_hand', 'yawning', 'rub_eyes', 'legs_to_belly', 'arch_back', 'squirm',
      'active_limbs', 'startle', 'clenched_fists', 'calms_when_held', 'cooing', 'still_quiet'],
  },
  {
    key: 'body',
    codes: ['sweaty', 'flushed', 'cold_extremities', 'mottled_skin', 'goosebumps', 'bloated_belly',
      'passing_gas', 'hiccup', 'milk_spit', 'wet_diaper'],
  },
];

const NEED_EMOJI: Record<string, string> = {
  hungry: '🍼', sleepy: '😴', burp: '🫧', colic: '😖', diaper: '🧷', too_hot: '🥵',
  too_cold: '🥶', discomfort: '🤒', cuddle: '🤗', scared: '😨', play: '🎈', bored: '🥱', content: '😊',
};

// 依据 code：哭声/情境/测量类走 obs.ev.*，观察信号复用 obs.sig.* 文案
const EV_PREFIXES = ['cry_', 'ctx_', 'temp_', 'ambient_', 'humidity_'];

export function NeedsResultView({ analysis }: { analysis: NeedsAnalysis }) {
  const { t } = useI18n();
  const evLabel = (e: string) => (EV_PREFIXES.some((p) => e.startsWith(p)) ? t(`obs.ev.${e}`) : t(`obs.sig.${e}`));
  const max = analysis.needs[0]?.score || 1;
  const ctx = analysis.context;
  const ctxParts = [
    ctx.hours_since_feed != null && t('obs.ctx.feed', { h: ctx.hours_since_feed }),
    ctx.stool_count_24h != null && t('obs.ctx.stool', { n: ctx.stool_count_24h }),
    ctx.hours_since_diaper != null && t('obs.ctx.diaper', { h: ctx.hours_since_diaper }),
  ].filter(Boolean);

  return (
    <div className="needs-result">
      {analysis.flags.map((f) => (
        <div key={f.code} className={`needs-flag ${f.level}`}>⚠️ {t(`obs.flag.${f.code}`)}</div>
      ))}
      {analysis.needs.length === 0 && <div className="empty">{t('obs.noConclusion')}</div>}
      {analysis.needs.map((n, i) => (
        <div key={n.code} className="need-row">
          <div className="need-head">
            <span className="need-name">
              {NEED_EMOJI[n.code]} {t(`obs.need.${n.code}`)}
              <span className={`badge badge-conf-${n.confidence}`}>{t(`obs.confidence.${n.confidence}`)}</span>
            </span>
            <span className="need-score">{n.score}</span>
          </div>
          <div className="need-bar"><div style={{ width: `${(n.score / max) * 100}%` }} /></div>
          {i === 0 && <div className="need-advice">💡 {t(`obs.advice.${n.code}`)}</div>}
          <div className="need-evidence">
            {n.evidence.map((e) => <span key={e} className="evidence-chip">{evLabel(e)}</span>)}
          </div>
        </div>
      ))}
      {ctxParts.length > 0 && <div className="needs-ctx">{ctxParts.join(' · ')}</div>}
      <div className="needs-disclaimer">{t('obs.disclaimer')}</div>
    </div>
  );
}

export default function ObservationModal({
  babyId, recordedBy, onClose, onSaved,
}: {
  babyId: number;
  recordedBy: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cryType, setCryType] = useState('');
  const [signals, setSignals] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [analysis, setAnalysis] = useState<NeedsAnalysis | null>(null);

  const toggle = (code: string) =>
    setSignals((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      recorded_by: recordedBy,
      cry_type: cryType || undefined,
      signals: [...signals],
    };
    for (const k of ['temperature_c', 'ambient_temp_c', 'ambient_humidity_pct'] as const) {
      const v = fd.get(k);
      if (v !== null && v !== '') body[k] = Number(v);
    }
    const time = fd.get('time');
    if (time) body.time = new Date(String(time)).toISOString();
    const notes = fd.get('notes');
    if (notes) body.notes = notes;
    if (photos.length) body.photos = photos.map((p) => ({ data: p.data, mime: p.mime }));

    setBusy(true);
    setErr('');
    try {
      const saved = await api.post<BabyObservation>(`/api/babies/${babyId}/observations`, body);
      setAnalysis(parseObservation(saved).result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 保存成功后展示推断结果
  if (analysis) {
    return (
      <Modal title={t('obs.resultTitle')} onClose={onSaved}>
        <NeedsResultView analysis={analysis} />
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onSaved}>{t('obs.done')}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('modal.addObservation')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>{t('common.time')}</label>
            <input type="datetime-local" name="time" defaultValue={localDatetimeValue()} required />
          </div>
          <div className="field">
            <label>{t('obs.cryLabel')}</label>
            <select value={cryType} onChange={(e) => setCryType(e.target.value)}>
              <option value="">—</option>
              {CRY_TYPES.map((c) => <option key={c} value={c}>{t(`obs.cry.${c}`)}</option>)}
            </select>
          </div>
          {SIGNAL_GROUPS.map((g) => (
            <div className="field full" key={g.key}>
              <label>{t(`obs.group.${g.key}`)}</label>
              <div className="chip-row">
                {g.codes.map((code) => (
                  <button
                    type="button"
                    key={code}
                    className={`sig-chip ${signals.has(code) ? 'active' : ''}`}
                    onClick={() => toggle(code)}
                  >
                    {t(`obs.sig.${code}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field"><label>{t('vitals.tempC')}</label><input type="number" name="temperature_c" step="0.1" min={30} max={43} /></div>
          <div className="field"><label>{t('obs.ambientTemp')}</label><input type="number" name="ambient_temp_c" step="0.5" min={0} max={45} /></div>
          <div className="field"><label>{t('obs.humidity')}</label><input type="number" name="ambient_humidity_pct" min={0} max={100} /></div>
          <div className="field full"><label>{t('common.notes')}</label><textarea name="notes" /></div>
          <div className="field full">
            <label>{t('photo.photos')}</label>
            <PhotoInput photos={photos} onChange={setPhotos} />
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('obs.analyzing') : t('obs.analyze')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
