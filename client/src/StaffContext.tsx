import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, Staff, getAuthStaff } from './api';

interface StaffCtx {
  staff: Staff[];
  current: string;
  setCurrent: (name: string) => void;
  addStaff: (name: string, role: string) => Promise<void>;
}

const Ctx = createContext<StaffCtx>({
  staff: [],
  current: '',
  setCurrent: () => {},
  addStaff: async () => {},
});

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  // 记录人默认取当前登录账号，其次取上次选择
  const [current, setCurrentState] = useState<string>(
    () => getAuthStaff()?.name || localStorage.getItem('current_staff') || ''
  );

  const setCurrent = (name: string) => {
    setCurrentState(name);
    localStorage.setItem('current_staff', name);
  };

  useEffect(() => {
    api.get<Staff[]>('/api/staff').then((list) => {
      setStaff(list);
      const saved = localStorage.getItem('current_staff') || '';
      // 记录人不在名单里（如刚清库）时回退到第一位
      if (list.length && !list.some((s) => s.name === saved)) {
        setCurrentState(list[0].name);
        localStorage.setItem('current_staff', list[0].name);
      }
    });
  }, []);

  const addStaff = async (name: string, role: string) => {
    const created = await api.post<Staff>('/api/staff', { name, role });
    setStaff((s) => [...s, created]);
    setCurrent(created.name);
  };

  return <Ctx.Provider value={{ staff, current, setCurrent, addStaff }}>{children}</Ctx.Provider>;
}

export const useStaff = () => useContext(Ctx);
