import { useCallback, useEffect, useState } from 'react';
import {
  getAdminRewardSettings,
  getAdminRewardToggleHistory,
  patchAdminRewardSettings,
  type RewardSettings,
  type RewardToggleLog,
} from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { Card, CardContent } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/skeleton';

function formatKst(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 제보 보상 전체 스위치. 바꾼 시각 이후 들어온 회원 제보부터 새 상태를 따른다
 * (켜진 때 제보 = 지급 대기, 꺼진 때 제보 = 보상 대상 아님). 이미 들어온 제보는 바뀌지 않는다.
 */
export function AdminRewardSwitch() {
  const [settings, setSettings] = useState<RewardSettings | null>(null);
  const [history, setHistory] = useState<RewardToggleLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [next, logs] = await Promise.all([
        getAdminRewardSettings(),
        getAdminRewardToggleHistory().catch(() => []),
      ]);
      setSettings(next);
      setHistory(logs);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '보상 상태를 불러오지 못했습니다.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (enabled: boolean) => {
    if (!settings || settings.enabled === enabled || saving) return;
    const text = enabled
      ? '보상을 활성으로 바꿉니다.\n지금부터 들어오는 회원 제보는 보상 대상(지급 대기)이 됩니다.'
      : '보상을 비활성으로 바꿉니다.\n지금부터 들어오는 회원 제보는 보상 대상이 아닙니다.\n(이미 들어온 제보는 그대로입니다)';
    if (!window.confirm(text)) return;
    setSaving(true);
    setMessage('');
    try {
      await patchAdminRewardSettings(enabled);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '보상 상태를 바꾸지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return message ? (
      <p className="text-sm text-destructive">{message}</p>
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  }

  const on = settings.enabled;
  const since = formatKst(settings.enabledChangedAt);

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">제보 보상</p>
            <p className={`mt-1 text-2xl font-bold ${on ? 'text-success' : 'text-subtle'}`}>
              {on ? '활성' : '비활성'}
            </p>
            <p className="mt-1 text-sm text-subtle">
              {since ? `${since}부터 ${on ? '활성' : '비활성'}` : '바꾼 기록 없음 (처음부터 활성)'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              바꾼 시각 이후 들어온 회원 제보부터 적용돼요. 이미 들어온 제보는 바뀌지 않아요.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <button
              type="button"
              disabled={saving}
              onClick={() => void change(true)}
              className={`h-16 min-w-[140px] rounded-2xl text-lg font-bold transition ${
                on
                  ? 'bg-success text-white shadow-[var(--hz-shadow)]'
                  : 'bg-muted text-subtle hover:bg-muted/70'
              }`}
            >
              활성
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void change(false)}
              className={`h-16 min-w-[140px] rounded-2xl text-lg font-bold transition ${
                !on
                  ? 'bg-destructive text-white shadow-[var(--hz-shadow)]'
                  : 'bg-muted text-subtle hover:bg-muted/70'
              }`}
            >
              비활성
            </button>
          </div>
        </div>
        {message && <p className="text-sm text-destructive">{message}</p>}
        {history.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">최근 바꾼 기록</p>
            <ul className="mt-2 space-y-1 text-sm">
              {history.slice(0, 5).map((log) => (
                <li key={log.id} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${log.enabled ? 'bg-success' : 'bg-destructive'}`}
                  />
                  <span className="text-foreground">{log.enabled ? '활성' : '비활성'}</span>
                  <span className="text-muted-foreground">{formatKst(log.changedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
