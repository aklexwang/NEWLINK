import { useState } from 'react';
import { getAutoManageStatus } from '../../api/admin';
import { isAdminAuthenticated, setAdminAccessKey, clearAdminAccessKey } from '../../utils/adminAccess';

export function AdminAuthNotice() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (import.meta.env.DEV || isAdminAuthenticated()) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!key.trim()) {
      setError('관리자 키를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setAdminAccessKey(key);

    try {
      await getAutoManageStatus();
      window.location.reload();
    } catch {
      clearAdminAccessKey();
      setError('관리자 키가 올바르지 않거나 백엔드에 연결되지 않았습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-medium text-amber-950">관리자 인증</p>
      <p className="mt-1 text-xs text-amber-900/80">
        배포 사이트에서 관리 기능을 쓰려면 관리자 키가 필요합니다.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="관리자 키 입력"
          className="min-w-[220px] flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? '확인 중...' : '인증하기'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
