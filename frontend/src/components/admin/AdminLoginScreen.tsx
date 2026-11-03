import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { loginAdmin } from '../../api/auth';
import { saveAdminToken } from '../../utils/adminAccess';

/** 왼쪽 배경의 작은 별 (위치 고정: 새로 그릴 때마다 바뀌지 않게) */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  left: (i * 37.7) % 100,
  top: (i * 53.3 + 11) % 100,
  size: i % 7 === 0 ? 2 : 1,
  opacity: 0.25 + ((i * 13) % 50) / 100,
}));

const PLANE =
  'M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z';

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`absolute flex items-center gap-2 rounded-full border border-white/15 bg-[#13235a]/70 px-4 py-2 text-[13px] font-semibold text-white/90 backdrop-blur ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#7fb8ff]" />
      {label}
    </span>
  );
}

/** 왼쪽 그림: 궤도 위에 겹친 유리 카드 + 종이비행기 */
function LoginVisual() {
  return (
    <div className="relative hidden flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_45%_55%,#24418f_0%,#13245c_38%,#0b1638_75%)] lg:block">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}

      <div className="absolute top-12 left-12 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden>
            <path d={PLANE} />
          </svg>
        </span>
        <div>
          <p className="text-[18px] leading-tight font-bold text-white">
            Tell<span className="text-[#2aabee]">Link</span>
          </p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-[#8fb4ff]">ADMIN CONSOLE</p>
        </div>
      </div>

      {/* 궤도 */}
      <div className="absolute top-1/2 left-1/2 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-[#6f8fe0]/20" />
      <div className="absolute top-1/2 left-1/2 h-[230px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-[#6f8fe0]/25" />
      <div className="absolute top-1/2 left-1/2 h-[160px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-[#6f8fe0]/30" />

      {/* 겹친 카드 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-[300px] w-[260px]">
          <div className="absolute top-6 left-16 h-[300px] w-[210px] rotate-[-28deg] rounded-[28px] border border-white/25 bg-gradient-to-br from-[#5b7be8]/50 to-[#2a3f99]/30 shadow-[0_30px_80px_rgba(10,20,60,0.6)] backdrop-blur" />
          <div className="absolute top-0 left-8 h-[200px] w-[150px] rotate-[14deg] rounded-[20px] bg-gradient-to-br from-[#4d68e6] to-[#3247c9] shadow-[0_20px_50px_rgba(10,20,60,0.5)]" />
          <div className="absolute top-8 left-2 flex h-[200px] w-[150px] rotate-[-10deg] flex-col items-center justify-center rounded-[20px] bg-gradient-to-br from-[#fbe9ff] via-[#f4e2ff] to-[#ffe3ec] shadow-[0_24px_60px_rgba(10,20,60,0.55)]">
            <svg viewBox="0 0 24 24" className="h-16 w-16 text-[#2aabee]/70" fill="currentColor" aria-hidden>
              <path d={PLANE} />
            </svg>
            <span className="mt-5 h-1 w-16 rounded-full bg-[#b9c6f5]" />
          </div>
        </div>
      </div>

      <Chip label="채널" className="top-[40%] left-[12%]" />
      <Chip label="그룹" className="top-[54%] right-[10%]" />
      <Chip label="수집" className="top-[72%] left-[22%]" />

      <div className="absolute bottom-10 left-12">
        <p className="text-[10px] font-semibold tracking-[0.3em] text-[#8fb4ff]">TELEGRAM DIRECTORY</p>
        <p className="mt-2 text-[28px] font-bold text-white">TellLink 관리자</p>
      </div>
    </div>
  );
}

export function AdminLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const inputClass =
    'h-12 w-full rounded-xl border border-[#e3e7f0] bg-white px-4 text-[15px] text-[#111827] outline-none transition placeholder:text-[#a0a8b8] focus:border-[#229af0] focus:ring-4 focus:ring-[#229af0]/15';

  return (
    <div className="flex min-h-screen bg-[#0b1638]">
      <LoginVisual />

      <div className="flex w-full items-center justify-center bg-gradient-to-br from-white via-white to-[#f1f5ff] px-6 py-12 lg:w-[42%] lg:min-w-[440px]">
        <div className="w-full max-w-[360px]">
          <p className="flex items-center gap-2 text-[12px] font-medium text-[#5b6478]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#229af0]" />
            관리자 전용
          </p>
          <h1 className="mt-4 text-[30px] font-bold tracking-tight text-[#111827]">관리자 로그인</h1>
          <p className="mt-2 text-[14px] text-[#6b7280]">TellLink 관리자 계정으로 로그인하세요.</p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#4b5563]" htmlFor="admin-username">
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
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#4b5563]" htmlFor="admin-password">
                비밀번호
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className={`${inputClass} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 px-2 py-1 text-[12px] font-medium text-[#6b7280] hover:text-[#111827]"
                >
                  {showPassword ? '숨기기' : '보기'}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-[#f6c9c4] bg-[#fff4f2] px-4 py-3 text-[13px] text-[#b4473a]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-3 flex h-[52px] w-full items-center justify-between rounded-xl bg-[#229af0] px-5 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(34,154,240,0.3)] transition hover:bg-[#1b8ad9] disabled:opacity-60"
            >
              <span>{loading ? '로그인 중…' : '로그인'}</span>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          <div className="mt-14 border-t border-[#e8ebf2] pt-6 text-center text-[12px] text-[#9aa3b2]">
            TellLink · 텔레그램 채널·그룹 디렉터리
          </div>
        </div>
      </div>
    </div>
  );
}
