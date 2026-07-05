// 婴儿需求识别引擎（Express 与 Cloudflare Worker 共用的纯函数，不访问数据库）
//
// 输入：护理人员的观察信号（哭声特征、表情/微表情、动作、身体与皮肤征象、
//       体温、室温、湿度）+ 从护理记录计算出的情境（距上次喂奶时长、
//       24 小时排便次数、距上次换尿布时长）。
// 输出：按得分排序的需求推断（饿了/困了/要拍嗝/胀气腹痛/换尿布/太热/太冷/
//       不舒服/求安抚/受惊/想玩耍/无聊/满足）与需要人工关注的提示 flags。
//
// 规则为简化的启发式评分（哭声分型参考 Dunstan Baby Language 的常见描述），
// 仅供护理参考，不能替代临床判断。

// 哭声特征（单选）
export const CRY_TYPES = [
  'none',        // 无哭闹
  'neh',         // 短促重复 "neh"（伴觅食音，多见于饥饿）
  'owh',         // 打哈欠般 "owh"（多见于困倦）
  'eh',          // 短促 "eh"（似要打嗝）
  'eairh',       // 低沉用力 "eairh"（腹部用力，多见于胀气/腹痛）
  'heh',         // 断续 "heh"（烦躁不适）
  'whimper',     // 哼唧/呜咽
  'intense',     // 持续激烈大哭
  'high_pitch',  // 尖锐刺耳哭叫（需人工评估）
];

// 观察信号（多选），按录入界面分组
export const SIGNALS = {
  // 表情 / 微表情
  expression: [
    'frown',            // 皱眉
    'grimace',          // 表情痛苦扭曲
    'smile',            // 微笑/咧嘴
    'pout',             // 撇嘴
    'glazed_eyes',      // 眼神呆滞/放空
    'bright_eyes',      // 眼睛明亮、四处张望
    'half_closed_eyes', // 眼皮沉重半闭
    'avoid_gaze',       // 转头回避视线/刺激
  ],
  // 动作行为
  action: [
    'rooting',          // 觅食反射（转头张嘴找乳头）
    'sucking_hand',     // 吸吮手指/拳头
    'yawning',          // 打哈欠
    'rub_eyes',         // 揉眼睛/抓耳朵
    'legs_to_belly',    // 双腿蜷向腹部
    'arch_back',        // 弓背挺身
    'squirm',           // 身体扭动不安
    'active_limbs',     // 四肢活跃舞动
    'startle',          // 惊跳/双臂突然张开
    'clenched_fists',   // 双拳紧握、肢体僵硬
    'calms_when_held',  // 抱起后明显安静
    'cooing',           // 咿呀发声
    'still_quiet',      // 安静放松、少动
  ],
  // 身体与皮肤征象
  body: [
    'sweaty',           // 出汗/后颈潮湿
    'flushed',          // 脸颊发红
    'cold_extremities', // 手脚冰凉
    'mottled_skin',     // 皮肤发花
    'goosebumps',       // 鸡皮疙瘩
    'bloated_belly',    // 腹部胀鼓
    'passing_gas',      // 频繁放屁
    'hiccup',           // 打嗝
    'milk_spit',        // 吐奶/溢奶
    'wet_diaper',       // 尿布已湿/有便
  ],
};

export const ALL_SIGNALS = new Set(Object.values(SIGNALS).flat());

export const NEEDS = [
  'hungry', 'sleepy', 'burp', 'colic', 'diaper', 'too_hot', 'too_cold',
  'discomfort', 'cuddle', 'scared', 'play', 'bored', 'content',
];

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// 清洗客户端提交的观察数据：过滤未知 code、限定数值范围
export function sanitizeObservation(input = {}) {
  return {
    cry_type: CRY_TYPES.includes(input.cry_type) ? input.cry_type : null,
    signals: Array.isArray(input.signals)
      ? [...new Set(input.signals.filter((s) => ALL_SIGNALS.has(s)))]
      : [],
    temperature_c: num(input.temperature_c, 30, 43),
    ambient_temp_c: num(input.ambient_temp_c, 0, 45),
    ambient_humidity_pct: num(input.ambient_humidity_pct, 0, 100),
  };
}

/**
 * @param obs 经 sanitizeObservation 清洗后的观察数据
 * @param ctx { hours_since_feed, stool_count_24h, hours_since_diaper }（缺失为 null）
 * @returns { needs: [{code, score, confidence, evidence}], flags: [{code, level}], context }
 */
export function analyzeNeeds(obs, ctx = {}) {
  const scores = {};
  const evidence = {};
  const add = (need, weight, ev) => {
    scores[need] = (scores[need] || 0) + weight;
    if (ev && weight > 0) (evidence[need] ||= []).push(ev);
  };
  const has = (s) => obs.signals.includes(s);
  const cry = (c) => obs.cry_type === c;

  const temp = obs.temperature_c;
  const ambient = obs.ambient_temp_c;
  const humidity = obs.ambient_humidity_pct;
  const feedH = ctx.hours_since_feed;
  const diaperH = ctx.hours_since_diaper;

  // 饿了想喝奶
  if (cry('neh')) add('hungry', 4, 'cry_neh');
  if (cry('intense')) add('hungry', 1, 'cry_intense');
  if (has('rooting')) add('hungry', 4, 'rooting');
  if (has('sucking_hand')) add('hungry', 2, 'sucking_hand');
  if (feedH != null && feedH >= 3) add('hungry', 4, 'ctx_feed_gap');
  else if (feedH != null && feedH >= 2) add('hungry', 2, 'ctx_feed_gap');
  else if (feedH != null && feedH < 1) add('hungry', -3);

  // 困了想睡觉
  if (cry('owh')) add('sleepy', 4, 'cry_owh');
  if (cry('whimper')) add('sleepy', 1, 'cry_whimper');
  if (has('yawning')) add('sleepy', 4, 'yawning');
  if (has('rub_eyes')) add('sleepy', 3, 'rub_eyes');
  if (has('half_closed_eyes')) add('sleepy', 3, 'half_closed_eyes');
  if (has('glazed_eyes')) add('sleepy', 2, 'glazed_eyes');
  if (has('avoid_gaze')) add('sleepy', 1, 'avoid_gaze');

  // 需要拍嗝
  if (cry('eh')) add('burp', 4, 'cry_eh');
  if (has('hiccup')) add('burp', 2, 'hiccup');
  if (has('milk_spit')) add('burp', 2, 'milk_spit');
  if (has('squirm')) add('burp', 1, 'squirm');
  if (feedH != null && feedH < 1) add('burp', 2, 'ctx_recent_feed');

  // 胀气 / 肠绞痛（肚子疼）
  if (cry('eairh')) add('colic', 4, 'cry_eairh');
  if (cry('intense')) add('colic', 2, 'cry_intense');
  if (has('legs_to_belly')) add('colic', 3, 'legs_to_belly');
  if (has('arch_back')) add('colic', 3, 'arch_back');
  if (has('bloated_belly')) add('colic', 3, 'bloated_belly');
  if (has('passing_gas')) add('colic', 2, 'passing_gas');
  if (has('clenched_fists')) add('colic', 1, 'clenched_fists');
  if (has('grimace')) add('colic', 1, 'grimace');
  if (ctx.stool_count_24h === 0) add('colic', 2, 'ctx_no_stool_24h');

  // 需要换尿布
  if (has('wet_diaper')) add('diaper', 5, 'wet_diaper');
  if (has('squirm')) add('diaper', 1, 'squirm');
  if (diaperH != null && diaperH >= 3) add('diaper', 2, 'ctx_diaper_gap');

  // 太热
  if (has('sweaty')) add('too_hot', 3, 'sweaty');
  if (has('flushed')) add('too_hot', 2, 'flushed');
  if (temp != null && temp >= 37.2 && temp < 37.5) add('too_hot', 2, 'temp_slightly_high');
  if (ambient != null && ambient >= 27) add('too_hot', 2, 'ambient_hot');
  if (humidity != null && humidity >= 70) add('too_hot', 1, 'humidity_high');

  // 太冷
  if (has('cold_extremities')) add('too_cold', 3, 'cold_extremities');
  if (has('mottled_skin')) add('too_cold', 2, 'mottled_skin');
  if (has('goosebumps')) add('too_cold', 2, 'goosebumps');
  if (temp != null && temp < 36.2) add('too_cold', 3, 'temp_low_side');
  if (ambient != null && ambient < 22) add('too_cold', 2, 'ambient_cold');

  // 身体不适（需人工检查）
  if (cry('heh')) add('discomfort', 3, 'cry_heh');
  if (cry('high_pitch')) add('discomfort', 4, 'cry_high_pitch');
  if (cry('whimper')) add('discomfort', 1, 'cry_whimper');
  if (has('grimace')) add('discomfort', 3, 'grimace');
  if (has('mottled_skin')) add('discomfort', 1, 'mottled_skin');
  if (temp != null && temp >= 37.5) add('discomfort', 4, 'temp_high');
  if (temp != null && temp < 36.0) add('discomfort', 3, 'temp_low');
  if (humidity != null && humidity <= 40) add('discomfort', 1, 'humidity_low');
  if (humidity != null && humidity >= 70) add('discomfort', 1, 'humidity_high');

  // 想要抱抱 / 求安抚
  if (has('calms_when_held')) add('cuddle', 5, 'calms_when_held');
  if (cry('whimper')) add('cuddle', 2, 'cry_whimper');
  if (cry('intense')) add('cuddle', 1, 'cry_intense');
  if (has('pout')) add('cuddle', 2, 'pout');
  if (has('startle')) add('cuddle', 1, 'startle');

  // 受惊 / 害怕
  if (has('startle')) add('scared', 4, 'startle');
  if (cry('high_pitch')) add('scared', 2, 'cry_high_pitch');
  if (has('clenched_fists')) add('scared', 2, 'clenched_fists');
  if (has('avoid_gaze')) add('scared', 1, 'avoid_gaze');
  if (cry('intense')) add('scared', 1, 'cry_intense');

  // 想玩耍 / 互动
  if (has('bright_eyes')) add('play', 3, 'bright_eyes');
  if (has('active_limbs')) add('play', 3, 'active_limbs');
  if (has('cooing')) add('play', 3, 'cooing');
  if (has('smile')) add('play', 2, 'smile');
  if (cry('none')) add('play', 1, 'cry_none');

  // 无聊 / 寻求关注
  if (cry('whimper')) add('bored', 2, 'cry_whimper');
  if (has('pout')) add('bored', 1, 'pout');
  if (has('glazed_eyes')) add('bored', 1, 'glazed_eyes');
  if (has('cooing')) add('bored', 1, 'cooing');

  // 开心 / 满足
  if (has('smile')) add('content', 4, 'smile');
  if (has('cooing')) add('content', 2, 'cooing');
  if (has('bright_eyes')) add('content', 1, 'bright_eyes');
  if (has('still_quiet')) add('content', 1, 'still_quiet');
  if (cry('none')) add('content', 2, 'cry_none');

  const needs = NEEDS
    .map((code) => ({ code, score: scores[code] || 0, evidence: evidence[code] || [] }))
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((n) => ({
      ...n,
      confidence: n.score >= 7 ? 'high' : n.score >= 4 ? 'medium' : 'low',
    }));

  // 需人工立即关注的提示（独立于需求排序）
  const flags = [];
  if (temp != null && temp >= 37.5) flags.push({ code: 'temp_high', level: 'danger' });
  if (temp != null && temp < 36.0) flags.push({ code: 'temp_low', level: 'warning' });
  if (cry('high_pitch')) flags.push({ code: 'cry_high_pitch', level: 'warning' });

  return {
    needs,
    flags,
    context: {
      hours_since_feed: feedH != null ? round1(feedH) : null,
      stool_count_24h: ctx.stool_count_24h ?? null,
      hours_since_diaper: diaperH != null ? round1(diaperH) : null,
    },
  };
}
