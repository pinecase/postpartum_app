import { db } from './db.js';

const HOURS = 3600 * 1000;

function hoursAgoIso(h) {
  return new Date(Date.now() - h * HOURS).toISOString();
}

// 预警规则（简化的临床阈值，供月子中心护理参考，不替代医嘱）
// code + params 供前端按用户语言渲染；message 为中文回退文案
export function computeAlerts() {
  const alerts = [];

  const babies = db
    .prepare(
      `SELECT b.*, m.room, m.name AS mother_name FROM babies b
       JOIN mothers m ON m.id = b.mother_id
       WHERE b.status = '在住'`
    )
    .all();

  const latestVital = db.prepare(
    `SELECT * FROM baby_vitals WHERE baby_id = ? ORDER BY time DESC LIMIT 1`
  );
  const lastFeed = db.prepare(
    `SELECT * FROM baby_feeds WHERE baby_id = ? ORDER BY time DESC LIMIT 1`
  );
  const stoolCount24h = db.prepare(
    `SELECT COUNT(*) AS c FROM baby_diapers WHERE baby_id = ? AND time >= ? AND type LIKE '%便%'`
  );

  for (const b of babies) {
    const v = latestVital.get(b.id);
    const subject = { subject_type: 'baby', subject_id: b.id, subject_name: b.name, room: b.room };

    if (v) {
      if (v.temperature_c != null && v.temperature_c >= 37.5) {
        alerts.push({ ...subject, level: 'danger', code: 'baby_temp_high', params: { temp: v.temperature_c }, message: `体温偏高 ${v.temperature_c}°C`, time: v.time });
      } else if (v.temperature_c != null && v.temperature_c < 36.0) {
        alerts.push({ ...subject, level: 'warning', code: 'baby_temp_low', params: { temp: v.temperature_c }, message: `体温偏低 ${v.temperature_c}°C`, time: v.time });
      }
      if (v.jaundice_mg_dl != null) {
        if (v.jaundice_mg_dl >= 15) {
          alerts.push({ ...subject, level: 'danger', code: 'jaundice_danger', params: { value: v.jaundice_mg_dl }, message: `黄疸值偏高 ${v.jaundice_mg_dl} mg/dL，建议就医评估`, time: v.time });
        } else if (v.jaundice_mg_dl >= 12) {
          alerts.push({ ...subject, level: 'warning', code: 'jaundice_warning', params: { value: v.jaundice_mg_dl }, message: `黄疸值升高 ${v.jaundice_mg_dl} mg/dL，需密切复测`, time: v.time });
        }
      }
      if (v.weight_g != null && b.birth_weight_g) {
        const dropPct = ((b.birth_weight_g - v.weight_g) / b.birth_weight_g) * 100;
        if (dropPct >= 10) {
          alerts.push({ ...subject, level: 'danger', code: 'weight_drop', params: { pct: dropPct.toFixed(1) }, message: `体重较出生下降 ${dropPct.toFixed(1)}%（>10%）`, time: v.time });
        }
      }
    }

    const f = lastFeed.get(b.id);
    if (f && new Date(f.time).getTime() < Date.now() - 4 * HOURS) {
      const hrs = Math.floor((Date.now() - new Date(f.time).getTime()) / HOURS);
      alerts.push({ ...subject, level: 'warning', code: 'feed_gap', params: { hours: hrs }, message: `已 ${hrs} 小时未记录喂养`, time: f.time });
    } else if (!f) {
      alerts.push({ ...subject, level: 'warning', code: 'no_feed_record', params: {}, message: '尚无喂养记录', time: null });
    }

    const stools = stoolCount24h.get(b.id, hoursAgoIso(24));
    if (stools.c === 0) {
      alerts.push({ ...subject, level: 'info', code: 'no_stool_24h', params: {}, message: '24 小时内无排便记录', time: null });
    }
  }

  const mothers = db.prepare(`SELECT * FROM mothers WHERE status = '在住'`).all();
  const latestMotherVital = db.prepare(
    `SELECT * FROM mother_vitals WHERE mother_id = ? ORDER BY time DESC LIMIT 1`
  );

  for (const m of mothers) {
    const v = latestMotherVital.get(m.id);
    if (!v) continue;
    const subject = { subject_type: 'mother', subject_id: m.id, subject_name: m.name, room: m.room };

    if (v.temperature_c != null && v.temperature_c >= 38.0) {
      alerts.push({ ...subject, level: 'danger', code: 'mother_fever', params: { temp: v.temperature_c }, message: `产妇发热 ${v.temperature_c}°C`, time: v.time });
    }
    if (v.systolic != null && (v.systolic >= 140 || v.diastolic >= 90)) {
      alerts.push({ ...subject, level: 'danger', code: 'bp_high', params: { sys: v.systolic, dia: v.diastolic }, message: `血压偏高 ${v.systolic}/${v.diastolic} mmHg`, time: v.time });
    }
    if (v.lochia_amount === '多') {
      alerts.push({ ...subject, level: 'warning', code: 'lochia_heavy', params: {}, message: '恶露量多，需观察出血情况', time: v.time });
    }
    if (v.mood_score != null && v.mood_score <= 2) {
      alerts.push({ ...subject, level: 'warning', code: 'mood_low', params: { score: v.mood_score }, message: `情绪评分偏低（${v.mood_score}/5），关注产后情绪`, time: v.time });
    }
    if (v.pain_score != null && v.pain_score >= 7) {
      alerts.push({ ...subject, level: 'warning', code: 'pain_high', params: { score: v.pain_score }, message: `疼痛评分 ${v.pain_score}/10，需评估处理`, time: v.time });
    }
  }

  const order = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return alerts;
}
