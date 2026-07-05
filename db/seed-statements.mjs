// 演示数据生成器：返回 [{sql, params}] 语句列表。
// 供本地 better-sqlite3（server/src/seed.js）与 D1 seed.sql 生成脚本共用。
// 时间均相对“当前时刻”计算，生成时即为最新演示状态。

export function buildSeedStatements() {
  const stmts = [];
  const add = (sql, ...params) => stmts.push({ sql, params });

  for (const t of [
    'baby_feeds', 'baby_diapers', 'baby_vitals', 'baby_cares',
    'mother_vitals', 'care_tasks', 'handovers', 'babies', 'mothers', 'staff',
  ]) {
    add(`DELETE FROM ${t}`);
  }

  const iso = (d) => d.toISOString();
  const daysAgo = (n, h = 9, min = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, min, 0, 0);
    return d;
  };
  const dateStr = (n) => daysAgo(n).toISOString().slice(0, 10);
  const now = new Date();

  for (const s of ['王丽华|护士长', '张敏|护士', '李静|护士', '陈芳|月嫂', '刘医生|医生']) {
    add(`INSERT INTO staff (name, role) VALUES (?, ?)`, ...s.split('|'));
  }

  const motherSql = `INSERT INTO mothers (id, name, age, room, admission_date, expected_discharge_date, delivery_date, delivery_type, parity, feeding_plan, allergies, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const babySql = `INSERT INTO babies (id, mother_id, name, sex, birth_date, birth_weight_g, gestational_age_weeks, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  add(motherSql, 1, '林晓彤', 29, '801', dateStr(5), dateStr(-23), dateStr(7), '顺产', 'G1P1', '母乳为主', '无', '会阴侧切，恢复良好');
  add(babySql, 1, 1, '林宝', '女', dateStr(7), 3250, 39.5, null);
  add(motherSql, 2, '周雨萌', 33, '802', dateStr(10), dateStr(-18), dateStr(12), '剖宫产', 'G2P2', '混合喂养', '青霉素过敏', '双胎，剖宫产切口愈合中');
  add(babySql, 2, 2, '周大宝', '男', dateStr(12), 2680, 36.5, '双胎之一，出生体重偏低');
  add(babySql, 3, 2, '周小宝', '女', dateStr(12), 2540, 36.5, '双胎之二');
  add(motherSql, 3, '吴佳琪', 26, '803', dateStr(2), dateStr(-26), dateStr(3), '顺产', 'G1P1', '母乳亲喂', '无', null);
  add(babySql, 4, 3, '吴宝', '男', dateStr(3), 3480, 40, null);

  const nurses = ['张敏', '李静', '陈芳'];
  const pick = (arr, i) => arr[i % arr.length];

  const babyPlans = [
    { id: 1, birthW: 3250, stayDays: 5, jaundiceCurve: [8.5, 9.8, 10.6, 9.9, 8.7], feedBase: 70 },
    { id: 2, birthW: 2680, stayDays: 5, jaundiceCurve: [10.2, 11.5, 12.8, 13.4, 12.9], feedBase: 55 },
    { id: 3, birthW: 2540, stayDays: 5, jaundiceCurve: [9.0, 10.1, 10.8, 10.2, 9.5], feedBase: 55 },
    { id: 4, birthW: 3480, stayDays: 2, jaundiceCurve: [7.8, 9.2], feedBase: 65 },
  ];

  const feedMethods = ['母乳亲喂', '瓶喂母乳', '配方奶'];
  for (const plan of babyPlans) {
    for (let d = plan.stayDays - 1; d >= 0; d--) {
      for (let f = 0; f < 7; f++) {
        const hour = 1 + f * 3;
        const t = daysAgo(d, hour, (f * 17) % 60);
        if (t > now) continue;
        const method = pick(feedMethods, f + plan.id);
        add(
          `INSERT INTO baby_feeds (baby_id, time, method, amount_ml, duration_min, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          plan.id, iso(t), method,
          method === '母乳亲喂' ? null : plan.feedBase + f * 5,
          method === '母乳亲喂' ? 20 + (f % 3) * 5 : 15,
          f === 0 ? '吃奶有力' : null, pick(nurses, f)
        );
      }
      for (let dp = 0; dp < 6; dp++) {
        const t = daysAgo(d, 2 + dp * 3.5, (dp * 23) % 60);
        if (t > now) continue;
        const hasStool = dp % 2 === 0;
        add(
          `INSERT INTO baby_diapers (baby_id, time, type, stool_color, stool_consistency, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          plan.id, iso(t), hasStool ? '尿+便' : '尿',
          hasStool ? '黄色' : null, hasStool ? '糊状' : null, null, pick(nurses, dp)
        );
      }
      const dayIdx = plan.stayDays - 1 - d;
      const weight = Math.round(plan.birthW - plan.birthW * 0.06 + dayIdx * 35);
      const vt = daysAgo(d, 8, 30);
      if (vt <= now) {
        add(
          `INSERT INTO baby_vitals (baby_id, time, temperature_c, weight_g, jaundice_mg_dl, heart_rate, resp_rate, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          plan.id, iso(vt), +(36.5 + (dayIdx % 3) * 0.2).toFixed(1), weight,
          plan.jaundiceCurve[dayIdx] ?? null, 128 + dayIdx * 2, 42, null, pick(nurses, dayIdx)
        );
      }
      const ct = daysAgo(d, 10, 0);
      if (ct <= now) {
        add(
          `INSERT INTO baby_cares (baby_id, time, care_type, notes, recorded_by) VALUES (?, ?, ?, ?, ?)`,
          plan.id, iso(ct), pick(['洗澡', '抚触', '脐部护理', '游泳'], dayIdx + plan.id), null, pick(nurses, dayIdx)
        );
      }
    }
  }

  const motherPlans = [
    { id: 1, stayDays: 5, temp: 36.6, sys: 112, dia: 72, mood: 4, pain: 2, wound: '会阴伤口干燥无红肿', lochia: '中' },
    { id: 2, stayDays: 10, temp: 36.8, sys: 128, dia: 84, mood: 3, pain: 4, wound: '剖宫产切口愈合良好', lochia: '中' },
    { id: 3, stayDays: 2, temp: 36.5, sys: 108, dia: 68, mood: 5, pain: 1, wound: '无伤口异常', lochia: '多' },
  ];
  for (const p of motherPlans) {
    for (let d = p.stayDays - 1; d >= 0; d--) {
      for (const hour of [8, 19]) {
        const t = daysAgo(d, hour, 15);
        if (t > now) continue;
        const dayIdx = p.stayDays - 1 - d;
        add(
          `INSERT INTO mother_vitals (mother_id, time, temperature_c, systolic, diastolic, pulse, lochia_amount, lochia_color, wound_status, breast_status, mood_score, pain_score, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          p.id, iso(t), +(p.temp + (hour === 19 ? 0.2 : 0)).toFixed(1),
          p.sys + (dayIdx % 2) * 4, p.dia + (dayIdx % 2) * 2, 76 + (dayIdx % 3) * 2,
          dayIdx < 3 ? p.lochia : '少', dayIdx < 3 ? '暗红' : '淡红',
          p.wound, dayIdx === 0 ? '轻度胀奶' : '无异常',
          p.mood, Math.max(0, p.pain - Math.floor(dayIdx / 2)),
          null, pick(nurses, dayIdx + hour)
        );
      }
    }
  }

  const inHours = (h) => iso(new Date(Date.now() + h * 3600 * 1000));
  const taskSql = `INSERT INTO care_tasks (subject_type, subject_id, due_time, title, detail, created_by) VALUES (?, ?, ?, ?, ?, ?)`;
  add(taskSql, 'baby', 2, inHours(1), '复测黄疸', '昨日经皮胆红素 13.4 mg/dL，医嘱每日复测', '刘医生');
  add(taskSql, 'baby', 4, inHours(2), '新生儿沐浴 + 脐部护理', null, '王丽华');
  add(taskSql, 'mother', 2, inHours(3), '剖宫产切口换药', '注意青霉素过敏史', '刘医生');
  add(taskSql, 'mother', 3, inHours(5), '哺乳指导', '初产妇，含接姿势需指导', '王丽华');

  const handoverSql = `INSERT INTO handovers (date, shift, author, content, created_at) VALUES (?, ?, ?, ?, ?)`;
  add(handoverSql, dateStr(1), '夜班', '李静',
    '802 周大宝夜间哭闹较多，喂养后安抚入睡；黄疸目测偏黄，晨起已安排复测。803 吴佳琪恶露量偏多，已告知医生，嘱继续观察。其余母婴平稳。',
    iso(daysAgo(0, 7, 50)));
  add(handoverSql, dateStr(1), '白班', '张敏',
    '801 林晓彤会阴伤口愈合好，情绪佳。802 周小宝吃奶量提升至 60ml/次。803 新入住宜适应期，已完成入住宣教。',
    iso(daysAgo(1, 19, 55)));

  return stmts;
}
