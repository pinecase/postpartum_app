import { NavLink, Route, Routes } from 'react-router-dom';
import { StaffProvider, useStaff } from './StaffContext';
import { I18nProvider, useI18n, LANGS } from './i18n';
import Dashboard from './pages/Dashboard';
import BabyDetail from './pages/BabyDetail';
import MotherDetail from './pages/MotherDetail';
import Tasks from './pages/Tasks';
import Handover from './pages/Handover';
import Admission from './pages/Admission';

function Header() {
  const { staff, current, setCurrent } = useStaff();
  const { lang, setLang, t, tv } = useI18n();
  return (
    <header className="app-header">
      <div className="app-title">{t('app.title')}</div>
      <nav className="app-nav">
        <NavLink to="/" end>{t('nav.overview')}</NavLink>
        <NavLink to="/tasks">{t('nav.tasks')}</NavLink>
        <NavLink to="/handover">{t('nav.handover')}</NavLink>
        <NavLink to="/admission">{t('nav.admission')}</NavLink>
      </nav>
      <div className="staff-picker">
        <div className="lang-switch">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? 'active' : ''}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
        {t('header.currentStaff')}
        <select value={current} onChange={(e) => setCurrent(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}（{tv(s.role)}）
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <StaffProvider>
        <Header />
        <main className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/babies/:id" element={<BabyDetail />} />
            <Route path="/mothers/:id" element={<MotherDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/handover" element={<Handover />} />
            <Route path="/admission" element={<Admission />} />
          </Routes>
        </main>
      </StaffProvider>
    </I18nProvider>
  );
}
