import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { computeAlerts } from './alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' })); // 记录可随附压缩照片（base64）

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------- 照片 ----------
const MAX_PHOTOS_PER_RECORD = 3;
const MAX_PHOTO_B64_LEN = 600_000; // ≈450KB 二进制，客户端压缩后远小于此

const insertPhotoStmt = () =>
  db.prepare(`INSERT INTO photos (record_type, record_id, created_at, mime, data, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`);

function savePhotos(recordType, recordId, photos, recordedBy) {
  if (!Array.isArray(photos)) return;
  const stmt = insertPhotoStmt();
  for (const p of photos.slice(0, MAX_PHOTOS_PER_RECORD)) {
    if (!p || typeof p.data !== 'string' || !p.data) continue;
    if (p.data.length > MAX_PHOTO_B64_LEN) {
      throw Object.assign(new Error('照片过大，请重试'), { status: 413 });
    }
    stmt.run(recordType, recordId, nowIso(), p.mime || 'image/jpeg', p.data, recordedBy ?? null);
  }
}

function photoRefs(recordType, subQuerySql, subQueryParam) {
  return db
    .prepare(`SELECT id, record_type, record_id FROM photos WHERE record_type = ? AND record_id IN (${subQuerySql})`)
    .all(recordType, subQueryParam);
}

app.get('/api/photos/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM photos WHERE id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: '未找到照片' });
  res.json(p);
});

// ---------- 访问 PIN ----------
const getPin = () => {
  try {
    return db.prepare(`SELECT value FROM settings WHERE key = 'access_pin'`).get()?.value || null;
  } catch {
    return null;
  }
};

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const pin = getPin();
  if (pin && req.headers['x-pin'] !== pin) return res.status(401).json({ error: 'pin_required' });
  next();
});

app.get('/api/auth/status', (req, res) => res.json({ pin_set: !!getPin() }));

app.post('/api/auth/verify', (req, res) => {
  const stored = getPin();
  res.json({ ok: !stored || req.body.pin === stored });
});

app.post('/api/auth/pin', (req, res) => {
  const { old_pin, new_pin } = req.body;
  if (!new_pin || !/^\d{4,8}$/.test(new_pin)) return res.status(400).json({ error: 'PIN 需为 4-8 位数字' });
  const stored = getPin();
  if (stored && old_pin !== stored) return res.status(403).json({ error: '当前访问码不正确' });
  db.prepare(`INSERT INTO settings (key, value) VALUES ('access_pin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(new_pin);
  res.json({ ok: true });
});

// ---------- 员工 ----------
app.get('/api/staff', (req, res) => {
  res.json(db.prepare(`SELECT * FROM staff WHERE active = 1 ORDER BY id`).all());
});

app.post('/api/staff', (req, res) => {
  const { name, role = '护士' } = req.body;
  if (!name) return res.status(400).json({ error: '姓名必填' });
  const r = db.prepare(`INSERT INTO staff (name, role) VALUES (?, ?)`).run(name, role);
  res.status(201).json(db.prepare(`SELECT * FROM staff WHERE id = ?`).get(r.lastInsertRowid));
});

// ---------- 总览 ----------
app.get('/api/overview', (req, res) => {
  const mothers = db
    .prepare(`SELECT * FROM mothers WHERE status = '在住' ORDER BY room`)
    .all();
  const babiesByMother = db.prepare(`SELECT * FROM babies WHERE mother_id = ? AND status = '在住'`);
  const latestMotherVital = db.prepare(`SELECT * FROM mother_vitals WHERE mother_id = ? ORDER BY time DESC LIMIT 1`);
  const latestBabyVital = db.prepare(`SELECT * FROM baby_vitals WHERE baby_id = ? ORDER BY time DESC LIMIT 1`);
  const lastFeed = db.prepare(`SELECT * FROM baby_feeds WHERE baby_id = ? ORDER BY time DESC LIMIT 1`);
  const feedsToday = db.prepare(`SELECT COUNT(*) AS c FROM baby_feeds WHERE baby_id = ? AND time >= ?`);
  const milkToday = db.prepare(`SELECT COALESCE(SUM(amount_ml), 0) AS c FROM baby_feeds WHERE baby_id = ? AND time >= ?`);
  const diapersToday = db.prepare(`SELECT COUNT(*) AS c FROM baby_diapers WHERE baby_id = ? AND time >= ?`);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const rooms = mothers.map((m) => ({
    mother: { ...m, latest_vital: latestMotherVital.get(m.id) || null },
    babies: babiesByMother.all(m.id).map((b) => ({
      ...b,
      latest_vital: latestBabyVital.get(b.id) || null,
      last_feed: lastFeed.get(b.id) || null,
      feeds_today: feedsToday.get(b.id, dayStartIso).c,
      milk_today: milkToday.get(b.id, dayStartIso).c,
      diapers_today: diapersToday.get(b.id, dayStartIso).c,
    })),
  }));

  const pendingTasks = db
    .prepare(`SELECT * FROM care_tasks WHERE status = '待办' ORDER BY due_time LIMIT 50`)
    .all();

  res.json({
    rooms,
    alerts: computeAlerts(),
    pending_tasks: pendingTasks,
    stats: {
      mothers_in_house: mothers.length,
      babies_in_house: rooms.reduce((s, r) => s + r.babies.length, 0),
      pending_task_count: pendingTasks.length,
    },
  });
});

// ---------- 产妇 ----------
app.get('/api/mothers', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare(`SELECT * FROM mothers WHERE status = ? ORDER BY room`).all(status)
    : db.prepare(`SELECT * FROM mothers ORDER BY status, room`).all();
  res.json(rows);
});

app.post('/api/mothers', (req, res) => {
  const {
    name, age, room, admission_date, expected_discharge_date,
    delivery_date, delivery_type = '顺产', parity, feeding_plan, allergies, notes,
    babies = [],
  } = req.body;
  if (!name || !room || !delivery_date) {
    return res.status(400).json({ error: '姓名、房间、分娩日期必填' });
  }
  const insertMother = db.prepare(`
    INSERT INTO mothers (name, age, room, admission_date, expected_discharge_date, delivery_date, delivery_type, parity, feeding_plan, allergies, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertBaby = db.prepare(`
    INSERT INTO babies (mother_id, name, sex, birth_date, birth_weight_g, gestational_age_weeks, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    const r = insertMother.run(
      name, age ?? null, room, admission_date || todayStr(), expected_discharge_date ?? null,
      delivery_date, delivery_type, parity ?? null, feeding_plan ?? null, allergies ?? null, notes ?? null
    );
    const motherId = r.lastInsertRowid;
    for (const b of babies) {
      insertBaby.run(
        motherId, b.name || `${name}之宝`, b.sex || '女', b.birth_date || delivery_date,
        b.birth_weight_g ?? null, b.gestational_age_weeks ?? null, b.notes ?? null
      );
    }
    return motherId;
  });
  const motherId = tx();
  res.status(201).json(db.prepare(`SELECT * FROM mothers WHERE id = ?`).get(motherId));
});

app.get('/api/mothers/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM mothers WHERE id = ?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '未找到产妇' });
  const babies = db.prepare(`SELECT * FROM babies WHERE mother_id = ?`).all(m.id);
  const vitals = db
    .prepare(`SELECT * FROM mother_vitals WHERE mother_id = ? ORDER BY time DESC LIMIT 200`)
    .all(m.id);
  const tasks = db
    .prepare(`SELECT * FROM care_tasks WHERE subject_type = 'mother' AND subject_id = ? ORDER BY due_time DESC LIMIT 50`)
    .all(m.id);
  const photos = photoRefs('mother_vitals', `SELECT id FROM mother_vitals WHERE mother_id = ?`, m.id);
  res.json({ ...m, babies, vitals, tasks, photos });
});

app.patch('/api/mothers/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM mothers WHERE id = ?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '未找到产妇' });
  const allowed = ['room', 'expected_discharge_date', 'feeding_plan', 'allergies', 'notes', 'status'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (req.body.status === '已离所') {
    sets.push(`discharged_at = ?`);
    vals.push(nowIso());
    db.prepare(`UPDATE babies SET status = '已离所' WHERE mother_id = ?`).run(m.id);
  }
  if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
  db.prepare(`UPDATE mothers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, m.id);
  res.json(db.prepare(`SELECT * FROM mothers WHERE id = ?`).get(m.id));
});

app.post('/api/mothers/:id/vitals', (req, res) => {
  const m = db.prepare(`SELECT id FROM mothers WHERE id = ?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '未找到产妇' });
  const {
    time, temperature_c, systolic, diastolic, pulse, lochia_amount, lochia_color,
    wound_status, breast_status, mood_score, pain_score, notes, recorded_by, photos,
  } = req.body;
  const r = db.prepare(`
    INSERT INTO mother_vitals (mother_id, time, temperature_c, systolic, diastolic, pulse, lochia_amount, lochia_color, wound_status, breast_status, mood_score, pain_score, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(m.id, time || nowIso(), temperature_c ?? null, systolic ?? null, diastolic ?? null,
      pulse ?? null, lochia_amount ?? null, lochia_color ?? null, wound_status ?? null,
      breast_status ?? null, mood_score ?? null, pain_score ?? null, notes ?? null, recorded_by ?? null);
  savePhotos('mother_vitals', r.lastInsertRowid, photos, recorded_by);
  res.status(201).json(db.prepare(`SELECT * FROM mother_vitals WHERE id = ?`).get(r.lastInsertRowid));
});

// ---------- 宝宝 ----------
app.get('/api/babies/:id', (req, res) => {
  const b = db
    .prepare(`SELECT b.*, m.name AS mother_name, m.room FROM babies b JOIN mothers m ON m.id = b.mother_id WHERE b.id = ?`)
    .get(req.params.id);
  if (!b) return res.status(404).json({ error: '未找到宝宝' });
  const feeds = db.prepare(`SELECT * FROM baby_feeds WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).all(b.id);
  const diapers = db.prepare(`SELECT * FROM baby_diapers WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).all(b.id);
  const vitals = db.prepare(`SELECT * FROM baby_vitals WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).all(b.id);
  const cares = db.prepare(`SELECT * FROM baby_cares WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).all(b.id);
  const tasks = db
    .prepare(`SELECT * FROM care_tasks WHERE subject_type = 'baby' AND subject_id = ? ORDER BY due_time DESC LIMIT 50`)
    .all(b.id);
  const photos = [
    ...photoRefs('feeds', `SELECT id FROM baby_feeds WHERE baby_id = ?`, b.id),
    ...photoRefs('diapers', `SELECT id FROM baby_diapers WHERE baby_id = ?`, b.id),
    ...photoRefs('vitals', `SELECT id FROM baby_vitals WHERE baby_id = ?`, b.id),
    ...photoRefs('cares', `SELECT id FROM baby_cares WHERE baby_id = ?`, b.id),
  ];
  res.json({ ...b, feeds, diapers, vitals, cares, tasks, photos });
});

const babyExists = (id) => db.prepare(`SELECT id FROM babies WHERE id = ?`).get(id);

app.patch('/api/babies/:id', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const sets = [];
  const vals = [];
  for (const k of ['feed_interval_min', 'notes', 'name']) {
    if (k in req.body) {
      sets.push(`${k} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
  db.prepare(`UPDATE babies SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json(db.prepare(`SELECT * FROM babies WHERE id = ?`).get(req.params.id));
});

// ---------- 妈妈日常安排 ----------
app.get('/api/mothers/:id/appointments', (req, res) => {
  res.json(db.prepare(`SELECT * FROM appointments WHERE mother_id = ? ORDER BY date, time`).all(req.params.id));
});

app.post('/api/mothers/:id/appointments', (req, res) => {
  const { date, time, title, notes, created_by } = req.body;
  if (!date || !title) return res.status(400).json({ error: '日期与项目必填' });
  const r = db.prepare(
    `INSERT INTO appointments (mother_id, date, time, title, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, date, time ?? null, title, notes ?? null, created_by ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(r.lastInsertRowid));
});

app.patch('/api/appointments/:id', (req, res) => {
  const sets = [];
  const vals = [];
  for (const k of ['date', 'time', 'title', 'notes', 'status']) {
    if (k in req.body) {
      sets.push(`${k} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
  const r = db.prepare(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  if (!r.changes) return res.status(404).json({ error: '未找到安排' });
  res.json(db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id));
});

app.delete('/api/appointments/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM appointments WHERE id = ?`).run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: '未找到安排' });
  res.json({ ok: true });
});

// 今明安排（工作台提醒卡）
app.get('/api/appointments/upcoming', (req, res) => {
  const days = Math.min(14, Number(req.query.days) || 2);
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  res.json(
    db.prepare(
      `SELECT a.*, m.name AS mother_name, m.room FROM appointments a
       JOIN mothers m ON m.id = a.mother_id
       WHERE a.status = '待办' AND a.date >= ? AND a.date <= ?
       ORDER BY a.date, a.time`
    ).all(from, to)
  );
});

app.post('/api/babies/:id/feeds', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, method, amount_ml, duration_min, notes, recorded_by, photos } = req.body;
  if (!method) return res.status(400).json({ error: '喂养方式必填' });
  const r = db.prepare(`
    INSERT INTO baby_feeds (baby_id, time, method, amount_ml, duration_min, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), method, amount_ml ?? null, duration_min ?? null, notes ?? null, recorded_by ?? null);
  savePhotos('feeds', r.lastInsertRowid, photos, recorded_by);
  res.status(201).json(db.prepare(`SELECT * FROM baby_feeds WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/diapers', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, type, stool_color, stool_consistency, notes, recorded_by, photos } = req.body;
  if (!type) return res.status(400).json({ error: '类型必填' });
  const r = db.prepare(`
    INSERT INTO baby_diapers (baby_id, time, type, stool_color, stool_consistency, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), type, stool_color ?? null, stool_consistency ?? null, notes ?? null, recorded_by ?? null);
  savePhotos('diapers', r.lastInsertRowid, photos, recorded_by);
  res.status(201).json(db.prepare(`SELECT * FROM baby_diapers WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/vitals', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, spo2, notes, recorded_by, photos } = req.body;
  const r = db.prepare(`
    INSERT INTO baby_vitals (baby_id, time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, spo2, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), temperature_c ?? null, weight_g ?? null, jaundice_mg_dl ?? null,
      heart_rate ?? null, resp_rate ?? null, spo2 ?? null, notes ?? null, recorded_by ?? null);
  savePhotos('vitals', r.lastInsertRowid, photos, recorded_by);
  res.status(201).json(db.prepare(`SELECT * FROM baby_vitals WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/cares', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, care_type, notes, recorded_by, photos } = req.body;
  if (!care_type) return res.status(400).json({ error: '护理项目必填' });
  const r = db.prepare(`
    INSERT INTO baby_cares (baby_id, time, care_type, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), care_type, notes ?? null, recorded_by ?? null);
  savePhotos('cares', r.lastInsertRowid, photos, recorded_by);
  res.status(201).json(db.prepare(`SELECT * FROM baby_cares WHERE id = ?`).get(r.lastInsertRowid));
});

// ---------- 护理任务 ----------
app.get('/api/tasks', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare(`SELECT * FROM care_tasks WHERE status = ? ORDER BY due_time`).all(status)
    : db.prepare(`SELECT * FROM care_tasks ORDER BY status DESC, due_time`).all();

  const motherName = db.prepare(`SELECT name, room FROM mothers WHERE id = ?`);
  const babyName = db.prepare(
    `SELECT b.name, m.room FROM babies b JOIN mothers m ON m.id = b.mother_id WHERE b.id = ?`
  );
  const taskPhotos = db
    .prepare(`SELECT id, record_type, record_id FROM photos WHERE record_type = 'tasks'`)
    .all();
  res.json(
    rows.map((t) => {
      const s = t.subject_type === 'mother' ? motherName.get(t.subject_id) : babyName.get(t.subject_id);
      return {
        ...t,
        subject_name: s?.name ?? '—',
        room: s?.room ?? '—',
        photos: taskPhotos.filter((p) => p.record_id === t.id),
      };
    })
  );
});

app.post('/api/tasks', (req, res) => {
  const { subject_type, subject_id, due_time, title, detail, created_by, photos, internal_note } = req.body;
  if (!subject_type || !subject_id || !title) {
    return res.status(400).json({ error: '对象与任务标题必填' });
  }
  const r = db.prepare(`
    INSERT INTO care_tasks (subject_type, subject_id, due_time, title, detail, created_by, internal_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(subject_type, subject_id, due_time || nowIso(), title, detail ?? null, created_by ?? null, internal_note ?? null);
  savePhotos('tasks', r.lastInsertRowid, photos, created_by);
  res.status(201).json(db.prepare(`SELECT * FROM care_tasks WHERE id = ?`).get(r.lastInsertRowid));
});

app.patch('/api/tasks/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM care_tasks WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '未找到任务' });
  if (req.body.status === '已完成') {
    db.prepare(`UPDATE care_tasks SET status = '已完成', completed_by = ?, completed_at = ? WHERE id = ?`)
      .run(req.body.completed_by ?? null, nowIso(), t.id);
  } else if (req.body.status === '待办') {
    db.prepare(`UPDATE care_tasks SET status = '待办', completed_by = NULL, completed_at = NULL WHERE id = ?`).run(t.id);
  }
  // 内容编辑（改错重填）
  const sets = [];
  const vals = [];
  for (const k of ['detail', 'internal_note', 'due_time', 'title']) {
    if (k in req.body) {
      sets.push(`${k} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (sets.length) db.prepare(`UPDATE care_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, t.id);
  res.json(db.prepare(`SELECT * FROM care_tasks WHERE id = ?`).get(t.id));
});

// ---------- 删除记录/任务（删错重录） ----------
const RECORD_TABLES = {
  feeds: 'baby_feeds',
  diapers: 'baby_diapers',
  vitals: 'baby_vitals',
  cares: 'baby_cares',
  mother_vitals: 'mother_vitals',
};

// 各记录类型允许编辑的字段
const RECORD_EDIT_FIELDS = {
  feeds: ['time', 'method', 'amount_ml', 'duration_min', 'notes'],
  diapers: ['time', 'type', 'stool_color', 'stool_consistency', 'notes'],
  vitals: ['time', 'temperature_c', 'weight_g', 'jaundice_mg_dl', 'heart_rate', 'resp_rate', 'spo2', 'notes'],
  cares: ['time', 'care_type', 'notes'],
  mother_vitals: ['time', 'temperature_c', 'systolic', 'diastolic', 'pulse', 'lochia_amount', 'lochia_color', 'wound_status', 'breast_status', 'mood_score', 'pain_score', 'notes'],
};

app.patch('/api/records/:type/:id', (req, res) => {
  const table = RECORD_TABLES[req.params.type];
  const allowed = RECORD_EDIT_FIELDS[req.params.type];
  if (!table) return res.status(400).json({ error: '未知记录类型' });
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k} = ?`);
      vals.push(req.body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无可更新字段' });
  const r = db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  if (!r.changes) return res.status(404).json({ error: '未找到记录' });
  res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id));
});

app.delete('/api/records/:type/:id', (req, res) => {
  const table = RECORD_TABLES[req.params.type];
  if (!table) return res.status(400).json({ error: '未知记录类型' });
  db.prepare(`DELETE FROM photos WHERE record_type = ? AND record_id = ?`).run(req.params.type, req.params.id);
  const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: '未找到记录' });
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare(`DELETE FROM photos WHERE record_type = 'tasks' AND record_id = ?`).run(req.params.id);
  const r = db.prepare(`DELETE FROM care_tasks WHERE id = ?`).run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: '未找到任务' });
  res.json({ ok: true });
});

// ---------- 交接班 ----------
app.get('/api/handovers', (req, res) => {
  res.json(db.prepare(`SELECT * FROM handovers ORDER BY date DESC, created_at DESC LIMIT 100`).all());
});

app.post('/api/handovers', (req, res) => {
  const { date, shift, author, content, room, mother_name, baby_name } = req.body;
  if (!shift || !author || !content) return res.status(400).json({ error: '班次、记录人、内容必填' });
  const r = db.prepare(`INSERT INTO handovers (date, shift, author, content, created_at, room, mother_name, baby_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(date || todayStr(), shift, author, content, nowIso(), room ?? null, mother_name ?? null, baby_name ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM handovers WHERE id = ?`).get(r.lastInsertRowid));
});

// ---------- 管理后台 ----------
app.get('/api/admin/summary', (req, res) => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();
  const d14 = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);

  const babies = db.prepare(`
    SELECT b.id, b.name, b.sex, b.birth_date, b.birth_weight_g, b.status,
      m.name AS mother_name, m.room,
      (SELECT weight_g FROM baby_vitals WHERE baby_id = b.id AND weight_g IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_weight,
      (SELECT jaundice_mg_dl FROM baby_vitals WHERE baby_id = b.id AND jaundice_mg_dl IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_jaundice,
      (SELECT temperature_c FROM baby_vitals WHERE baby_id = b.id AND temperature_c IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_temp,
      (SELECT COUNT(*) FROM baby_feeds WHERE baby_id = b.id AND time >= @day) AS feeds_today,
      (SELECT COALESCE(SUM(amount_ml), 0) FROM baby_feeds WHERE baby_id = b.id AND time >= @day) AS milk_today,
      (SELECT COUNT(*) FROM baby_diapers WHERE baby_id = b.id AND time >= @day AND type LIKE '%便%') AS stools_today
    FROM babies b JOIN mothers m ON m.id = b.mother_id
    ORDER BY b.status, m.room`).all({ day: dayStartIso });

  const mothers = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM babies WHERE mother_id = m.id) AS baby_count,
      (SELECT temperature_c FROM mother_vitals WHERE mother_id = m.id AND temperature_c IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_temp,
      (SELECT systolic FROM mother_vitals WHERE mother_id = m.id AND systolic IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_systolic,
      (SELECT diastolic FROM mother_vitals WHERE mother_id = m.id AND diastolic IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_diastolic,
      (SELECT lochia_amount FROM mother_vitals WHERE mother_id = m.id AND lochia_amount IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_lochia,
      (SELECT mood_score FROM mother_vitals WHERE mother_id = m.id AND mood_score IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_mood,
      (SELECT pain_score FROM mother_vitals WHERE mother_id = m.id AND pain_score IS NOT NULL ORDER BY time DESC LIMIT 1) AS latest_pain
    FROM mothers m ORDER BY m.status, m.room`).all();

  const admissions = db.prepare(
    `SELECT admission_date AS d, COUNT(*) AS c FROM mothers WHERE admission_date >= ? GROUP BY admission_date`
  ).all(d14);
  const discharges = db.prepare(
    `SELECT substr(discharged_at, 1, 10) AS d, COUNT(*) AS c FROM mothers WHERE discharged_at IS NOT NULL AND discharged_at >= ? GROUP BY 1`
  ).all(d14);
  const milkDaily = db.prepare(
    `SELECT substr(time, 1, 10) AS d, COALESCE(SUM(amount_ml), 0) AS total, COUNT(*) AS feeds FROM baby_feeds WHERE time >= ? GROUP BY 1 ORDER BY 1`
  ).all(d14);
  const deliveryDist = db.prepare(`SELECT delivery_type AS k, COUNT(*) AS c FROM mothers GROUP BY 1 ORDER BY 2 DESC`).all();

  const totals = {
    mothers_in_house: mothers.filter((m) => m.status === '在住').length,
    babies_in_house: babies.filter((b) => b.status === '在住').length,
    mothers_total: mothers.length,
    admissions_30d: db.prepare(`SELECT COUNT(*) AS c FROM mothers WHERE admission_date >= ?`)
      .get(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).c,
    records_total:
      db.prepare(`SELECT (SELECT COUNT(*) FROM baby_feeds) + (SELECT COUNT(*) FROM baby_diapers) +
        (SELECT COUNT(*) FROM baby_vitals) + (SELECT COUNT(*) FROM baby_cares) +
        (SELECT COUNT(*) FROM mother_vitals) AS c`).get().c,
  };

  res.json({
    totals,
    babies,
    mothers,
    trends: { admissions, discharges, milk_daily: milkDaily, delivery_dist: deliveryDist },
    alerts: computeAlerts(),
  });
});

const EXPORT_QUERIES = {
  feeds: `SELECT f.time, m.room, b.name AS baby_name, m.name AS mother_name, f.method, f.amount_ml, f.duration_min, f.notes, f.recorded_by
    FROM baby_feeds f JOIN babies b ON b.id = f.baby_id JOIN mothers m ON m.id = b.mother_id
    WHERE f.time >= ? AND f.time < ? ORDER BY f.time`,
  diapers: `SELECT d.time, m.room, b.name AS baby_name, m.name AS mother_name, d.type, d.stool_color, d.stool_consistency, d.notes, d.recorded_by
    FROM baby_diapers d JOIN babies b ON b.id = d.baby_id JOIN mothers m ON m.id = b.mother_id
    WHERE d.time >= ? AND d.time < ? ORDER BY d.time`,
  baby_vitals: `SELECT v.time, m.room, b.name AS baby_name, m.name AS mother_name, v.temperature_c, v.weight_g, v.jaundice_mg_dl, v.heart_rate, v.resp_rate, v.notes, v.recorded_by
    FROM baby_vitals v JOIN babies b ON b.id = v.baby_id JOIN mothers m ON m.id = b.mother_id
    WHERE v.time >= ? AND v.time < ? ORDER BY v.time`,
  cares: `SELECT c.time, m.room, b.name AS baby_name, m.name AS mother_name, c.care_type, c.notes, c.recorded_by
    FROM baby_cares c JOIN babies b ON b.id = c.baby_id JOIN mothers m ON m.id = b.mother_id
    WHERE c.time >= ? AND c.time < ? ORDER BY c.time`,
  mother_vitals: `SELECT v.time, m.room, m.name AS mother_name, v.temperature_c, v.systolic, v.diastolic, v.pulse, v.lochia_amount, v.lochia_color, v.wound_status, v.breast_status, v.mood_score, v.pain_score, v.notes, v.recorded_by
    FROM mother_vitals v JOIN mothers m ON m.id = v.mother_id
    WHERE v.time >= ? AND v.time < ? ORDER BY v.time`,
};

app.get('/api/admin/records', (req, res) => {
  const { type, from, to } = req.query;
  const sql = EXPORT_QUERIES[type];
  if (!sql) return res.status(400).json({ error: '未知记录类型' });
  const fromIso = from ? `${from}T00:00:00.000Z` : '0000';
  const toIso = to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000).toISOString() : '9999';
  res.json(db.prepare(sql).all(fromIso, toIso));
});

// ---------- 静态资源（生产构建） ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((e, req, res, next) => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.status ? e.message : '服务器内部错误' });
});

export { app };
