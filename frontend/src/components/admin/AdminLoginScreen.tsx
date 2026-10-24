import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { loginAdmin } from '../../api/auth';
import { saveAdminToken } from '../../utils/adminAccess';

export function AdminLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = await loginAdmin(username.trim(), password);
      saveAdminToken(token);
      onLoggedIn();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('잠시 후 다시 시도하세요');
      } else if (axios.isAxiosError(err) && !err.response) {
        setError('서버에 연결할 수 없습니다.');
      } else {
        setError('아이디 또는 비밀번호가 올바르지 않습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
      >
        <h1 className="text-lg font-bold text-slate-900">관리자 로그인</h1>
        <p className="mt-1 text-sm text-slate-500">아이디와 비밀번호를 입력해 주세요</p>

        <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="admin-username">
          아이디
        </label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-400"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="admin-password">
          비밀번호
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-400"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
