import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  // 회원 화면에서는 스크롤 막대를 감춘다 (어드민은 그대로)
  useEffect(() => {
    document.documentElement.classList.add('nl-member');
    return () => document.documentElement.classList.remove('nl-member');
  }, []);

  return (
    <div className="mx-auto min-h-full max-w-lg bg-nl-bg pb-[68px] text-nl-text">
      <Outlet />
      <BottomNav />
    </div>
  );
}
