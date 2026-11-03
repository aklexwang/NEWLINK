import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  deleteAdminUser,
  getAdminVisitors,
  getAdminUsers,
  setAdminUserAdvertiser,
  setAdminUserBlocked,
} from '../../api/admin';
import type { AdminUser } from '../../types/user';
import { WalletNetworkBadge } from '../../components/WalletNetworkBadge';
import { MemberActivityPanel } from '../../components/admin/MemberActivityPanel';
import { useToast } from '../../providers/ToastProvider';
import { formatPayoutAmount } from '../../utils/payoutDisplay';

export function AdminUsersPage() {
  const { confirm } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  /** 오른쪽 성향 패널에 열린 회원 */
  const [panelUser, setPanelUser] = useState<AdminUser | null>(null);
  const [params, setParams] = useSearchParams();
  const kindParam = params.get('kind');
  const kind: 'normal' | 'advertiser' | 'visitor' =
    kindParam === 'advertiser' ? 'advertiser' : kindParam === 'visitor' ? 'visitor' : 'normal';

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
  const overuseUsers = users.filter((u) => u.detailOveruse && !u.isBlocked);

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <p className="mt-1 text-sm text-muted-foreground">
          가입 회원 {registeredCount}명 · 전체 {users.length}명
          {blockedCount > 0 ? ` · 차단 ${blockedCount}명` : ''}
        </p>
        {overuseUsers.length > 0 && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
            <p className="font-bold text-red-400">
              ⚠️ 채널 상세 과다 조회 회원 {overuseUsers.length}명 (최근 7일, 하루 100개 초과)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              목록을 긁어 가는 프로그램일 수 있어요. 아래 빨간 표시가 있는 회원을 확인하고 필요하면 [차단]하세요.
              차단하면 1분 안에 미니앱 이용이 모두 막혀요.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {overuseUsers.map((u) => (
                <button
                  key={u.telegramId}
                  type="button"
                  onClick={() => setQuery(String(u.telegramId))}
                  className="rounded-lg bg-red-500/20 px-2 py-1 font-mono text-xs text-red-300 hover:bg-red-500/30"
                >
                  {u.username ? `@${u.username}` : u.telegramId} · {u.detailOveruse!.count}일
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-xl bg-card px-4 py-3 text-sm text-foreground shadow-[var(--hz-shadow)]">
            {message}
          </div>
        )}

        <div className="mb-5 grid max-w-5xl grid-cols-3 gap-3">
          {(
            [
              { id: 'normal', label: '👤 일반회원', desc: `가입해서 제보·즐겨찾기를 쓰는 회원 · ${normalCount}명` },
              { id: 'advertiser', label: '📢 광고회원', desc: `광고문의로 텔레그램 광고를 하는 회원 · ${advertiserCount}명` },
              { id: 'visitor', label: '👀 방문자(비회원 포함)', desc: '미니앱을 열어 본 사람 · 텔레그램 ID·이름만, 90일 보관' },
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

        {kind === 'visitor' ? (
          <VisitorsPanel />
        ) : (
        <>
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
                      onClick={(e) => {
                        // 버튼(복사·차단·삭제 등)을 누른 건 패널을 열지 않는다
                        if ((e.target as HTMLElement).closest('button, a, input')) return;
                        setPanelUser(user);
                      }}
                      title="눌러서 이 회원의 성향·활동 보기"
                      className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/60 ${
                        panelUser?.telegramId === user.telegramId ? 'bg-primary/10' : user.isBlocked ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                            {(user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div>
                            <p className="flex items-center gap-1.5 font-medium text-foreground">
                              {user.firstName ?? '-'}
                              {user.detailOveruse && (
                                <span
                                  title={`최근 7일 중 ${user.detailOveruse.count}일 하루 100개 넘게 상세 조회 · 마지막 ${new Date(user.detailOveruse.lastAt).toLocaleString('ko-KR')}`}
                                  className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400"
                                >
                                  과다 조회 {user.detailOveruse.count}일
                                </span>
                              )}
                            </p>
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
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700" title="보상 받을 지갑까지 등록함">
                              지갑 등록
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-subtle" title="텔레그램 로그인만 함 (보상 받을 지갑은 아직 안 넣음)">
                              로그인만 · 지갑 없음
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
        </>
        )}
      </div>
      {panelUser && <MemberActivityPanel key={panelUser.telegramId} user={panelUser} onClose={() => setPanelUser(null)} />}
    </>
  );
}

type VisitorRow = {
  telegramId: number;
  firstName: string | null;
  username: string | null;
  languageCode: string | null;
  isPremium: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  visitDays: number;
  isMember: boolean;
  isBlocked: boolean;
};

/** 미니앱 방문자(비회원 포함). 전화번호는 받지 않는다 */
function VisitorsPanel() {
  const [data, setData] = useState<{ total: number; last7d: number; today: number; items: VisitorRow[] } | null>(null);
  const [onlyGuests, setOnlyGuests] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    getAdminVisitors()
      .then(setData)
      .catch(() => setError('방문자 목록을 불러오지 못했어요.'));
  }, []);
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const rows = (data?.items ?? []).filter((v) => {
    if (onlyGuests && v.isMember) return false;
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return (
      String(v.telegramId).includes(k) ||
      (v.username ?? '').toLowerCase().includes(k) ||
      (v.firstName ?? '').toLowerCase().includes(k)
    );
  });
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return <div className="h-32 animate-pulse rounded-[20px] bg-card shadow-[var(--hz-shadow)]" />;
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        오늘 {data.today.toLocaleString('ko-KR')}명 · 최근 7일 {data.last7d.toLocaleString('ko-KR')}명 · 전체{' '}
        {data.total.toLocaleString('ko-KR')}명 (마지막 방문 후 90일 보관 · 최근 300명 표시)
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ID, 이름, @username 검색"
          className="w-full max-w-md rounded-xl bg-card px-4 py-3 text-sm outline-none shadow-[var(--hz-shadow)]"
        />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={onlyGuests} onChange={(e) => setOnlyGuests(e.target.checked)} />
          비회원만 보기
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-[20px] bg-card px-6 py-16 text-center text-sm text-muted-foreground shadow-[var(--hz-shadow)]">
          아직 기록된 방문자가 없어요. 미니앱을 연 사람이 하루 한 번씩 기록돼요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] bg-card shadow-[var(--hz-shadow)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">텔레그램 ID</th>
                <th className="px-4 py-3 font-medium">구분</th>
                <th className="px-4 py-3 text-right font-medium">방문한 날</th>
                <th className="px-4 py-3 font-medium">처음 방문</th>
                <th className="px-4 py-3 font-medium">마지막 방문</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.telegramId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {v.firstName ?? '-'}
                      {v.isPremium && <span className="ml-1 text-xs text-amber-500">★</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.username ? `@${v.username}` : 'username 없음'}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-subtle">{v.telegramId}</td>
                  <td className="px-4 py-3">
                    {v.isBlocked ? (
                      <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400">차단됨</span>
                    ) : v.isMember ? (
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">회원</span>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-subtle">비회원</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{v.visitDays}일</td>
                  <td className="px-4 py-3 text-subtle">{fmt(v.firstSeenAt)}</td>
                  <td className="px-4 py-3 text-subtle">{fmt(v.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
