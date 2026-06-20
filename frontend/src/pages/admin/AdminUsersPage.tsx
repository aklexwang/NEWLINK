import { useCallback, useEffect, useState } from 'react';
import { getAdminUsers } from '../../api/admin';
import type { AdminUser } from '../../types/user';

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

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

  const filtered = users.filter((user) => {
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

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <h2 className="text-xl font-bold text-slate-900">회원 관리</h2>
        <p className="mt-1 text-sm text-slate-500">
          가입 회원 {registeredCount}명 · 전체 {users.length}명
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
            {message}
          </div>
        )}

        <div className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ID, 이름, @username, TON 지갑 검색"
            className="w-full max-w-md rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-blue-300"
          />
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
            등록된 회원이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/5 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">회원</th>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  <th className="px-4 py-3 font-medium">TON 지갑</th>
                  <th className="px-4 py-3 font-medium">제보 수</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">가입일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.telegramId} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                          {(user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.firstName ?? '-'}</p>
                          <p className="text-xs text-slate-500">
                            {user.username ? `@${user.username}` : 'username 없음'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-700">{user.telegramId}</span>
                        <button
                          type="button"
                          onClick={() => copyText(String(user.telegramId), 'Telegram ID')}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          복사
                        </button>
                      </div>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      {user.tonWalletAddress ? (
                        <div className="flex items-start gap-2">
                          <span className="break-all font-mono text-xs text-slate-600">{user.tonWalletAddress}</span>
                          <button
                            type="button"
                            onClick={() => copyText(user.tonWalletAddress!, 'TON 지갑')}
                            className="shrink-0 text-xs text-blue-600 hover:underline"
                          >
                            복사
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">미등록</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{user.submissionCount}</td>
                    <td className="px-4 py-3">
                      {user.isRegistered ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">가입완료</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">미가입</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}