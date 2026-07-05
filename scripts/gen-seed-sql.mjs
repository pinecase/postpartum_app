// 生成 db/seed.sql，供 Cloudflare D1 导入演示数据：
//   node scripts/gen-seed-sql.mjs
//   npx wrangler d1 execute postpartum-care --remote --file=./db/seed.sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedStatements } from '../db/seed-statements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const quote = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const lines = buildSeedStatements().map(({ sql, params }) => {
  let i = 0;
  const rendered = sql.replace(/\?/g, () => quote(params[i++]));
  if (i !== params.length) throw new Error(`参数数量不匹配: ${sql}`);
  return rendered + ';';
});

const out = path.join(__dirname, '..', 'db', 'seed.sql');
fs.writeFileSync(out, `-- 由 scripts/gen-seed-sql.mjs 生成，时间基于生成时刻\n${lines.join('\n')}\n`);
console.log(`已生成 ${out}（${lines.length} 条语句）`);
