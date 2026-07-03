import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { computeAlerts } from './alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

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
  res.json({ ...m, babies, vitals, tasks });
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
    wound_status, breast_status, mood_score, pain_score, notes, recorded_by,
  } = req.body;
  const r = db.prepare(`
    INSERT INTO mother_vitals (mother_id, time, temperature_c, systolic, diastolic, pulse, lochia_amount, lochia_color, wound_status, breast_status, mood_score, pain_score, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(m.id, time || nowIso(), temperature_c ?? null, systolic ?? null, diastolic ?? null,
      pulse ?? null, lochia_amount ?? null, lochia_color ?? null, wound_status ?? null,
      breast_status ?? null, mood_score ?? null, pain_score ?? null, notes ?? null, recorded_by ?? null);
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
  res.json({ ...b, feeds, diapers, vitals, cares, tasks });
});

const babyExists = (id) => db.prepare(`SELECT id FROM babies WHERE id = ?`).get(id);

app.post('/api/babies/:id/feeds', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, method, amount_ml, duration_min, notes, recorded_by } = req.body;
  if (!method) return res.status(400).json({ error: '喂养方式必填' });
  const r = db.prepare(`
    INSERT INTO baby_feeds (baby_id, time, method, amount_ml, duration_min, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), method, amount_ml ?? null, duration_min ?? null, notes ?? null, recorded_by ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM baby_feeds WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/diapers', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, type, stool_color, stool_consistency, notes, recorded_by } = req.body;
  if (!type) return res.status(400).json({ error: '类型必填' });
  const r = db.prepare(`
    INSERT INTO baby_diapers (baby_id, time, type, stool_color, stool_consistency, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), type, stool_color ?? null, stool_consistency ?? null, notes ?? null, recorded_by ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM baby_diapers WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/vitals', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, notes, recorded_by } = req.body;
  const r = db.prepare(`
    INSERT INTO baby_vitals (baby_id, time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), temperature_c ?? null, weight_g ?? null, jaundice_mg_dl ?? null,
      heart_rate ?? null, resp_rate ?? null, notes ?? null, recorded_by ?? null);
  res.status(201).json(db.prepare(`SELECT * FROM baby_vitals WHERE id = ?`).get(r.lastInsertRowid));
});

app.post('/api/babies/:id/cares', (req, res) => {
  if (!babyExists(req.params.id)) return res.status(404).json({ error: '未找到宝宝' });
  const { time, care_type, notes, recorded_by } = req.body;
  if (!care_type) return res.status(400).json({ error: '护理项目必填' });
  const r = db.prepare(`
    INSERT INTO baby_cares (baby_id, time, care_type, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?)`)
    .run(req.params.id, time || nowIso(), care_type, notes ?? null, recorded_by ?? null);
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
  res.json(
    rows.map((t) => {
      const s = t.subject_type === 'mother' ? motherName.get(t.subject_id) : babyName.get(t.subject_id);
      return { ...t, subject_name: s?.name ?? '—', room: s?.room ?? '—' };
    })
  );
});

app.post('/api/tasks', (req, res) => {
  const { subject_type, subject_id, due_time, title, detail, created_by } = req.body;
  if (!subject_type || !subject_id || !title) {
    return res.status(400).json({ error: '对象与任务标题必填' });
  }
  const r = db.prepare(`
    INSERT INTO care_tasks (subject_type, subject_id, due_time, title, detail, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(subject_type, subject_id, due_time || nowIso(), title, detail ?? null, created_by ?? null);
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
  res.json(db.prepare(`SELECT * FROM care_tasks WHERE id = ?`).get(t.id));
});

// ---------- 交接班 ----------
app.get('/api/handovers', (req, res) => {
  res.json(db.prepare(`SELECT * FROM handovers ORDER BY date DESC, created_at DESC LIMIT 100`).all());
});

app.post('/api/handovers', (req, res) => {
  const { date, shift, author, content } = req.body;
  if (!shift || !author || !content) return res.status(400).json({ error: '班次、记录人、内容必填' });
  const r = db.prepare(`INSERT INTO handovers (date, shift, author, content, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(date || todayStr(), shift, author, content, nowIso());
  res.status(201).json(db.prepare(`SELECT * FROM handovers WHERE id = ?`).get(r.lastInsertRowid));
});

// ---------- 静态资源（生产构建） ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`月子中心护理记录系统已启动: http://localhost:${PORT}`));
