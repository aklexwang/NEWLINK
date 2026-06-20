import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="mx-auto min-h-full max-w-lg bg-tg-bg pb-[68px]">
      <Outlet />
      <BottomNav />
    </div>
  );
}