import { NavLink, Route, Routes } from 'react-router-dom';
import { StaffProvider, useStaff } from './StaffContext';
import Dashboard from './pages/Dashboard';
import BabyDetail from './pages/BabyDetail';
import MotherDetail from './pages/MotherDetail';
import Tasks from './pages/Tasks';
import Handover from './pages/Handover';
import Admission from './pages/Admission';

function Header() {
  const { staff, current, setCurrent } = useStaff();
  return (
    <header className="app-header">
      <div className="app-title">🌸 月子中心护理记录</div>
      <nav className="app-nav">
        <NavLink to="/" end>总览</NavLink>
        <NavLink to="/tasks">护理任务</NavLink>
        <NavLink to="/handover">交接班</NavLink>
        <NavLink to="/admission">入住管理</NavLink>
      </nav>
      <div className="staff-picker">
        当前记录人
        <select value={current} onChange={(e) => setCurrent(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}（{s.role}）
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

export default function App() {
  return (
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
  );
}
