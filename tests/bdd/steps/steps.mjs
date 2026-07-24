// Gherkin 步骤实现：启动真实 Express 应用 + 临时 SQLite
import { Given, When, Then, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

setDefaultTimeout(15000);

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bdd-')), 'test.db');
const { app } = await import('../../../server/src/app.js');

let srv;
let BASE = '';
let PIN = null;
const babyIds = {};
const motherIds = {};

const hdr = () => (PIN ? { 'X-Pin': PIN } : {});
const get = (url) => fetch(BASE + url, { headers: hdr() }).then((r) => r.json());
const post = (url, body) =>
  fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdr() },
    body: JSON.stringify(body),
  });
const patch = (url, body) =>
  fetch(BASE + url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...hdr() },
    body: JSON.stringify(body),
  });

BeforeAll(async () => {
  await new Promise((ok) => {
    srv = app.listen(0, ok);
  });
  BASE = `http://127.0.0.1:${srv.address().port}`;
});

AfterAll(() => srv?.close());

Given('产妇 {string} 携宝宝 {string} 入住 {string} 房', async (mother, baby, room) => {
  const r = await post('/api/mothers', {
    name: mother,
    room,
    delivery_date: new Date().toISOString().slice(0, 10),
    babies: [{ name: baby, sex: '女', birth_weight_g: 3200 }],
  });
  assert.equal(r.status, 201);
  const m = await r.json();
  motherIds[mother] = m.id;
  const detail = await get(`/api/mothers/${m.id}`);
  babyIds[baby] = detail.babies[0].id;
});

When('为宝宝 {string} 记录一次 {string} 喂养 {int} ml', async (baby, method, ml) => {
  const r = await post(`/api/babies/${babyIds[baby]}/feeds`, {
    method,
    amount_ml: ml,
    recorded_by: '测试护士',
  });
  assert.equal(r.status, 201);
});

When('为宝宝 {string} 记录黄疸 {int} mg\\/dL', async (baby, value) => {
  const r = await post(`/api/babies/${babyIds[baby]}/vitals`, { jaundice_mg_dl: value });
  assert.equal(r.status, 201);
});

When('把宝宝 {string} 最新一条喂养记录的奶量改为 {int} ml', async (baby, ml) => {
  const detail = await get(`/api/babies/${babyIds[baby]}`);
  const latest = detail.feeds[0];
  const r = await patch(`/api/records/feeds/${latest.id}`, { amount_ml: ml });
  assert.equal(r.status, 200);
});

When('为产妇 {string} 办理离所', async (mother) => {
  const r = await patch(`/api/mothers/${motherIds[mother]}`, { status: '已离所' });
  assert.equal(r.status, 200);
});

Then('总览中应有 {int} 对在住母婴', async (n) => {
  const o = await get('/api/overview');
  assert.equal(o.rooms.length, n);
});

Then('宝宝 {string} 的喂养记录应有 {int} 条', async (baby, n) => {
  const detail = await get(`/api/babies/${babyIds[baby]}`);
  assert.equal(detail.feeds.length, n);
});

Then('总览中宝宝 {string} 的今日奶量应为 {int} ml', async (baby, ml) => {
  const o = await get('/api/overview');
  const row = o.rooms.flatMap((r) => r.babies).find((b) => b.id === babyIds[baby]);
  assert.equal(row.milk_today, ml);
});

Then('预警列表应包含宝宝 {string} 的 {string} 级预警', async (baby, level) => {
  const o = await get('/api/overview');
  const hit = o.alerts.find(
    (a) => a.subject_type === 'baby' && a.subject_id === babyIds[baby] && a.level === level
  );
  assert.ok(hit, `未找到 ${baby} 的 ${level} 预警，现有: ${JSON.stringify(o.alerts)}`);
});

Then('宝宝 {string} 最新一条喂养记录的奶量应为 {int} ml', async (baby, ml) => {
  const detail = await get(`/api/babies/${babyIds[baby]}`);
  assert.equal(detail.feeds[0].amount_ml, ml);
});

// ---- 访问码 ----
Given('管理员将访问码设置为 {string}', async (pin) => {
  const r = await post('/api/auth/pin', { old_pin: PIN, new_pin: pin });
  assert.equal(r.status, 200);
  PIN = pin;
});

Then('不带访问码请求员工列表应返回 {int}', async (code) => {
  const r = await fetch(`${BASE}/api/staff`);
  assert.equal(r.status, code);
});

Then('带访问码 {string} 请求员工列表应返回 {int}', async (pin, code) => {
  const r = await fetch(`${BASE}/api/staff`, { headers: { 'X-Pin': pin } });
  assert.equal(r.status, code);
});

Then('用旧码 {string} 把访问码改为 {string} 应返回 {int}', async (oldPin, newPin, code) => {
  const r = await post('/api/auth/pin', { old_pin: oldPin, new_pin: newPin });
  assert.equal(r.status, code);
});
