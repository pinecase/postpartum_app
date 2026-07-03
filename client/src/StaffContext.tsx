import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, Staff } from './api';

interface StaffCtx {
  staff: Staff[];
  current: string;
  setCurrent: (name: string) => void;
}

const Ctx = createContext<StaffCtx>({ staff: [], current: '', setCurrent: () => {} });

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [current, setCurrentState] = useState<string>(
    () => localStorage.getItem('current_staff') || ''
  );

  useEffect(() => {
    api.get<Staff[]>('/api/staff').then((list) => {
      setStaff(list);
      if (list.length && !localStorage.getItem('current_staff')) {
        setCurrentState(list[0].name);
        localStorage.setItem('current_staff', list[0].name);
      }
    });
  }, []);

  const setCurrent = (name: string) => {
    setCurrentState(name);
    localStorage.setItem('current_staff', name);
  };

  return <Ctx.Provider value={{ staff, current, setCurrent }}>{children}</Ctx.Provider>;
}

export const useStaff = () => useContext(Ctx);
