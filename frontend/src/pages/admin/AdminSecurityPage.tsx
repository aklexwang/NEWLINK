import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  confirmAdminOtpSetup,
  disableAdminOtp,
  getAdminOtpStatus,
  getAdminSecurityMonitor,
  startAdminOtpSetup,
  type AdminOtpStatus,
  type AdminSecurityMonitor,
} from '../../api/admin';

/** 보안 설정: 관리자 로그인 2단계 (Google OTP) */
export function AdminSecurityPage() {
  const [status, setStatus] = useState<AdminOtpStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [monitor, setMonitor] = useState<AdminSecurityMonitor | null>(null);

  const load = () => {
    void getAdminOtpStatus()
      .then(setStatus)
      .catch(() => setMessage('상태를 불러오지 못했어요.'));
  };
  useEffect(load, []);
  const loadMonitor = () => {
    void getAdminSecurityMonitor()
      .then(setMonitor)
      .catch(() => undefined);
  };
  useEffect(loadMonitor, []);

  const begin = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await startAdminOtpSetup();
      const qr = await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 220 });
      setSetup({ secret: res.secret, qr });
      setCode('');
    } catch {
      setMessage('등록을 시작하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await confirmAdminOtpSetup(code.trim());
      if (!res.ok) {
        setMessage('번호가 맞지 않아요. 앱에 지금 보이는 6자리를 넣어 주세요. (10분이 지났으면 처음부터 다시)');
        return;
      }
      setSetup(null);
      setBackupCodes(res.backupCodes ?? []);
      load();
    } catch {
      setMessage('확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await disableAdminOtp(code.trim());
      if (!res.ok) {
        setMessage('번호가 맞지 않아요.');
        return;
      }
      setDisableOpen(false);
      setCode('');
      setMessage('OTP 를 껐어요. 이제 아이디·비밀번호만으로 로그인돼요.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const card = 'rounded-[16px] bg-card p-6 shadow-[var(--hz-shadow)]';
  const input =
    'h-12 w-full max-w-[240px] rounded-xl border border-border bg-white px-4 text-center text-[20px] font-bold tracking-[0.3em] outline-none focus:border-primary';
  const btn = 'h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:opacity-50';

  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-10 md:px-7">
      <p className="text-sm text-muted-foreground">관리자 로그인에 Google OTP(휴대폰 6자리)를 더해 비밀번호가 새도 로그인을 막아요.</p>
      {message && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">{message}</p>}

      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[16px] font-bold">
              Google OTP
              {status &&
                (status?.registered && !status.forcedOff ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    켜짐
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">꺼짐</span>
                ))}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {status == null
                ? '확인 중…'
                : status.forcedOff
                  ? 'Render 설정(ADMIN_OTP_OFF)으로 잠시 꺼져 있어요. 다시 등록한 뒤 그 설정을 지워 주세요.'
                  : status.registered
                    ? `백업 코드 ${status.backupLeft}개 남음`
                    : '아이디·비밀번호만으로 로그인돼요'}
            </p>
          </div>
          {status?.registered && !status.forcedOff && !backupCodes && !disableOpen && (
            <button
              type="button"
              onClick={() => setDisableOpen(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10" />
              </svg>
              끄기
            </button>
          )}
        </div>

        {status && (!status.registered || status.forcedOff) && !setup && !backupCodes && (
          <button type="button" disabled={busy} onClick={() => void begin()} className={`${btn} mt-5`}>
            OTP 켜기
          </button>
        )}

        {setup && (
          <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr]">
            <img src={setup.qr} alt="Google OTP 등록 QR" className="h-[220px] w-[220px] rounded-xl ring-1 ring-border" />
            <div className="space-y-3 text-sm">
              <p className="font-semibold">1. 휴대폰 Google OTP 앱에서 [+] → [QR 코드 스캔]으로 왼쪽 QR을 찍어 주세요.</p>
              <p className="text-muted-foreground">
                QR이 안 되면 [설정 키 입력]에 아래 키를 넣어도 돼요 (이름: TellLink).
              </p>
              <p className="w-fit rounded-lg bg-muted px-3 py-2 font-mono text-[13px] break-all">{setup.secret}</p>
              <p className="pt-2 font-semibold">2. 앱에 뜬 6자리를 넣고 [확인]을 눌러 주세요.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={input}
                />
                <button type="button" disabled={busy || code.length !== 6} onClick={() => void confirm()} className={btn}>
                  확인
                </button>
              </div>
              <p className="text-xs text-muted-foreground">이 화면을 닫거나 10분이 지나면 처음부터 다시 해야 해요.</p>
            </div>
          </div>
        )}

        {backupCodes && (
          <div className="mt-6 rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="font-bold text-amber-900">OTP가 켜졌어요. 백업 코드 10개를 지금 꼭 따로 적어 두세요.</p>
            <p className="mt-1 text-sm text-amber-800">
              휴대폰을 잃었을 때 OTP 대신 한 번씩 쓸 수 있어요. 이 화면을 벗어나면 다시 볼 수 없어요.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[15px] font-semibold sm:grid-cols-5">
              {backupCodes.map((c) => (
                <span key={c} className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-amber-200">
                  {c}
                </span>
              ))}
            </div>
            <button type="button" onClick={() => setBackupCodes(null)} className="mt-4 text-sm font-semibold text-amber-900 underline">
              다 적었어요
            </button>
          </div>
        )}

        {status?.registered && !status.forcedOff && !backupCodes && disableOpen && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
            <span className="text-sm">OTP를 끄려면 지금 OTP 6자리(또는 백업 코드):</span>
            <input
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={input}
            />
            <button type="button" disabled={busy || code.length < 6} onClick={() => void turnOff()} className="h-11 rounded-xl bg-red-500 px-5 text-sm font-bold text-white disabled:opacity-50">
              끄기
            </button>
            <button
              type="button"
              onClick={() => {
                setDisableOpen(false);
                setCode('');
              }}
              className="h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              취소
            </button>
          </div>
        )}
      </div>

      <div className={card}>
        <p className="text-[15px] font-bold">휴대폰을 잃어버렸을 때</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>로그인할 때 OTP 칸에 백업 코드 8자리를 넣으면 돼요 (한 번씩만).</li>
          <li>백업 코드도 없으면 Render → newlink-api → Environment 에 ADMIN_OTP_OFF = true 를 넣어 잠시 끄고, 로그인해서 새 휴대폰으로 다시 등록한 뒤 그 설정을 지워 주세요.</li>
        </ul>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold">보안 모니터링 — 우릴 노리는 시도</p>
            <p className="mt-1 text-sm text-muted-foreground">
              미니앱 밖(브라우저·봇·스크래퍼)에서 온 요청, 취약점 스캔·인젝션 흔적, 관리자 로그인
              실패입니다. 서버가 다시 켜지면 0부터 셉니다.
            </p>
          </div>
          <button
            type="button"
            onClick={loadMonitor}
            className="h-9 shrink-0 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-accent"
          >
            새로고침
          </button>
        </div>

        {!monitor ? (
          <p className="mt-4 text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border px-4 py-3 text-center">
                <div className="text-2xl font-bold tabular-nums">
                  {monitor.outsideBlocked.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">밖에서 차단(스크래퍼)</div>
              </div>
              <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-amber-700">
                  {monitor.scanCount.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">취약점 스캔 의심</div>
              </div>
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-destructive">
                  {monitor.injectionCount.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">인젝션 흔적</div>
              </div>
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-destructive">
                  {monitor.loginFailureTotal.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">관리자 로그인 실패</div>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              과다요청 차단 {monitor.rateLimited.toLocaleString()}회 · 정상(미니앱 서명){' '}
              {monitor.signedOk.toLocaleString()}회 · 관리자 {monitor.adminOk.toLocaleString()}회
            </p>

            <p className="mt-5 text-[14px] font-bold">최근 밖에서 온 요청</p>
            {monitor.samples.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                최근 미니앱 밖에서 온 수상한 요청이 없어요. (좋은 신호)
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">종류</th>
                      <th className="px-3 py-2">경로</th>
                      <th className="px-3 py-2">클라이언트</th>
                      <th className="px-3 py-2">시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.samples.map((s, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">
                          {s.kind === 'injection' ? (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                              인젝션
                            </span>
                          ) : s.kind === 'scan' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              스캔
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                              스크래퍼
                            </span>
                          )}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2 font-mono text-xs">{s.path}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">{s.client}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {new Date(s.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {monitor.loginFailures.length > 0 && (
              <>
                <p className="mt-5 text-[14px] font-bold">관리자 로그인 실패 (침입 시도)</p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">IP</th>
                        <th className="px-3 py-2">실패 횟수</th>
                        <th className="px-3 py-2">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.loginFailures.map((f, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-xs">{f.ip}</td>
                          <td className="px-3 py-2">{f.failures}</td>
                          <td className="px-3 py-2">
                            {f.locked ? (
                              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                                잠김
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
