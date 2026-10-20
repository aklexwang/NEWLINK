import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="mx-auto min-h-full max-w-lg bg-nl-bg pb-[68px] text-nl-text">
      <Outlet />
      <BottomNav />
    </div>
  );
}