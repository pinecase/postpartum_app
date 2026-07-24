import { describe, it, expect } from 'vitest';
import { buildRecordSyncs, SyncInput } from '../../client/src/pages/Tasks';

const base = (over: Partial<SyncInput>): SyncInput => ({
  subjectType: 'baby',
  subjectId: 7,
  taskType: '喂奶时间',
  title: '喂奶时间',
  fieldValues: {},
  timeIso: '2026-07-09T08:00:00.000Z',
  notes: '',
  recordedBy: '张敏',
  ...over,
});

describe('任务 → 护理记录同步规则', () => {
  it('母乳亲喂：生成喂养记录，含哺乳侧/姿势/时长', () => {
    const out = buildRecordSyncs(base({
      fieldValues: { method: '母乳亲喂', side: '左', position: '摇篮式', duration: '20' },
    }));
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('/api/babies/7/feeds');
    expect(out[0].payload.method).toBe('母乳亲喂');
    expect(out[0].payload.duration_min).toBe(20);
    expect(out[0].payload.notes).toContain('左');
    expect(out[0].payload.notes).toContain('摇篮式');
  });

  it('混合喂养：奶量 = 母乳 + 配方奶之和', () => {
    const out = buildRecordSyncs(base({
      fieldValues: { method: '混合喂养', bm: '60', fm: '30' },
    }));
    expect(out[0].payload.amount_ml).toBe(90);
    expect(out[0].payload.notes).toContain('母乳 60ml');
    expect(out[0].payload.notes).toContain('配方奶 30ml');
  });

  it('喂奶时附带小便量：额外生成大小便记录', () => {
    const out = buildRecordSyncs(base({
      fieldValues: { method: '配方奶', amount: '80', urine: '中' },
    }));
    expect(out).toHaveLength(2);
    expect(out[1].url).toBe('/api/babies/7/diapers');
    expect(out[1].payload.type).toBe('尿');
  });

  it('换尿布：小便+大便 → 类型「尿+便」，带量与性状', () => {
    const out = buildRecordSyncs(base({
      taskType: '换尿布', title: '换尿布',
      fieldValues: { urine: '少', stool: '中', consistency: '水样', color: '黄色' },
    }));
    expect(out).toHaveLength(1);
    expect(out[0].payload.type).toBe('尿+便');
    expect(out[0].payload.stool_consistency).toBe('水样');
    expect(out[0].payload.notes).toContain('小便·少');
    expect(out[0].payload.notes).toContain('大便·中');
  });

  it('换尿布：量全为「无」时不生成记录', () => {
    const out = buildRecordSyncs(base({
      taskType: '换尿布', title: '换尿布',
      fieldValues: { urine: '无', stool: '无' },
    }));
    expect(out).toHaveLength(0);
  });

  it('体征测量：HR/RR/SpO₂ 写入体征记录', () => {
    const out = buildRecordSyncs(base({
      taskType: '体征测量', title: '体征测量',
      fieldValues: { hr: '140', rr: '40', spo2: '98' },
    }));
    expect(out[0].url).toBe('/api/babies/7/vitals');
    expect(out[0].payload.heart_rate).toBe(140);
    expect(out[0].payload.spo2).toBe(98);
  });

  it('洗澡记录：清单合成到护理记录，体重/黄疸另生成体征记录', () => {
    const out = buildRecordSyncs(base({
      taskType: '洗澡记录', title: '洗澡记录',
      fieldValues: { weight: '3400', jaundice: '9.5', oral: '已清洁', cord: '干燥正常' },
    }));
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe('/api/babies/7/cares');
    expect(out[0].payload.notes).toContain('口腔·已清洁');
    expect(out[0].payload.notes).toContain('脐部·干燥正常');
    expect(out[1].url).toBe('/api/babies/7/vitals');
    expect(out[1].payload.weight_g).toBe(3400);
  });

  it('Nurse note（护理记录/观察）不生成任何档案记录', () => {
    const out = buildRecordSyncs(base({
      taskType: '护理记录/观察', title: '护理记录/观察', notes: '整班哭闹',
    }));
    expect(out).toHaveLength(0);
  });

  it('纯待办（无任何内容）不生成记录', () => {
    const out = buildRecordSyncs(base({ taskType: '脚部按摩', title: '脚部按摩' }));
    expect(out).toHaveLength(0);
  });

  it('产妇体征测量 → 查房记录（脉搏）', () => {
    const out = buildRecordSyncs(base({
      subjectType: 'mother', taskType: '体征测量', title: '体征测量',
      fieldValues: { hr: '78' },
    }));
    expect(out[0].url).toBe('/api/mothers/7/vitals');
    expect(out[0].payload.pulse).toBe(78);
  });

  it('照片只挂在第一条同步记录上', () => {
    const photos = [{ data: 'abc', mime: 'image/jpeg' }];
    const out = buildRecordSyncs(base({
      fieldValues: { method: '配方奶', amount: '60', urine: '中' },
      photos,
    }));
    expect(out[0].payload.photos).toEqual(photos);
    expect(out[1].payload.photos).toBeUndefined();
  });

  it('母婴同室：入/出室与尿片记录', () => {
    const out = buildRecordSyncs(base({
      taskType: '母婴同室', title: '母婴同室',
      fieldValues: { inout: '入室', stool: '少' },
    }));
    expect(out[0].url).toBe('/api/babies/7/cares');
    expect(out[0].payload.notes).toContain('入室');
    expect(out[1].payload.type).toBe('便');
  });
});
