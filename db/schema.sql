-- 月子中心护理记录系统 数据库表结构（本地 SQLite 与 Cloudflare D1 共用）
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '护士',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mothers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER,
  room TEXT NOT NULL,
  admission_date TEXT NOT NULL,
  expected_discharge_date TEXT,
  delivery_date TEXT NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT '顺产',
  parity TEXT,
  feeding_plan TEXT,
  allergies TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT '在住',
  discharged_at TEXT
);

CREATE TABLE IF NOT EXISTS babies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mother_id INTEGER NOT NULL REFERENCES mothers(id),
  name TEXT NOT NULL,
  sex TEXT NOT NULL DEFAULT '女',
  birth_date TEXT NOT NULL,
  birth_weight_g INTEGER,
  gestational_age_weeks REAL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT '在住'
);

CREATE TABLE IF NOT EXISTS baby_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER NOT NULL REFERENCES babies(id),
  time TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_ml INTEGER,
  duration_min INTEGER,
  notes TEXT,
  recorded_by TEXT
);

CREATE TABLE IF NOT EXISTS baby_diapers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER NOT NULL REFERENCES babies(id),
  time TEXT NOT NULL,
  type TEXT NOT NULL,
  stool_color TEXT,
  stool_consistency TEXT,
  notes TEXT,
  recorded_by TEXT
);

CREATE TABLE IF NOT EXISTS baby_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER NOT NULL REFERENCES babies(id),
  time TEXT NOT NULL,
  temperature_c REAL,
  weight_g INTEGER,
  jaundice_mg_dl REAL,
  heart_rate INTEGER,
  resp_rate INTEGER,
  notes TEXT,
  recorded_by TEXT
);

CREATE TABLE IF NOT EXISTS baby_cares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baby_id INTEGER NOT NULL REFERENCES babies(id),
  time TEXT NOT NULL,
  care_type TEXT NOT NULL,
  notes TEXT,
  recorded_by TEXT
);

CREATE TABLE IF NOT EXISTS mother_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mother_id INTEGER NOT NULL REFERENCES mothers(id),
  time TEXT NOT NULL,
  temperature_c REAL,
  systolic INTEGER,
  diastolic INTEGER,
  pulse INTEGER,
  lochia_amount TEXT,
  lochia_color TEXT,
  wound_status TEXT,
  breast_status TEXT,
  mood_score INTEGER,
  pain_score INTEGER,
  notes TEXT,
  recorded_by TEXT
);

CREATE TABLE IF NOT EXISTS care_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('mother','baby')),
  subject_id INTEGER NOT NULL,
  due_time TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT '待办',
  created_by TEXT,
  completed_by TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT NOT NULL,   -- feeds / diapers / vitals / cares / mother_vitals
  record_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,          -- base64（客户端压缩后 ≤ 约 300KB）
  recorded_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_photos_record ON photos(record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_feeds_baby_time ON baby_feeds(baby_id, time);
CREATE INDEX IF NOT EXISTS idx_diapers_baby_time ON baby_diapers(baby_id, time);
CREATE INDEX IF NOT EXISTS idx_bvitals_baby_time ON baby_vitals(baby_id, time);
CREATE INDEX IF NOT EXISTS idx_cares_baby_time ON baby_cares(baby_id, time);
CREATE INDEX IF NOT EXISTS idx_mvitals_mother_time ON mother_vitals(mother_id, time);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON care_tasks(status, due_time);
