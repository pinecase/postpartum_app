export interface Staff {
  id: number;
  name: string;
  role: string;
  email?: string | null;
  is_admin?: number;
  active?: number;
  has_password?: number;
}

export interface AuthStatus {
  pin_set: boolean;
  accounts_exist: boolean;
}

export interface Mother {
  id: number;
  name: string;
  age: number | null;
  room: string;
  admission_date: string;
  expected_discharge_date: string | null;
  delivery_date: string;
  delivery_type: string;
  parity: string | null;
  feeding_plan: string | null;
  allergies: string | null;
  notes: string | null;
  status: string;
  discharged_at: string | null;
}

export interface Baby {
  id: number;
  mother_id: number;
  name: string;
  sex: string;
  birth_date: string;
  birth_weight_g: number | null;
  gestational_age_weeks: number | null;
  notes: string | null;
  status: string;
  feed_interval_min: number | null;
}

export interface Appointment {
  id: number;
  mother_id: number;
  date: string;
  time: string | null;
  title: string;
  notes: string | null;
  status: string;
  created_by: string | null;
  mother_name?: string;
  room?: string;
}

export interface Feed {
  id: number;
  baby_id: number;
  time: string;
  method: string;
  amount_ml: number | null;
  duration_min: number | null;
  notes: string | null;
  recorded_by: string | null;
}

export interface Diaper {
  id: number;
  baby_id: number;
  time: string;
  type: string;
  stool_color: string | null;
  stool_consistency: string | null;
  notes: string | null;
  recorded_by: string | null;
}

export interface BabyVital {
  id: number;
  baby_id: number;
  time: string;
  temperature_c: number | null;
  weight_g: number | null;
  jaundice_mg_dl: number | null;
  heart_rate: number | null;
  resp_rate: number | null;
  spo2: number | null;
  notes: string | null;
  recorded_by: string | null;
}

export interface BabyCare {
  id: number;
  baby_id: number;
  time: string;
  care_type: string;
  notes: string | null;
  recorded_by: string | null;
}

export interface MotherVital {
  id: number;
  mother_id: number;
  time: string;
  temperature_c: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  lochia_amount: string | null;
  lochia_color: string | null;
  wound_status: string | null;
  breast_status: string | null;
  mood_score: number | null;
  pain_score: number | null;
  notes: string | null;
  recorded_by: string | null;
}

export interface CareTask {
  id: number;
  subject_type: 'mother' | 'baby';
  subject_id: number;
  due_time: string;
  title: string;
  detail: string | null;
  status: string;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  internal_note: string | null;
  subject_name?: string;
  room?: string;
  photos?: PhotoRef[];
}

export interface Handover {
  id: number;
  date: string;
  shift: string;
  author: string;
  content: string;
  created_at: string;
  room: string | null;
  mother_name: string | null;
  baby_name: string | null;
}

export interface Alert {
  subject_type: 'mother' | 'baby';
  subject_id: number;
  subject_name: string;
  room: string;
  level: 'danger' | 'warning' | 'info';
  code: string;
  params: Record<string, string | number>;
  message: string;
  time: string | null;
}

export interface OverviewBaby extends Baby {
  latest_vital: BabyVital | null;
  last_feed: Feed | null;
  feeds_today: number;
  milk_today: number;
  diapers_today: number;
}

export interface Overview {
  rooms: { mother: Mother & { latest_vital: MotherVital | null }; babies: OverviewBaby[] }[];
  alerts: Alert[];
  pending_tasks: CareTask[];
  stats: { mothers_in_house: number; babies_in_house: number; pending_task_count: number };
}

export interface PhotoRef {
  id: number;
  record_type: string;
  record_id: number;
}

export interface MotherDetailData extends Mother {
  babies: Baby[];
  vitals: MotherVital[];
  tasks: CareTask[];
  photos: PhotoRef[];
}

export interface BabyDetailData extends Baby {
  mother_name: string;
  room: string;
  feeds: Feed[];
  diapers: Diaper[];
  vitals: BabyVital[];
  cares: BabyCare[];
  tasks: CareTask[];
  photos: PhotoRef[];
}

// ---------- 登录态（邮箱账号 + PIN 兜底） ----------
export const getAuthToken = () => localStorage.getItem('auth_token');

export const getAuthStaff = (): Staff | null => {
  try {
    return JSON.parse(localStorage.getItem('auth_staff') || 'null');
  } catch {
    return null;
  }
};

export const setAuth = (token: string, staff: Staff) => {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_staff', JSON.stringify(staff));
};

export const clearAuth = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_staff');
};

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // 通知 App 弹出登录/PIN 锁屏
    window.dispatchEvent(new CustomEvent('auth-required'));
    throw new Error('auth_required');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return res.json();
}

const authHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {};
  const token = getAuthToken();
  if (token) h['X-Auth-Token'] = token;
  const pin = localStorage.getItem('app_pin');
  if (pin) h['X-Pin'] = pin;
  return h;
};

export const api = {
  get: <T>(url: string) => fetch(url, { headers: authHeaders() }).then((r) => handle<T>(r)),
  post: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  del: <T>(url: string) => fetch(url, { method: 'DELETE', headers: authHeaders() }).then((r) => handle<T>(r)),
};

export function fmtTime(t: string | null | undefined): string {
  if (!t) return '—';
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function fmtClock(t: string | null | undefined): string {
  if (!t) return '—';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayOfLife(birthDate: string): number {
  const birth = new Date(birthDate + 'T00:00:00');
  return Math.floor((Date.now() - birth.getTime()) / 86400000) + 1;
}

export function localDatetimeValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
