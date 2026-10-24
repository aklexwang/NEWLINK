import { useCallback, useEffect, useState } from 'react';
import {
  getAdminStatsOps,
  getAdminStatsRuns,
  startAdminLightCollect,
  type AdminStatsOps,
  type AdminStatsRun,
  type AdminStatsRunKind,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import { adminApiErrorMessage } from '../../utils/adminApiError';

function formatKst(value: string | null | undefined): string {
  if (!value) return '-';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '-';
  return at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function kindClass(kind: AdminStatsRunKind): string {
  if (kind === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (kind === 'budget') return 'bg-sky-100 text-sky-800';
  if (kind === 'interrupted') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-900';
}

function kindLabel(kind: AdminStatsRunKind): string {
  if (kind === 'completed') return '완료';
  if (kind === 'budget') return '시간 예산 도달';
  if (kind === 'interrupted') return '중단';
  return '진행 중';
}

export function AdminCollectOpsPage() {
  const [runs, setRuns] = useState<AdminStatsRun[]>([]);
  const [ops, setOps] = useState<AdminStatsOps | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextRuns, nextOps] = await Promise.all([
        getAdminStatsRuns(30),
        getAdminStatsOps(),
      ]);
      setRuns(nextRuns);
      setOps(nextOps);
      if (!silent) setMessage('');
    } catch (error) {
      if (!silent) {
        setMessage(adminApiErrorMessage(error, '수집 운영 정보를 불러오지 못했습니다.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const hasRunning = Boolean(ops?.running) || runs.some((run) => run.kind === 'running');

  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunning, load]);

  const handleLight = async () => {
    if (
      !window.confirm('light 수집을 지금 시작할까요? 약 25분 걸립니다')
    ) {
      return;
    }
    setStarting(true);
    try {
      await startAdminLightCollect();
      setMessage('light 수집을 시작했습니다.');
      await load(true);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '수집을 시작하지 못했습니다.'));
    } finally {
      setStarting(false);
    }
  };

  const flood = ops?.mtproto.floodWait;
  const floodLabel =
    flood?.startedAt && flood.seconds != null
      ? `${formatKst(flood.startedAt)} · ${flood.seconds}초`
      : '기록 없음';

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">수집 운영</h2>
          <p className="mt-1 text-sm text-slate-500">
            최근 실행 기록과 MTProto 상태입니다. full 수동 실행은 없습니다.
          </p>
        </div>
        <button
          type="button"
          disabled={starting || hasRunning}
          onClick={() => void handleLight()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {starting || hasRunning ? '수집 중…' : 'light 수집 지금 실행'}
        </button>
      </div>
      {message && <AdminMessage message={message} />}

      {loading || !ops ? (
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-white" />
      ) : (
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">MTProto</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {ops.mtproto.enabled ? '켜짐' : '꺼짐'}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">오늘 요청</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{ops.mtproto.requestsToday}</p>
            <p className="mt-1 text-[11px] text-slate-400">서버 재시작 후 0부터</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">resolve</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {ops.mtproto.resolvesToday}/{ops.mtproto.resolveDailyLimit}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">서버 재시작 후 0부터</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">키워드 검색</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {ops.mtproto.searchesToday}/{ops.mtproto.searchDailyLimit}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">서버 재시작 후 0부터</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">FLOOD_WAIT</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{floodLabel}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">시간 예산</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              light {ops.budgets.lightMin} / full {ops.budgets.fullMin} / 발견 {ops.budgets.discoveryMin} / 인증 재확인 {ops.budgets.verifyRecheckMin}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-slate-500">발견 오늘</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {ops.discovery.today}/{ops.discovery.dailyMax}
            </p>
          </div>
        </section>
      )}

      <section className="mt-8 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">모드</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">처리</th>
              <th className="px-4 py-3 font-medium">시작 (KST)</th>
              <th className="px-4 py-3 font-medium">끝 (KST)</th>
              <th className="px-4 py-3 font-medium">걸린 시간</th>
              <th className="px-4 py-3 font-medium">ended_reason</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  실행 기록이 없습니다.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{run.mode}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kindClass(run.kind)}`}>
                      {kindLabel(run.kind)}
                    </span>
                    {run.budgetNote && (
                      <p className="mt-1 text-[11px] text-sky-700">{run.budgetNote}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {run.processed}/{run.total}
                    <span className="text-slate-400"> · 남은 {run.remaining}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{formatKst(run.startedAt)}</td>
                  <td className="px-4 py-3 text-xs">{formatKst(run.finishedAt)}</td>
                  <td className="px-4 py-3">{run.durationLabel}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{run.endedReason ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
