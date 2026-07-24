// API 集成测试：启动真实 Express 应用 + 临时 SQLite，覆盖主要接口行为
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'api-')), 'test.db');

const { app } = await import('../../server/src/app.js');

let srv: Server;
let BASE = '';

const j = (r: Response) => r.json();
const post = (url: string, body: unknown) =>
  fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url: string, body: unknown) =>
  fetch(BASE + url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  await new Promise<void>((ok) => {
    srv = app.listen(0, () => ok());
  });
  const addr = srv.address();
  BASE = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => srv?.close());

let motherId = 0;
let babyId = 0;
let feedId = 0;

describe('入住与档案', () => {
  it('创建产妇与双胞胎宝宝', async () => {
    const r = await post('/api/mothers', {
      name: '陈太', room: '902', delivery_date: '2026-07-05', delivery_type: '剖宫产',
      babies: [
        { name: '大宝', sex: '男', birth_weight_g: 2800 },
        { name: '小宝', sex: '女', birth_weight_g: 2600 },
      ],
    });
    expect(r.status).toBe(201);
    const m = await j(r);
    motherId = m.id;
    const detail = await j(await fetch(`${BASE}/api/mothers/${motherId}`));
    expect(detail.babies).toHaveLength(2);
    babyId = detail.babies[0].id;
  });

  it('缺少必填字段返回 400', async () => {
    expect((await post('/api/mothers', { name: '无房间' })).status).toBe(400);
  });
});

describe('护理记录 CRUD', () => {
  it('喂养记录：创建（含照片）→ 档案可见 → 编辑 → 删除', async () => {
    const r = await post(`/api/babies/${babyId}/feeds`, {
      method: '配方奶', amount_ml: 60, recorded_by: '张敏',
      photos: [{ data: 'aGVsbG8=', mime: 'image/jpeg' }],
    });
    expect(r.status).toBe(201);
    feedId = (await j(r)).id;

    const detail = await j(await fetch(`${BASE}/api/babies/${babyId}`));
    expect(detail.feeds).toHaveLength(1);
    expect(detail.photos.filter((p: { record_type: string }) => p.record_type === 'feeds')).toHaveLength(1);

    const pr = await patch(`/api/records/feeds/${feedId}`, { amount_ml: 75 });
    expect(pr.status).toBe(200);
    expect((await j(pr)).amount_ml).toBe(75);

    const dr = await fetch(`${BASE}/api/records/feeds/${feedId}`, { method: 'DELETE' });
    expect(dr.status).toBe(200);
    const after = await j(await fetch(`${BASE}/api/babies/${babyId}`));
    expect(after.feeds).toHaveLength(0);
    expect(after.photos).toHaveLength(0); // 删除记录连带删除照片
  });

  it('喂养方式必填', async () => {
    expect((await post(`/api/babies/${babyId}/feeds`, { amount_ml: 50 })).status).toBe(400);
  });

  it('体征记录支持 SpO₂', async () => {
    const r = await post(`/api/babies/${babyId}/vitals`, { spo2: 97, heart_rate: 138 });
    expect(r.status).toBe(201);
    expect((await j(r)).spo2).toBe(97);
  });

  it('照片超限返回 413', async () => {
    const big = 'x'.repeat(700_000);
    const r = await post(`/api/babies/${babyId}/diapers`, { type: '尿', photos: [{ data: big }] });
    expect(r.status).toBe(413);
  });
});

describe('任务', () => {
  it('创建任务（含内部备注）→ 列表含 subject 信息 → 编辑 → 完成 → 删除', async () => {
    const r = await post('/api/tasks', {
      subject_type: 'baby', subject_id: babyId, title: '喂奶时间',
      detail: '配方奶、奶量 60ml', internal_note: '妈妈要求少喂', created_by: '张敏',
    });
    expect(r.status).toBe(201);
    const task = await j(r);
    expect(task.internal_note).toBe('妈妈要求少喂');

    const list = await j(await fetch(`${BASE}/api/tasks?status=待办`));
    const row = list.find((t: { id: number }) => t.id === task.id);
    expect(row.subject_name).toBe('大宝');
    expect(row.room).toBe('902');

    await patch(`/api/tasks/${task.id}`, { detail: '改为 50ml' });
    await patch(`/api/tasks/${task.id}`, { status: '已完成', completed_by: '李静' });
    const done = await j(await fetch(`${BASE}/api/tasks?status=已完成`));
    const drow = done.find((t: { id: number }) => t.id === task.id);
    expect(drow.detail).toBe('改为 50ml');
    expect(drow.completed_by).toBe('李静');

    expect((await fetch(`${BASE}/api/tasks/${task.id}`, { method: 'DELETE' })).status).toBe(200);
  });
});

describe('日报（Daily Report）', () => {
  it('创建可关联房号/妈妈/宝宝，列表返回', async () => {
    const r = await post('/api/handovers', {
      shift: 'AM班', author: '张敏', content: '902 大宝平稳',
      room: '902', mother_name: '陈太', baby_name: '大宝',
    });
    expect(r.status).toBe(201);
    const list = await j(await fetch(`${BASE}/api/handovers`));
    expect(list[0].room).toBe('902');
    expect(list[0].baby_name).toBe('大宝');
  });
});

describe('管理后台', () => {
  it('summary 汇总在住数量与宝宝行', async () => {
    const s = await j(await fetch(`${BASE}/api/admin/summary`));
    expect(s.totals.mothers_in_house).toBe(1);
    expect(s.babies.length).toBe(2);
  });

  it('明细导出未知类型返回 400', async () => {
    expect((await fetch(`${BASE}/api/admin/records?type=nope`)).status).toBe(400);
  });
});

describe('访问 PIN（放最后，设置后影响其它接口）', () => {
  it('设置 PIN → 无码 401 → 带码 200 → 错误旧码改码 403', async () => {
    expect((await post('/api/auth/pin', { new_pin: '4321' })).status).toBe(200);
    expect((await fetch(`${BASE}/api/staff`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/staff`, { headers: { 'X-Pin': '4321' } })).status).toBe(200);
    expect((await post('/api/auth/verify', { pin: '0000' }).then(j)).ok).toBe(false);
    expect((await post('/api/auth/pin', { old_pin: '9999', new_pin: '1111' })).status).toBe(403);
  });

  it('PIN 格式必须为 4-8 位数字', async () => {
    expect((await post('/api/auth/pin', { old_pin: '4321', new_pin: 'abc' })).status).toBe(400);
  });
});
