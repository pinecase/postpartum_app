// 妈妈日程增强集成测试：时间段、配套剩余次数、只读分享链接
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sched-')), 'test.db');

const { app } = await import('../../server/src/app.js');

let srv: Server;
let BASE = '';

const j = (r: Response) => r.json();
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
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
let apptId = 0;
let pkgId = 0;
let shareToken = '';

describe('日程时间段与总览', () => {
  it('创建产妇与带时间段的安排（11:30–15:00）', async () => {
    const m = await j(await post('/api/mothers', { name: '林太', room: '301', delivery_date: '2026-07-20' }));
    motherId = m.id;
    const r = await post(`/api/mothers/${motherId}/appointments`, {
      date: '2099-01-26', time: '11:30', end_time: '15:00', title: 'Baby 拍摄',
    });
    expect(r.status).toBe(201);
    const a = await j(r);
    apptId = a.id;
    expect(a.end_time).toBe('15:00');
  });

  it('总览里妈妈带下一个安排（不再只有血压）', async () => {
    const ov = await j(await fetch(`${BASE}/api/overview`));
    const room = ov.rooms.find((r: { mother: { id: number } }) => r.mother.id === motherId);
    expect(room.mother.next_appointment.title).toBe('Baby 拍摄');
    expect(room.mother.next_appointment.end_time).toBe('15:00');
  });

  it('可修改时间段', async () => {
    const r = await patch(`/api/appointments/${apptId}`, { end_time: '14:00' });
    expect((await j(r)).end_time).toBe('14:00');
  });
});

describe('配套治疗剩余次数', () => {
  it('添加配套：总 10 次，本子上已用 2 次 → 剩 8', async () => {
    const r = await post(`/api/mothers/${motherId}/packages`, {
      name: '瘦身针灸', total_sessions: 10, used_manual: 2,
    });
    expect(r.status).toBe(201);
    const [p] = await j(r);
    pkgId = p.id;
    expect(p.used).toBe(2);
    expect(p.remaining).toBe(8);
  });

  it('完成一次同名安排后自动扣减 → 剩 7', async () => {
    const a = await j(await post(`/api/mothers/${motherId}/appointments`, {
      date: '2026-07-27', time: '16:45', title: '瘦身针灸',
    }));
    await patch(`/api/appointments/${a.id}`, { status: '已完成' });
    const [p] = await j(await fetch(`${BASE}/api/mothers/${motherId}/packages`));
    expect(p.used_auto).toBe(1);
    expect(p.used).toBe(3);
    expect(p.remaining).toBe(7);
  });

  it('手动 +1 调整 → 剩 6；名称/总次数校验', async () => {
    const list = await j(await patch(`/api/packages/${pkgId}`, { used_manual: 3 }));
    expect(list[0].remaining).toBe(6);
    expect((await post(`/api/mothers/${motherId}/packages`, { name: '', total_sessions: 5 })).status).toBe(400);
    expect((await post(`/api/mothers/${motherId}/packages`, { name: 'x', total_sessions: 0 })).status).toBe(400);
  });

  it('删除配套', async () => {
    expect((await fetch(`${BASE}/api/packages/${pkgId}`, { method: 'DELETE' })).status).toBe(200);
    expect(await j(await fetch(`${BASE}/api/mothers/${motherId}/packages`))).toHaveLength(0);
  });
});

describe('妈妈只读分享链接', () => {
  it('生成分享令牌（重复调用返回同一令牌）', async () => {
    const r1 = await j(await post(`/api/mothers/${motherId}/share-token`, {}));
    const r2 = await j(await post(`/api/mothers/${motherId}/share-token`, {}));
    expect(r1.token).toBeTruthy();
    expect(r2.token).toBe(r1.token);
    shareToken = r1.token;
  });

  it('公开日程页返回妈妈姓名与安排，但不含内部数据', async () => {
    const r = await fetch(`${BASE}/api/public/schedule/${shareToken}`);
    expect(r.status).toBe(200);
    const d = await j(r);
    expect(d.mother.name).toBe('林太');
    expect(d.appointments.length).toBeGreaterThan(0);
    expect(d.appointments[0]).not.toHaveProperty('created_by');
    expect(d).not.toHaveProperty('packages');
  });

  it('错误令牌 404', async () => {
    expect((await fetch(`${BASE}/api/public/schedule/nope`)).status).toBe(404);
  });

  it('设置 PIN 后其他接口上锁，公开日程页仍可访问（妈妈无需登录）', async () => {
    await post('/api/auth/pin', { new_pin: '1357' });
    expect((await fetch(`${BASE}/api/overview`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/public/schedule/${shareToken}`)).status).toBe(200);
  });
});
