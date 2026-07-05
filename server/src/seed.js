import { db } from './db.js';
import { buildSeedStatements } from '../../db/seed-statements.mjs';

const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM mothers) AS m`).get();
if (counts.m > 0 && !process.env.FORCE_SEED) {
  console.log('数据库已有数据，跳过种子数据（设置 FORCE_SEED=1 可强制重建）');
  process.exit(0);
}

const stmts = buildSeedStatements();
const tx = db.transaction(() => {
  for (const { sql, params } of stmts) db.prepare(sql).run(...params);
});
tx();

console.log(`种子数据已生成（${stmts.length} 条语句）：3 位产妇、4 名宝宝、护理记录、任务与交接班。`);
