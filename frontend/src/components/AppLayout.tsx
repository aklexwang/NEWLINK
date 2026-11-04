import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { BottomNav } from './BottomNav';

/** 화면(경로)별 스크롤 위치. 뒤로 가기 때 복원하는 데 쓴다 */
const savedScroll = new Map<string, number>();

/**
 * 다른 화면으로 이동하면 맨 위부터 보여 준다.
 * 뒤로/앞으로 가기(POP)일 때는 보던 위치로 되돌린다 (목록이 늦게 그려지면 잠깐 기다렸다가).
 */
function useScrollReset() {
  const location = useLocation();
  const navType = useNavigationType();
  const prevKey = useRef(location.key);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // 화면이 바뀐 뒤에는 이미 새 화면 높이에 맞춰 줄어든 값이라, 스크롤할 때마다 미리 적어 둔다
  useEffect(() => {
    const onScroll = () => savedScroll.set(prevKey.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (prevKey.current === location.key) return;
    const pathChanged = prevPath.current !== location.pathname;
    prevKey.current = location.key;
    prevPath.current = location.pathname;

    if (navType === 'POP') {
      const y = savedScroll.get(location.key);
      if (y == null) {
        if (pathChanged) window.scrollTo(0, 0);
        return;
      }
      // 목록을 다시 불러오는 동안(최대 2.5초) 위치가 맞을 때까지 되풀이. 사용자가 손대면 멈춘다
      const started = Date.now();
      let raf = 0;
      let stopped = false;
      const stop = () => {
        stopped = true;
      };
      const restore = () => {
        if (stopped) return;
        window.scrollTo(0, y);
        if (Math.abs(window.scrollY - y) > 2 && Date.now() - started < 2500) {
          raf = requestAnimationFrame(restore);
        }
      };
      window.addEventListener('wheel', stop, { passive: true, once: true });
      window.addEventListener('touchstart', stop, { passive: true, once: true });
      restore();
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
      };
    }
    // 같은 화면 안에서 주소 뒤 조건만 바뀐 경우(탭·필터)는 위치를 건드리지 않는다
    if (pathChanged) window.scrollTo(0, 0);
  }, [location.key, location.pathname, navType]);
}

/**
 * 공유 링크(t.me/봇?startapp=c_<채널 id>)로 들어오면 그 채널 상세로 바로 보낸다. 앱을 연 뒤 한 번만
 */
function useStartParam() {
  const navigate = useNavigate();
  useEffect(() => {
    let param: string;
    try {
      param = WebApp.initDataUnsafe?.start_param ?? '';
    } catch {
      return;
    }
    if (!param.startsWith('c_')) return;
    const key = `nl-start-param:${param}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* 저장 못 해도 이동은 한다 */
    }
    const id = param.slice(2);
    if (/^[0-9a-f-]{36}$/i.test(id)) navigate(`/c/id/${id}`);
  }, [navigate]);
}

export function AppLayout() {
  useScrollReset();
  useStartParam();
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
