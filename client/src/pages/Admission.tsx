import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Mother } from '../api';
import { useI18n } from '../i18n';

interface BabyDraft {
  name: string;
  sex: string;
  birth_weight_g: string;
  gestational_age_weeks: string;
}

const emptyBaby = (): BabyDraft => ({ name: '', sex: '女', birth_weight_g: '', gestational_age_weeks: '' });

export default function Admission() {
  const nav = useNavigate();
  const { t, tv } = useI18n();
  const [mothers, setMothers] = useState<Mother[]>([]);
  const [babies, setBabies] = useState<BabyDraft[]>([emptyBaby()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Mother[]>('/api/mothers').then(setMothers);
  useEffect(() => {
    load();
  }, []);

  const setBaby = (i: number, patch: Partial<BabyDraft>) =>
    setBabies((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      age: fd.get('age') ? Number(fd.get('age')) : null,
      room: fd.get('room'),
      admission_date: fd.get('admission_date'),
      expected_discharge_date: fd.get('expected_discharge_date') || null,
      delivery_date: fd.get('delivery_date'),
      delivery_type: fd.get('delivery_type'),
      parity: fd.get('parity') || null,
      feeding_plan: fd.get('feeding_plan') || null,
      allergies: fd.get('allergies') || null,
      notes: fd.get('notes') || null,
      babies: babies
        .filter((b) => b.name.trim())
        .map((b) => ({
          name: b.name.trim(),
          sex: b.sex,
          birth_date: fd.get('delivery_date'),
          birth_weight_g: b.birth_weight_g ? Number(b.birth_weight_g) : null,
          gestational_age_weeks: b.gestational_age_weeks ? Number(b.gestational_age_weeks) : null,
        })),
    };
    setBusy(true);
    setErr('');
    try {
      const m = await api.post<Mother>('/api/mothers', body);
      nav(`/mothers/${m.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const inHouse = mothers.filter((m) => m.status === '在住');
  const discharged = mothers.filter((m) => m.status === '已离所');

  const opt = (v: string) => <option key={v} value={v}>{tv(v)}</option>;

  return (
    <>
      <div className="page-title">{t('admission.title')}</div>

      <div className="card">
        <h3>{t('admission.new')}</h3>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field"><label>{t('admission.motherName')}</label><input name="name" required /></div>
            <div className="field"><label>{t('mother.age')}</label><input type="number" name="age" min={14} max={60} /></div>
            <div className="field"><label>{t('admission.roomRequired')}</label><input name="room" required placeholder={t('admission.roomPlaceholder')} /></div>
            <div className="field">
              <label>{t('admission.admissionDate')}</label>
              <input type="date" name="admission_date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="field"><label>{t('admission.expectedDischarge')}</label><input type="date" name="expected_discharge_date" /></div>
            <div className="field"><label>{t('admission.deliveryDate')}</label><input type="date" name="delivery_date" required /></div>
            <div className="field">
              <label>{t('admission.deliveryType')}</label>
              <select name="delivery_type">
                {['顺产', '剖宫产', '产钳/胎吸助产'].map(opt)}
              </select>
            </div>
            <div className="field"><label>{t('mother.parity')}</label><input name="parity" placeholder={t('admission.parityPlaceholder')} /></div>
            <div className="field">
              <label>{t('mother.feedingPlan')}</label>
              <select name="feeding_plan">
                {['母乳亲喂', '母乳为主', '混合喂养', '配方奶'].map(opt)}
              </select>
            </div>
            <div className="field"><label>{t('mother.allergies')}</label><input name="allergies" placeholder={t('common.optional')} /></div>
            <div className="field full"><label>{t('common.notes')}</label><textarea name="notes" /></div>
          </div>

          <h3 style={{ margin: '16px 0 10px' }}>{t('admission.accompanyingBabies')}</h3>
          {babies.map((b, i) => (
            <div className="form-grid" key={i} style={{ marginBottom: 10 }}>
              <div className="field"><label>{t('admission.babyName')}</label><input value={b.name} onChange={(e) => setBaby(i, { name: e.target.value })} /></div>
              <div className="field">
                <label>{t('admission.sex')}</label>
                <select value={b.sex} onChange={(e) => setBaby(i, { sex: e.target.value })}>
                  {['女', '男'].map(opt)}
                </select>
              </div>
              <div className="field"><label>{t('vitals.weightG')}</label><input type="number" value={b.birth_weight_g} onChange={(e) => setBaby(i, { birth_weight_g: e.target.value })} /></div>
              <div className="field"><label>{t('baby.gestAge')}</label><input type="number" step="0.5" value={b.gestational_age_weeks} onChange={(e) => setBaby(i, { gestational_age_weeks: e.target.value })} /></div>
            </div>
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => setBabies((bs) => [...bs, emptyBaby()])}>
              {t('admission.addBaby')}
            </button>
            {babies.length > 1 && (
              <button type="button" className="btn btn-sm" onClick={() => setBabies((bs) => bs.slice(0, -1))}>
                {t('admission.removeBaby')}
              </button>
            )}
          </div>

          {err && <div className="form-error">{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('common.submitting') : t('admission.finish')}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>{t('admission.inHouse', { n: inHouse.length })}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('common.room')}</th><th>{t('common.name')}</th><th>{t('admission.admissionDate')}</th>
                <th>{t('mother.expectedDischarge')}</th><th>{t('admission.deliveryType')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {inHouse.map((m) => (
                <tr key={m.id}>
                  <td><span className="badge badge-room">{m.room}</span></td>
                  <td>{m.name}</td>
                  <td>{m.admission_date}</td>
                  <td>{m.expected_discharge_date || '—'}</td>
                  <td>{tv(m.delivery_type)}</td>
                  <td><Link to={`/mothers/${m.id}`} className="btn btn-sm">{t('common.view')}</Link></td>
                </tr>
              ))}
              {inHouse.length === 0 && <tr><td colSpan={6} className="empty">{t('admission.noneInHouse')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {discharged.length > 0 && (
        <div className="card">
          <h3>{t('admission.dischargedList', { n: discharged.length })}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.room')}</th><th>{t('common.name')}</th><th>{t('admission.admissionDate')}</th>
                  <th>{t('admission.dischargeTime')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {discharged.map((m) => (
                  <tr key={m.id}>
                    <td>{m.room}</td>
                    <td>{m.name}</td>
                    <td>{m.admission_date}</td>
                    <td>{m.discharged_at?.slice(0, 10) || '—'}</td>
                    <td><Link to={`/mothers/${m.id}`} className="btn btn-sm">{t('common.view')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
