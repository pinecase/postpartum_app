import { describe, it, expect } from 'vitest';
import { fmtTime, fmtClock, dayOfLife, localDatetimeValue } from '../../client/src/api';
import { csvEscape, toCsv } from '../../client/src/csv';

describe('时间格式化', () => {
  it('fmtTime 输出 MM-DD HH:mm', () => {
    const d = new Date(2026, 6, 9, 8, 5); // 本地时间 7月9日 08:05
    expect(fmtTime(d.toISOString())).toBe('07-09 08:05');
  });

  it('fmtTime 空值返回 —', () => {
    expect(fmtTime(null)).toBe('—');
    expect(fmtTime(undefined)).toBe('—');
  });

  it('fmtClock 输出 HH:mm', () => {
    const d = new Date(2026, 0, 1, 23, 59);
    expect(fmtClock(d.toISOString())).toBe('23:59');
  });

  it('dayOfLife 出生当天为第 1 天', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(dayOfLife(iso)).toBe(1);
  });

  it('dayOfLife 昨天出生为第 2 天', () => {
    const d = new Date(Date.now() - 86400000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(dayOfLife(iso)).toBe(2);
  });

  it('localDatetimeValue 生成 datetime-local 兼容格式', () => {
    expect(localDatetimeValue(new Date(2026, 6, 9, 8, 5))).toBe('2026-07-09T08:05');
  });
});

describe('CSV 生成', () => {
  it('普通值原样输出', () => {
    expect(csvEscape('abc')).toBe('abc');
    expect(csvEscape(42)).toBe('42');
  });

  it('null/undefined 输出空串', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('含逗号/引号/换行的值加引号并转义', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('说"引"')).toBe('"说""引"""');
    expect(csvEscape('两\n行')).toBe('"两\n行"');
  });

  it('toCsv 带 BOM、CRLF 行、表头在首行', () => {
    const csv = toCsv(['名', '值'], [['体温', 36.5], ['备注', 'a,b']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toEqual(['名,值', '体温,36.5', '备注,"a,b"']);
  });
});
