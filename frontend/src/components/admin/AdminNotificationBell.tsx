import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  getAdminNotifications,
  readAdminNotification,
  readAllAdminNotifications,
  type AdminNotificationItem,
} from '../../api/notifications';
import { Button } from '@/components/admin/ui/button';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

/** 어드민 종 알림. 1분마다 새로 불러온다 */
export function AdminNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminNotifications();
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* 알림은 못 불러와도 화면은 그대로 */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openItem = async (item: AdminNotificationItem) => {
    if (!item.readAt) await readAdminNotification(item.id).catch(() => undefined);
    setOpen(false);
    await load();
    if (item.link) navigate(item.link);
  };

  return (
    <div ref={boxRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative rounded-full text-muted-foreground"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
        aria-label={`알림 ${unread}개`}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[20px] bg-card shadow-[var(--hz-shadow)] ring-1 ring-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-foreground">알림</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => void readAllAdminNotifications().then(load)}
              >
                모두 읽음
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">새 알림이 없어요.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(item)}
                    className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted ${item.readAt ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.body && <p className="mt-0.5 text-xs text-subtle">{item.body}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
