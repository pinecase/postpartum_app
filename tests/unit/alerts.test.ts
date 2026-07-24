// 预警规则测试：跑在真实 SQLite 上（与 D1 同一套 SQL 方言）
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-')), 'test.db');

const { db } = await import('../../server/src/db.js');
const { computeAlerts } = await import('../../server/src/alerts.js');

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

beforeAll(() => {
  db.prepare(
    `INSERT INTO mothers (id, name, room, admission_date, delivery_date) VALUES (1, '测试妈', '901', '2026-07-01', '2026-07-01')`
  ).run();
  db.prepare(
    `INSERT INTO babies (id, mother_id, name, birth_date, birth_weight_g) VALUES (1, 1, '测试宝', '2026-07-01', 3000)`
  ).run();
});

describe('宝宝预警规则', () => {
  it('黄疸 ≥15 触发 danger，≥12 触发 warning', () => {
    db.prepare(`INSERT INTO baby_vitals (baby_id, time, jaundice_mg_dl) VALUES (1, ?, 16)`).run(hoursAgo(1));
    let alerts = computeAlerts();
    expect(alerts.find((a: { code: string }) => a.code === 'jaundice_danger')).toBeTruthy();

    db.prepare(`INSERT INTO baby_vitals (baby_id, time, jaundice_mg_dl) VALUES (1, ?, 13)`).run(hoursAgo(0.5));
    alerts = computeAlerts();
    expect(alerts.find((a: { code: string }) => a.code === 'jaundice_warning')).toBeTruthy();
    expect(alerts.find((a: { code: string }) => a.code === 'jaundice_danger')).toBeFalsy();
  });

  it('体温 ≥37.5 触发 danger', () => {
    db.prepare(`INSERT INTO baby_vitals (baby_id, time, temperature_c) VALUES (1, ?, 37.8)`).run(hoursAgo(0.2));
    const a = computeAlerts().find((x: { code: string }) => x.code === 'baby_temp_high');
    expect(a).toBeTruthy();
    expect(a.level).toBe('danger');
  });

  it('体重较出生下降 ≥10% 触发 danger', () => {
    db.prepare(`INSERT INTO baby_vitals (baby_id, time, weight_g) VALUES (1, ?, 2650)`).run(hoursAgo(0.1));
    expect(computeAlerts().find((x: { code: string }) => x.code === 'weight_drop')).toBeTruthy();
  });

  it('超 4 小时未喂养触发 warning；喂过后消除', () => {
    db.prepare(`INSERT INTO baby_feeds (baby_id, time, method) VALUES (1, ?, '配方奶')`).run(hoursAgo(6));
    expect(computeAlerts().find((x: { code: string }) => x.code === 'feed_gap')).toBeTruthy();

    db.prepare(`INSERT INTO baby_feeds (baby_id, time, method) VALUES (1, ?, '配方奶')`).run(hoursAgo(1));
    expect(computeAlerts().find((x: { code: string }) => x.code === 'feed_gap')).toBeFalsy();
  });
});

describe('产妇预警规则', () => {
  it('血压 ≥140/90 触发 danger', () => {
    db.prepare(
      `INSERT INTO mother_vitals (mother_id, time, systolic, diastolic) VALUES (1, ?, 145, 88)`
    ).run(hoursAgo(0.1));
    expect(computeAlerts().find((x: { code: string }) => x.code === 'bp_high')).toBeTruthy();
  });

  it('danger 级排在 warning 之前', () => {
    const alerts = computeAlerts();
    const firstWarning = alerts.findIndex((a: { level: string }) => a.level === 'warning');
    const lastDanger = alerts.map((a: { level: string }) => a.level).lastIndexOf('danger');
    if (firstWarning !== -1 && lastDanger !== -1) {
      expect(lastDanger).toBeLessThan(firstWarning);
    }
  });
});
