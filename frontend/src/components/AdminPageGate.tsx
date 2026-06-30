import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ADMIN_DEMO_PASSWORD = '123';

export function AdminPageGate() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setPassword('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === ADMIN_DEMO_PASSWORD) {
      close();
      navigate('/admin/pending');
      return;
    }
    setError('비밀번호가 올바르지 않습니다.');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-[1px] text-left shadow-lg shadow-slate-900/10 transition hover:shadow-xl hover:shadow-slate-900/20"
      >
        <div className="flex items-center gap-4 rounded-[15px] bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl ring-1 ring-white/10 transition group-hover:bg-white/15">
            🔐
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">관리자 페이지</p>
            <p className="mt-0.5 text-xs text-slate-300">비밀번호 입력 후 접속</p>
          </div>
          <span className="shrink-0 text-lg text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-white">
            →
          </span>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 text-center text-white">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl ring-1 ring-white/15">
                🔐
              </div>
              <h3 className="mt-3 text-lg font-bold">관리자 인증</h3>
              <p className="mt-1 text-sm text-slate-300">비밀번호를 입력해 주세요</p>
            </div>

            <div className="px-6 py-5">
              <input
                type="password"
                inputMode="numeric"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="비밀번호"
                autoFocus
                className="w-full rounded-xl bg-slate-50 px-4 py-3.5 text-center text-lg tracking-[0.3em] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-400"
              />
              {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl bg-white py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800"
                >
                  입장
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
