import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getAdminRegisterStatus, REGISTER_WATCH_KEY } from '../../api/admin';

function readWatch(): string | null {
  try {
    return localStorage.getItem(REGISTER_WATCH_KEY);
  } catch {
    return null;
  }
}

/**
 * 대량 등록이 서버에서 끝나면 어드민 어느 화면에 있든 알려 준다.
 * 지켜볼 등록이 있을 때만 5초마다 확인한다.
 */
export function RegisterDoneWatcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const onBulkPage = location.pathname.startsWith('/admin/register-link');

  useEffect(() => {
    const timer = window.setInterval(() => {
      const watch = readWatch();
      if (!watch) return;
      getAdminRegisterStatus()
        .then((run) => {
          if (!run || run.id !== watch) {
            if (!run) localStorage.removeItem(REGISTER_WATCH_KEY);
            return;
          }
          if (run.running) return;
          try {
            localStorage.removeItem(REGISTER_WATCH_KEY);
          } catch {
            // 무시
          }
          // 대량 등록 화면에서는 화면 가운데 완료 안내가 따로 뜬다
          if (onBulkPage) return;
          toast.success('✅ 대량 등록이 완료되었습니다', {
            description: `새로 등록 ${run.ok}개${run.fail ? ` · 건너뜀 ${run.fail}개` : ''}`,
            duration: 15000,
            action: {
              label: '결과 보기',
              onClick: () => navigate('/admin/register-link?tab=bulk'),
            },
          });
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [onBulkPage, navigate]);

  return null;
}
