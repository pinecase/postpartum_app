import { describe, it, expect } from 'vitest';
import { MESSAGES, LANGS, translateValue } from '../../client/src/i18n/translations';

const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();

describe('界面文案字典', () => {
  it('语言切换器只提供 zh 与 en（ms 字典保留但下架）', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['zh', 'en']);
  });

  it('en 与 ms 的每个键都存在于 zh 基准字典', () => {
    for (const lang of ['en', 'ms'] as const) {
      for (const key of Object.keys(MESSAGES[lang])) {
        expect(MESSAGES.zh[key], `${lang} 多余键: ${key}`).toBeDefined();
      }
    }
  });

  it('en 覆盖全部 zh 键（不允许英文缺翻译）', () => {
    const missing = Object.keys(MESSAGES.zh).filter((k) => !(k in MESSAGES.en));
    expect(missing, `en 缺失: ${missing.join(', ')}`).toEqual([]);
  });

  it('占位符在各语言之间一致（如 {n}、{label}）', () => {
    for (const lang of ['en', 'ms'] as const) {
      for (const [key, val] of Object.entries(MESSAGES[lang])) {
        const base = MESSAGES.zh[key];
        if (!base) continue;
        expect(placeholders(val), `${lang}.${key} 占位符不一致`).toEqual(placeholders(base));
      }
    }
  });
});

describe('数据枚举值翻译 translateValue', () => {
  it('zh 原样返回存储值', () => {
    expect(translateValue('母乳亲喂', 'zh')).toBe('母乳亲喂');
  });

  it('en/ms 返回对应翻译', () => {
    expect(translateValue('母乳亲喂', 'en')).toBe('Breastfeeding (direct)');
    expect(translateValue('配方奶', 'ms')).toBe('Susu formula');
  });

  it('未收录的值（如人名、自定义药品）原样透传', () => {
    expect(translateValue('Desitin cream', 'en')).toBe('Desitin cream');
  });

  it('空值显示 —', () => {
    expect(translateValue(null, 'en')).toBe('—');
    expect(translateValue('', 'zh')).toBe('—');
  });
});
