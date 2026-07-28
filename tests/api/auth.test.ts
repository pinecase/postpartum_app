// 邮箱账号体系集成测试：首次初始化 → 登录 → 会员管理 → PIN 兜底
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), 'test.db');

const { app } = await import('../../server/src/app.js');

let srv: Server;
let BASE = '';

const j = (r: Response) => r.json();
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const patch = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (url: string, headers: Record<string, string> = {}) => fetch(BASE + url, { headers });

beforeAll(async () => {
  await new Promise<void>((ok) => {
    srv = app.listen(0, () => ok());
  });
  const addr = srv.address();
  BASE = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => srv?.close());

let adminToken = '';
let adminId = 0;
let memberToken = '';
let memberId = 0;

describe('首次初始化', () => {
  it('初始状态：无账号无 PIN，接口开放', async () => {
    const s = await j(await get('/api/auth/status'));
    expect(s.accounts_exist).toBe(false);
    expect(s.pin_set).toBe(false);
    expect((await get('/api/staff')).status).toBe(200);
  });

  it('资料不全或邮箱格式错误返回 400', async () => {
    expect((await post('/api/auth/register-first', { name: '老板', email: '不是邮箱', password: '123456' })).status).toBe(400);
    expect((await post('/api/auth/register-first', { name: '老板', email: 'boss@example.com', password: '123' })).status).toBe(400);
  });

  it('创建第一个管理员并直接登录', async () => {
    const r = await post('/api/auth/register-first', { name: '老板', email: 'Boss@Example.com', password: 'secret6' });
    expect(r.status).toBe(201);
    const body = await j(r);
    expect(body.token).toBeTruthy();
    expect(body.staff.is_admin).toBe(1);
    expect(body.staff.email).toBe('boss@example.com'); // 邮箱统一小写保存
    adminToken = body.token;
    adminId = body.staff.id;
  });

  it('已有账号后不能再次初始化', async () => {
    expect((await post('/api/auth/register-first', { name: '坏人', email: 'x@y.com', password: 'hijack' })).status).toBe(403);
  });
});

describe('登录与会话', () => {
  it('建账号后未登录请求被拒（auth_required）', async () => {
    const r = await get('/api/staff');
    expect(r.status).toBe(401);
    expect((await j(r)).error).toBe('auth_required');
  });

  it('携带会话令牌可访问', async () => {
    expect((await get('/api/staff', { 'X-Auth-Token': adminToken })).status).toBe(200);
  });

  it('密码错误登录失败', async () => {
    expect((await post('/api/auth/login', { email: 'boss@example.com', password: 'wrong!' })).status).toBe(401);
  });

  it('登录成功返回令牌，/api/auth/me 返回本人信息', async () => {
    const r = await post('/api/auth/login', { email: ' BOSS@example.com ', password: 'secret6' });
    expect(r.status).toBe(200);
    const { token, staff } = await j(r);
    expect(staff.name).toBe('老板');
    const me = await j(await get('/api/auth/me', { 'X-Auth-Token': token }));
    expect(me.id).toBe(adminId);
    expect(me.is_admin).toBe(1);
  });

  it('退出后令牌立即失效', async () => {
    const { token } = await j(await post('/api/auth/login', { email: 'boss@example.com', password: 'secret6' }));
    expect((await get('/api/staff', { 'X-Auth-Token': token })).status).toBe(200);
    await post('/api/auth/logout', {}, { 'X-Auth-Token': token });
    expect((await get('/api/staff', { 'X-Auth-Token': token })).status).toBe(401);
  });
});

describe('会员管理（仅管理员）', () => {
  it('管理员添加成员账号；重复邮箱 409', async () => {
    const r = await post('/api/staff/accounts',
      { name: '张敏', email: 'zhangmin@example.com', password: 'nurse66', role: '护士' },
      { 'X-Auth-Token': adminToken });
    expect(r.status).toBe(201);
    memberId = (await j(r)).id;
    expect((await post('/api/staff/accounts',
      { name: '重复', email: 'ZHANGMIN@example.com', password: 'nurse66' },
      { 'X-Auth-Token': adminToken })).status).toBe(409);
  });

  it('成员可登录，但无权访问会员管理', async () => {
    const { token } = await j(await post('/api/auth/login', { email: 'zhangmin@example.com', password: 'nurse66' }));
    memberToken = token;
    expect((await get('/api/staff/full', { 'X-Auth-Token': memberToken })).status).toBe(403);
    expect((await get('/api/staff/full', { 'X-Auth-Token': adminToken })).status).toBe(200);
  });

  it('成员名单含账号信息', async () => {
    const list = await j(await get('/api/staff/full', { 'X-Auth-Token': adminToken }));
    const m = list.find((s: { id: number }) => s.id === memberId);
    expect(m.email).toBe('zhangmin@example.com');
    expect(m.has_password).toBe(1);
  });

  it('重置密码后旧登录全部失效，新密码可登录', async () => {
    const r = await patch(`/api/staff/${memberId}`, { password: 'newpass8' }, { 'X-Auth-Token': adminToken });
    expect(r.status).toBe(200);
    expect((await get('/api/staff', { 'X-Auth-Token': memberToken })).status).toBe(401);
    expect((await post('/api/auth/login', { email: 'zhangmin@example.com', password: 'nurse66' })).status).toBe(401);
    const login = await post('/api/auth/login', { email: 'zhangmin@example.com', password: 'newpass8' });
    expect(login.status).toBe(200);
    memberToken = (await j(login)).token;
  });

  it('停用成员后无法登录，重新启用即恢复', async () => {
    await patch(`/api/staff/${memberId}`, { active: 0 }, { 'X-Auth-Token': adminToken });
    expect((await post('/api/auth/login', { email: 'zhangmin@example.com', password: 'newpass8' })).status).toBe(401);
    await patch(`/api/staff/${memberId}`, { active: 1 }, { 'X-Auth-Token': adminToken });
    expect((await post('/api/auth/login', { email: 'zhangmin@example.com', password: 'newpass8' })).status).toBe(200);
  });

  it('不能停用/降权最后一名管理员', async () => {
    expect((await patch(`/api/staff/${adminId}`, { is_admin: 0 }, { 'X-Auth-Token': adminToken })).status).toBe(400);
    expect((await patch(`/api/staff/${adminId}`, { active: 0 }, { 'X-Auth-Token': adminToken })).status).toBe(400);
  });
});

describe('PIN 兜底', () => {
  it('已有账号后，未登录者不能设置 PIN（防绕过）', async () => {
    expect((await post('/api/auth/pin', { new_pin: '9999' })).status).toBe(403);
  });

  it('管理员设置 PIN 后，X-Pin 可作共用入口', async () => {
    expect((await post('/api/auth/pin', { new_pin: '2468' }, { 'X-Auth-Token': adminToken })).status).toBe(200);
    expect((await get('/api/staff', { 'X-Pin': '2468' })).status).toBe(200);
    expect((await get('/api/staff', { 'X-Pin': '0000' })).status).toBe(401);
  });
});
