import { Hono } from 'hono';
import { computeAlerts } from './alerts.js';

// Cloudflare Workers + D1 版 API（与 server/src/index.js 的 Express 版行为一致）
const app = new Hono();

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const dayStartIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const err = (c, status, message) => c.json({ error: message }, status);

// ---------- 照片 ----------
const MAX_PHOTOS_PER_RECORD = 3;
const MAX_PHOTO_B64_LEN = 600_000; // ≈450KB 二进制，客户端压缩后远小于此

async function savePhotos(db, recordType, recordId, photos, recordedBy) {
  if (!Array.isArray(photos) || !photos.length) return;
  const stmts = [];
  for (const p of photos.slice(0, MAX_PHOTOS_PER_RECORD)) {
    if (!p || typeof p.data !== 'string' || !p.data) continue;
    if (p.data.length > MAX_PHOTO_B64_LEN) {
      const e = new Error('照片过大，请重试');
      e.status = 413;
      throw e;
    }
    stmts.push(
      db.prepare(
        `INSERT INTO photos (record_type, record_id, created_at, mime, data, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(recordType, recordId, nowIso(), p.mime || 'image/jpeg', p.data, recordedBy ?? null)
    );
  }
  if (stmts.length) await db.batch(stmts);
}

const photoRefs = async (db, recordType, subQuerySql, subQueryParam) =>
  (
    await db
      .prepare(`SELECT id, record_type, record_id FROM photos WHERE record_type = ? AND record_id IN (${subQuerySql})`)
      .bind(recordType, subQueryParam)
      .all()
  ).results;

app.get('/api/photos/:id', async (c) => {
  const p = await c.env.DB.prepare(`SELECT * FROM photos WHERE id = ?`).bind(c.req.param('id')).first();
  if (!p) return err(c, 404, '未找到照片');
  return c.json(p);
});

// ---------- 员工 ----------
app.get('/api/staff', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM staff WHERE active = 1 ORDER BY id`).all();
  return c.json(results);
});

app.post('/api/staff', async (c) => {
  const { name, role = '护士' } = await c.req.json();
  if (!name) return err(c, 400, '姓名必填');
  const r = await c.env.DB.prepare(`INSERT INTO staff (name, role) VALUES (?, ?)`).bind(name, role).run();
  const row = await c.env.DB.prepare(`SELECT * FROM staff WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

// ---------- 总览 ----------
app.get('/api/overview', async (c) => {
  const db = c.env.DB;
  const mothers = (await db.prepare(`SELECT * FROM mothers WHERE status = '在住' ORDER BY room`).all()).results;
  const dayStart = dayStartIso();

  const rooms = [];
  for (const m of mothers) {
    const latestVital = await db
      .prepare(`SELECT * FROM mother_vitals WHERE mother_id = ? ORDER BY time DESC LIMIT 1`)
      .bind(m.id)
      .first();
    const babies = (
      await db.prepare(`SELECT * FROM babies WHERE mother_id = ? AND status = '在住'`).bind(m.id).all()
    ).results;

    const babyRows = [];
    for (const b of babies) {
      const [bv, lf, ft, dt] = await db.batch([
        db.prepare(`SELECT * FROM baby_vitals WHERE baby_id = ? ORDER BY time DESC LIMIT 1`).bind(b.id),
        db.prepare(`SELECT * FROM baby_feeds WHERE baby_id = ? ORDER BY time DESC LIMIT 1`).bind(b.id),
        db.prepare(`SELECT COUNT(*) AS c FROM baby_feeds WHERE baby_id = ? AND time >= ?`).bind(b.id, dayStart),
        db.prepare(`SELECT COUNT(*) AS c FROM baby_diapers WHERE baby_id = ? AND time >= ?`).bind(b.id, dayStart),
      ]);
      babyRows.push({
        ...b,
        latest_vital: bv.results[0] || null,
        last_feed: lf.results[0] || null,
        feeds_today: ft.results[0].c,
        diapers_today: dt.results[0].c,
      });
    }
    rooms.push({ mother: { ...m, latest_vital: latestVital || null }, babies: babyRows });
  }

  const pendingTasks = (
    await c.env.DB.prepare(`SELECT * FROM care_tasks WHERE status = '待办' ORDER BY due_time LIMIT 50`).all()
  ).results;

  return c.json({
    rooms,
    alerts: await computeAlerts(c.env.DB),
    pending_tasks: pendingTasks,
    stats: {
      mothers_in_house: mothers.length,
      babies_in_house: rooms.reduce((s, r) => s + r.babies.length, 0),
      pending_task_count: pendingTasks.length,
    },
  });
});

// ---------- 产妇 ----------
app.get('/api/mothers', async (c) => {
  const status = c.req.query('status');
  const rows = status
    ? await c.env.DB.prepare(`SELECT * FROM mothers WHERE status = ? ORDER BY room`).bind(status).all()
    : await c.env.DB.prepare(`SELECT * FROM mothers ORDER BY status, room`).all();
  return c.json(rows.results);
});

app.post('/api/mothers', async (c) => {
  const body = await c.req.json();
  const {
    name, age, room, admission_date, expected_discharge_date,
    delivery_date, delivery_type = '顺产', parity, feeding_plan, allergies, notes,
    babies = [],
  } = body;
  if (!name || !room || !delivery_date) return err(c, 400, '姓名、房间、分娩日期必填');

  const r = await c.env.DB.prepare(
    `INSERT INTO mothers (name, age, room, admission_date, expected_discharge_date, delivery_date, delivery_type, parity, feeding_plan, allergies, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(name, age ?? null, room, admission_date || todayStr(), expected_discharge_date ?? null,
      delivery_date, delivery_type, parity ?? null, feeding_plan ?? null, allergies ?? null, notes ?? null)
    .run();
  const motherId = r.meta.last_row_id;

  if (babies.length) {
    await c.env.DB.batch(
      babies.map((b) =>
        c.env.DB.prepare(
          `INSERT INTO babies (mother_id, name, sex, birth_date, birth_weight_g, gestational_age_weeks, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          motherId, b.name || `${name}之宝`, b.sex || '女', b.birth_date || delivery_date,
          b.birth_weight_g ?? null, b.gestational_age_weeks ?? null, b.notes ?? null
        )
      )
    );
  }
  const row = await c.env.DB.prepare(`SELECT * FROM mothers WHERE id = ?`).bind(motherId).first();
  return c.json(row, 201);
});

app.get('/api/mothers/:id', async (c) => {
  const id = c.req.param('id');
  const m = await c.env.DB.prepare(`SELECT * FROM mothers WHERE id = ?`).bind(id).first();
  if (!m) return err(c, 404, '未找到产妇');
  const [babies, vitals, tasks] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM babies WHERE mother_id = ?`).bind(m.id),
    c.env.DB.prepare(`SELECT * FROM mother_vitals WHERE mother_id = ? ORDER BY time DESC LIMIT 200`).bind(m.id),
    c.env.DB.prepare(`SELECT * FROM care_tasks WHERE subject_type = 'mother' AND subject_id = ? ORDER BY due_time DESC LIMIT 50`).bind(m.id),
  ]);
  const photos = await photoRefs(c.env.DB, 'mother_vitals', `SELECT id FROM mother_vitals WHERE mother_id = ?`, m.id);
  return c.json({ ...m, babies: babies.results, vitals: vitals.results, tasks: tasks.results, photos });
});

app.patch('/api/mothers/:id', async (c) => {
  const id = c.req.param('id');
  const m = await c.env.DB.prepare(`SELECT * FROM mothers WHERE id = ?`).bind(id).first();
  if (!m) return err(c, 404, '未找到产妇');
  const body = await c.req.json();
  const allowed = ['room', 'expected_discharge_date', 'feeding_plan', 'allergies', 'notes', 'status'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in body) {
      sets.push(`${k} = ?`);
      vals.push(body[k]);
    }
  }
  if (body.status === '已离所') {
    sets.push(`discharged_at = ?`);
    vals.push(nowIso());
    await c.env.DB.prepare(`UPDATE babies SET status = '已离所' WHERE mother_id = ?`).bind(m.id).run();
  }
  if (!sets.length) return err(c, 400, '无可更新字段');
  await c.env.DB.prepare(`UPDATE mothers SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, m.id).run();
  const row = await c.env.DB.prepare(`SELECT * FROM mothers WHERE id = ?`).bind(m.id).first();
  return c.json(row);
});

app.post('/api/mothers/:id/vitals', async (c) => {
  const id = c.req.param('id');
  const m = await c.env.DB.prepare(`SELECT id FROM mothers WHERE id = ?`).bind(id).first();
  if (!m) return err(c, 404, '未找到产妇');
  const b = await c.req.json();
  const r = await c.env.DB.prepare(
    `INSERT INTO mother_vitals (mother_id, time, temperature_c, systolic, diastolic, pulse, lochia_amount, lochia_color, wound_status, breast_status, mood_score, pain_score, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(m.id, b.time || nowIso(), b.temperature_c ?? null, b.systolic ?? null, b.diastolic ?? null,
      b.pulse ?? null, b.lochia_amount ?? null, b.lochia_color ?? null, b.wound_status ?? null,
      b.breast_status ?? null, b.mood_score ?? null, b.pain_score ?? null, b.notes ?? null, b.recorded_by ?? null)
    .run();
  await savePhotos(c.env.DB, 'mother_vitals', r.meta.last_row_id, b.photos, b.recorded_by);
  const row = await c.env.DB.prepare(`SELECT * FROM mother_vitals WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

// ---------- 宝宝 ----------
app.get('/api/babies/:id', async (c) => {
  const id = c.req.param('id');
  const b = await c.env.DB.prepare(
    `SELECT b.*, m.name AS mother_name, m.room FROM babies b JOIN mothers m ON m.id = b.mother_id WHERE b.id = ?`
  ).bind(id).first();
  if (!b) return err(c, 404, '未找到宝宝');
  const [feeds, diapers, vitals, cares, tasks] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM baby_feeds WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).bind(b.id),
    c.env.DB.prepare(`SELECT * FROM baby_diapers WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).bind(b.id),
    c.env.DB.prepare(`SELECT * FROM baby_vitals WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).bind(b.id),
    c.env.DB.prepare(`SELECT * FROM baby_cares WHERE baby_id = ? ORDER BY time DESC LIMIT 300`).bind(b.id),
    c.env.DB.prepare(`SELECT * FROM care_tasks WHERE subject_type = 'baby' AND subject_id = ? ORDER BY due_time DESC LIMIT 50`).bind(b.id),
  ]);
  const photos = [
    ...(await photoRefs(c.env.DB, 'feeds', `SELECT id FROM baby_feeds WHERE baby_id = ?`, b.id)),
    ...(await photoRefs(c.env.DB, 'diapers', `SELECT id FROM baby_diapers WHERE baby_id = ?`, b.id)),
    ...(await photoRefs(c.env.DB, 'vitals', `SELECT id FROM baby_vitals WHERE baby_id = ?`, b.id)),
    ...(await photoRefs(c.env.DB, 'cares', `SELECT id FROM baby_cares WHERE baby_id = ?`, b.id)),
  ];
  return c.json({
    ...b,
    feeds: feeds.results, diapers: diapers.results, vitals: vitals.results,
    cares: cares.results, tasks: tasks.results, photos,
  });
});

const babyExists = async (db, id) => db.prepare(`SELECT id FROM babies WHERE id = ?`).bind(id).first();

app.post('/api/babies/:id/feeds', async (c) => {
  const id = c.req.param('id');
  if (!(await babyExists(c.env.DB, id))) return err(c, 404, '未找到宝宝');
  const b = await c.req.json();
  if (!b.method) return err(c, 400, '喂养方式必填');
  const r = await c.env.DB.prepare(
    `INSERT INTO baby_feeds (baby_id, time, method, amount_ml, duration_min, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, b.time || nowIso(), b.method, b.amount_ml ?? null, b.duration_min ?? null, b.notes ?? null, b.recorded_by ?? null)
    .run();
  await savePhotos(c.env.DB, 'feeds', r.meta.last_row_id, b.photos, b.recorded_by);
  const row = await c.env.DB.prepare(`SELECT * FROM baby_feeds WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

app.post('/api/babies/:id/diapers', async (c) => {
  const id = c.req.param('id');
  if (!(await babyExists(c.env.DB, id))) return err(c, 404, '未找到宝宝');
  const b = await c.req.json();
  if (!b.type) return err(c, 400, '类型必填');
  const r = await c.env.DB.prepare(
    `INSERT INTO baby_diapers (baby_id, time, type, stool_color, stool_consistency, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, b.time || nowIso(), b.type, b.stool_color ?? null, b.stool_consistency ?? null, b.notes ?? null, b.recorded_by ?? null)
    .run();
  await savePhotos(c.env.DB, 'diapers', r.meta.last_row_id, b.photos, b.recorded_by);
  const row = await c.env.DB.prepare(`SELECT * FROM baby_diapers WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

app.post('/api/babies/:id/vitals', async (c) => {
  const id = c.req.param('id');
  if (!(await babyExists(c.env.DB, id))) return err(c, 404, '未找到宝宝');
  const b = await c.req.json();
  const r = await c.env.DB.prepare(
    `INSERT INTO baby_vitals (baby_id, time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, b.time || nowIso(), b.temperature_c ?? null, b.weight_g ?? null, b.jaundice_mg_dl ?? null,
      b.heart_rate ?? null, b.resp_rate ?? null, b.notes ?? null, b.recorded_by ?? null)
    .run();
  await savePhotos(c.env.DB, 'vitals', r.meta.last_row_id, b.photos, b.recorded_by);
  const row = await c.env.DB.prepare(`SELECT * FROM baby_vitals WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

app.post('/api/babies/:id/cares', async (c) => {
  const id = c.req.param('id');
  if (!(await babyExists(c.env.DB, id))) return err(c, 404, '未找到宝宝');
  const b = await c.req.json();
  if (!b.care_type) return err(c, 400, '护理项目必填');
  const r = await c.env.DB.prepare(
    `INSERT INTO baby_cares (baby_id, time, care_type, notes, recorded_by) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, b.time || nowIso(), b.care_type, b.notes ?? null, b.recorded_by ?? null)
    .run();
  await savePhotos(c.env.DB, 'cares', r.meta.last_row_id, b.photos, b.recorded_by);
  const row = await c.env.DB.prepare(`SELECT * FROM baby_cares WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

// ---------- 护理任务 ----------
app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  const rows = status
    ? (await c.env.DB.prepare(`SELECT * FROM care_tasks WHERE status = ? ORDER BY due_time`).bind(status).all()).results
    : (await c.env.DB.prepare(`SELECT * FROM care_tasks ORDER BY status DESC, due_time`).all()).results;

  const out = [];
  for (const t of rows) {
    const s =
      t.subject_type === 'mother'
        ? await c.env.DB.prepare(`SELECT name, room FROM mothers WHERE id = ?`).bind(t.subject_id).first()
        : await c.env.DB.prepare(
            `SELECT b.name, m.room FROM babies b JOIN mothers m ON m.id = b.mother_id WHERE b.id = ?`
          ).bind(t.subject_id).first();
    out.push({ ...t, subject_name: s?.name ?? '—', room: s?.room ?? '—' });
  }
  return c.json(out);
});

app.post('/api/tasks', async (c) => {
  const b = await c.req.json();
  if (!b.subject_type || !b.subject_id || !b.title) return err(c, 400, '对象与任务标题必填');
  const r = await c.env.DB.prepare(
    `INSERT INTO care_tasks (subject_type, subject_id, due_time, title, detail, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(b.subject_type, b.subject_id, b.due_time || nowIso(), b.title, b.detail ?? null, b.created_by ?? null)
    .run();
  const row = await c.env.DB.prepare(`SELECT * FROM care_tasks WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

app.patch('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const t = await c.env.DB.prepare(`SELECT * FROM care_tasks WHERE id = ?`).bind(id).first();
  if (!t) return err(c, 404, '未找到任务');
  const b = await c.req.json();
  if (b.status === '已完成') {
    await c.env.DB.prepare(`UPDATE care_tasks SET status = '已完成', completed_by = ?, completed_at = ? WHERE id = ?`)
      .bind(b.completed_by ?? null, nowIso(), t.id)
      .run();
  } else if (b.status === '待办') {
    await c.env.DB.prepare(`UPDATE care_tasks SET status = '待办', completed_by = NULL, completed_at = NULL WHERE id = ?`)
      .bind(t.id)
      .run();
  }
  const row = await c.env.DB.prepare(`SELECT * FROM care_tasks WHERE id = ?`).bind(t.id).first();
  return c.json(row);
});

// ---------- 交接班 ----------
app.get('/api/handovers', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM handovers ORDER BY date DESC, created_at DESC LIMIT 100`
  ).all();
  return c.json(results);
});

app.post('/api/handovers', async (c) => {
  const b = await c.req.json();
  if (!b.shift || !b.author || !b.content) return err(c, 400, '班次、记录人、内容必填');
  const r = await c.env.DB.prepare(
    `INSERT INTO handovers (date, shift, author, content, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(b.date || todayStr(), b.shift, b.author, b.content, nowIso())
    .run();
  const row = await c.env.DB.prepare(`SELECT * FROM handovers WHERE id = ?`).bind(r.meta.last_row_id).first();
  return c.json(row, 201);
});

app.notFound((c) => err(c, 404, '接口不存在'));
app.onError((e, c) => {
  console.error(e);
  return err(c, e.status || 500, e.status ? e.message : '服务器内部错误');
});

export default app;
