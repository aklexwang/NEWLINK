import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  deleteAdminUser,
  getAdminUsers,
  setAdminUserAdvertiser,
  setAdminUserBlocked,
} from '../../api/admin';
import type { AdminUser } from '../../types/user';
import { WalletNetworkBadge } from '../../components/WalletNetworkBadge';
import { useToast } from '../../providers/ToastProvider';
import { formatPayoutAmount } from '../../utils/payoutDisplay';

export function AdminUsersPage() {
  const { confirm } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [params, setParams] = useSearchParams();
  const kind: 'normal' | 'advertiser' = params.get('kind') === 'advertiser' ? 'advertiser' : 'normal';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getAdminUsers();
      setUsers(items);
      setMessage('');
    } catch {
      setMessage('회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} 복사됨`);
    } catch {
      setMessage('복사에 실패했습니다.');
    }
  };

  const userLabel = (user: AdminUser) =>
    user.username ? `@${user.username}` : user.firstName || String(user.telegramId);

  const handleBlockToggle = async (user: AdminUser) => {
    const nextBlocked = !user.isBlocked;
    const label = userLabel(user);
    const ok = await confirm(
      nextBlocked
        ? `${label} 회원을 차단할까요?\n차단되면 로그인·제보 등 서비스 이용이 막힙니다.`
        : `${label} 회원 차단을 해제할까요?`,
    );
    if (!ok) return;

    setActingId(user.telegramId);
    try {
      await setAdminUserBlocked(user.telegramId, nextBlocked);
      setUsers((prev) =>
        prev.map((item) =>
          item.telegramId === user.telegramId ? { ...item, isBlocked: nextBlocked } : item,
        ),
      );
      setMessage(nextBlocked ? `${label} 회원을 차단했습니다.` : `${label} 차단을 해제했습니다.`);
    } catch {
      setMessage(nextBlocked ? '회원 차단에 실패했습니다.' : '차단 해제에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    const label = userLabel(user);
    const ok = await confirm(
      `${label} 회원을 삭제할까요?\n제보한 채널/그룹은 유지되고, 회원 정보만 삭제됩니다.`,
    );
    if (!ok) return;

    setActingId(user.telegramId);
    try {
      await deleteAdminUser(user.telegramId);
      setUsers((prev) => prev.filter((item) => item.telegramId !== user.telegramId));
      setMessage(`${label} 회원을 삭제했습니다.`);
    } catch {
      setMessage('회원 삭제에 실패했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const handleAdvertiserToggle = async (user: AdminUser) => {
    const next = !user.isAdvertiser;
    const label = userLabel(user);
    const ok = await confirm(
      next ? `${label} 회원을 광고회원으로 옮길까요?` : `${label} 회원을 일반회원으로 되돌릴까요?`,
    );
    if (!ok) return;
    setActingId(user.telegramId);
    try {
      await setAdminUserAdvertiser(user.telegramId, next);
      setUsers((prev) =>
        prev.map((item) => (item.telegramId === user.telegramId ? { ...item, isAdvertiser: next } : item)),
      );
      setMessage(next ? `${label} 회원을 광고회원으로 옮겼어요.` : `${label} 회원을 일반회원으로 되돌렸어요.`);
    } catch {
      setMessage('회원 구분을 바꾸지 못했습니다.');
    } finally {
      setActingId(null);
    }
  };

  const advertiserCount = users.filter((u) => u.isAdvertiser).length;
  const normalCount = users.length - advertiserCount;

  const filtered = users.filter((user) => {
    if (kind === 'advertiser' ? !user.isAdvertiser : user.isAdvertiser) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(user.telegramId).includes(q) ||
      (user.username ?? '').toLowerCase().includes(q) ||
      (user.firstName ?? '').toLowerCase().includes(q) ||
      (user.tonWalletAddress ?? '').toLowerCase().includes(q)
    );
  });

  const registeredCount = users.filter((u) => u.isRegistered).length;
  const blockedCount = users.filter((u) => u.isBlocked).length;

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <p className="mt-1 text-sm text-muted-foreground">
          가입 회원 {registeredCount}명 · 전체 {users.length}명
          {blockedCount > 0 ? ` · 차단 ${blockedCount}명` : ''}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-xl bg-card px-4 py-3 text-sm text-foreground shadow-[var(--hz-shadow)]">
            {message}
          </div>
        )}

        <div className="mb-5 grid max-w-3xl grid-cols-2 gap-3">
          {(
            [
              { id: 'normal', label: '👤 일반회원', desc: `가입해서 제보·즐겨찾기를 쓰는 회원 · ${normalCount}명` },
              { id: 'advertiser', label: '📢 광고회원', desc: `광고문의로 텔레그램 광고를 하는 회원 · ${advertiserCount}명` },
            ] as const
          ).map((item) => {
            const active = kind === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams(item.id === 'normal' ? {} : { kind: item.id }, { replace: true })}
                aria-pressed={active}
                className={`rounded-2xl px-5 py-4 text-left shadow-[var(--hz-shadow)] transition-colors ${
                  active ? 'bg-primary text-white' : 'bg-card text-foreground hover:bg-muted'
                }`}
              >
                <p className="text-[17px] font-bold">{item.label}</p>
                <p className={`mt-1 text-sm ${active ? 'text-white/80' : 'text-subtle'}`}>{item.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ID, 이름, @username, TON 지갑 검색"
            className="w-full max-w-md rounded-xl bg-card px-4 py-3 text-sm outline-none focus:ring-ring/40 shadow-[var(--hz-shadow)]"
          />
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-[20px] bg-card shadow-[var(--hz-shadow)]" />
        ) : filtered.length === 0 ? (
          <div className="rounded-[20px] bg-card px-6 py-16 text-center text-sm text-muted-foreground shadow-[var(--hz-shadow)]">
            {kind === 'advertiser'
              ? '광고회원이 없어요. 일반회원 목록에서 [광고회원으로]를 누르면 여기로 옮겨져요.'
              : '등록된 회원이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] bg-card shadow-[var(--hz-shadow)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">회원</th>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  <th className="px-4 py-3 font-medium">TON 지갑</th>
                  <th className="px-4 py-3 font-medium">지갑 종류</th>
                  {kind === 'advertiser' && <th className="px-4 py-3 font-medium">광고</th>}
                  <th className="px-4 py-3 font-medium">제보 수</th>
                  <th className="px-4 py-3 font-medium">지급 건수</th>
                  <th className="px-4 py-3 font-medium">TON</th>
                  <th className="px-4 py-3 font-medium">USDT</th>
                  <th className="px-4 py-3 font-medium">⭐Stars</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">가입일</th>
                  <th className="px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const busy = actingId === user.telegramId;
                  return (
                    <tr
                      key={user.telegramId}
                      className={`border-b border-border last:border-0 ${user.isBlocked ? 'bg-red-50/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                            {(user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{user.firstName ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.username ? `@${user.username}` : 'username 없음'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-subtle">{user.telegramId}</span>
                          <button
                            type="button"
                            onClick={() => copyText(String(user.telegramId), 'Telegram ID')}
                            className="text-xs text-primary hover:underline"
                          >
                            복사
                          </button>
                        </div>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        {user.tonWalletAddress ? (
                          <div className="space-y-1.5">
                            <WalletNetworkBadge address={user.tonWalletAddress} showHint={false} />
                            <div className="flex items-start gap-2">
                              <span className="break-all font-mono text-xs text-subtle">
                                {user.tonWalletAddress}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyText(user.tonWalletAddress!, '지갑 주소')}
                                className="shrink-0 text-xs text-primary hover:underline"
                              >
                                복사
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">미등록</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-subtle">
                        {user.walletKind === 'ton'
                          ? 'TON'
                          : user.walletKind === 'usdt_trc20'
                            ? 'USDT TRC-20'
                            : '미등록'}
                      </td>
                      {kind === 'advertiser' && (
                        <td className="min-w-[150px] whitespace-nowrap px-4 py-3">
                          <p className="font-semibold text-foreground">
                            광고 {user.adSummary?.ads ?? 0}개
                            {(user.adSummary?.live ?? 0) > 0 && (
                              <span className="ml-1 text-green-700">· 진행 {user.adSummary?.live}</span>
                            )}
                          </p>
                          <p className="text-xs font-semibold text-emerald-700">
                            💵 {(user.adSummary?.paidUsdt ?? 0).toLocaleString()} USDT
                          </p>
                        </td>
                      )}
                      <td className="px-4 py-3 text-subtle">{user.submissionCount}</td>
                      <td className="px-4 py-3 text-subtle">{user.payoutCount ?? 0}</td>
                      <td className="px-4 py-3 text-subtle">
                        {formatPayoutAmount('TON', user.payoutTon ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-subtle">
                        {formatPayoutAmount('USDT', user.payoutUsdt ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-subtle">
                        {formatPayoutAmount('STARS', user.payoutStars ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.isBlocked ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              차단됨
                            </span>
                          ) : user.isRegistered ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              가입완료
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-subtle">
                              미가입
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleAdvertiserToggle(user)}
                            disabled={busy}
                            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/15 disabled:opacity-50"
                          >
                            {user.isAdvertiser ? '일반회원으로' : '광고회원으로'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBlockToggle(user)}
                            disabled={busy}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 disabled:opacity-50 ${
                              user.isBlocked
                                ? 'bg-amber-50 text-amber-800 ring-amber-100 hover:bg-amber-100'
                                : 'bg-muted text-subtle ring-border hover:bg-muted'
                            }`}
                          >
                            {busy ? '처리 중...' : user.isBlocked ? '차단 해제' : '차단'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(user)}
                            disabled={busy}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-100 hover:bg-red-100 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
