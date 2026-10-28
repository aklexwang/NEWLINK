import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COLLECTOR_CHANNEL,
  COLLECTOR_HANDOFF_KEY,
  type CollectorHandoff,
} from '../../utils/keywordFinder';
import {
  REGISTER_WATCH_KEY,
  getAdminRegisterStatus,
  startAdminRegister,
  type AdminRegisterRun,
  clearAdminLinkInspect,
  getAdminCategories,
  getAdminLinkInspectJob,
  getLatestAdminLinkInspect,
  resumeAdminLinkInspect,
  startAdminLinkInspect,
  type AdminInspectItemResult,
  type AdminInspectItemView,
  type AdminInspectJobView,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import type { CategoryItem } from '../../types/categoryItem';

const RESULT_LABEL: Record<AdminInspectItemResult, string> = {
  ok: '정상',
  already_registered: '이미 등록됨',
  not_korean: '외국어',
  language_unknown: '언어 미확인',
  too_small: '100명 미만',
  not_found: '없는 채널',
  invite_or_private: '초대 만료·비공개',
  invalid_format: '형식 오류',
};

const REGISTER_MAX = 100;
/** 이 창에서 완료 처리를 마친 등록 번호 */
const REGISTER_ACK_KEY = 'nl-register-acked';

// 정상과 '언어 미확인'(경고만)은 등록할 수 있다. 미확인은 기본 선택에서 빠진다.
function isRegistrable(item: AdminInspectItemView) {
  return (item.result === 'ok' || item.result === 'language_unknown') && !item.registeredChannelId;
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg)) return msg.filter(Boolean).join('\n');
  }
  return fallback;
}

function resultLabel(item: AdminInspectItemView) {
  if (item.resultCaption) return item.resultCaption;
  if (item.result === 'already_registered') {
    if (item.memberPageVisible === true) return '이미 등록됨 · 노출 중';
    if (item.memberPageVisible === false) {
      const reason = item.memberPageReason?.trim();
      return reason ? `이미 등록됨 · 숨김(${reason})` : '이미 등록됨 · 숨김';
    }
    return '이미 등록됨';
  }
  if (item.registeredThisJob || (item.registeredChannelId && item.result === 'ok')) {
    return '이번에 등록함';
  }
  if (!item.result) return '확인 중';
  return RESULT_LABEL[item.result];
}

export function AdminLinkInspectBulk() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [job, setJob] = useState<AdminInspectJobView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  /** 등록 후 정상 항목이 남았을 때 "계속 등록할까요?" */
  const [askContinue, setAskContinue] = useState<number | null>(null);
  /** 등록이 다 끝났을 때 화면 가운데에 띄우는 완료 안내 */
  const [doneSummary, setDoneSummary] = useState<string | null>(null);
  /** 확인이 끝나면 다음에 누를 버튼을 깜빡여 알려 준다: 정상만 선택 → 선택 등록 */
  const [guide, setGuide] = useState<'select' | 'register' | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [registeredTotal, setRegisteredTotal] = useState(0);
  const [registerProgress, setRegisterProgress] = useState<{ done: number; total: number } | null>(null);
  /** 확인·등록이 도는 동안은 새 링크 입력을 막는다 */
  const working = job?.status === 'running' || registerProgress != null;
  useEffect(() => {
    workingRef.current = working;
  }, [working]);

  useEffect(() => {
    getAdminCategories()
      .then((items) => {
        const active = items.filter((item) => item.isActive);
        setCategories(active);
      })
      .catch(() => setCategories([]));
    getLatestAdminLinkInspect()
      .then((latest) => {
        if (latest) {
          setJob(latest);
          if (latest.category) setCategory(latest.category);
          setSelected(defaultSelected(latest.items));
        }
      })
      .catch(() => undefined);
  }, []);

  // 수집기 창에서 보낸 아이디 받기 (확인·등록 중이면 받지 않음)
  const workingRef = useRef(false);
  useEffect(() => {
    let lastAt = 0;
    const take = (payload: CollectorHandoff | null | undefined) => {
      if (!payload || !Array.isArray(payload.entries) || payload.at === lastAt) return;
      lastAt = payload.at;
      if (workingRef.current) {
        setError('확인·등록 작업 중이라 수집기 목록을 받지 않았어요. 끝난 뒤 수집기에서 다시 보내 주세요.');
        return;
      }
      setText(payload.entries.join('\n'));
      setError('');
      setMessage(`🧲 수집기에서 ${payload.entries.length.toLocaleString('ko-KR')}개를 받았어요. [확인]을 누르면 검사를 시작해요.`);
      try {
        localStorage.removeItem(COLLECTOR_HANDOFF_KEY);
      } catch {
        // 무시
      }
    };
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(COLLECTOR_CHANNEL);
      ch.onmessage = (event) => take(event.data as CollectorHandoff);
    } catch {
      ch = null;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data as ({ type?: string } & CollectorHandoff) | null;
      if (d?.type === COLLECTOR_CHANNEL) take(d);
    };
    window.addEventListener('message', onMessage);
    // 이 화면을 열기 전에 보낸 목록 (5분 안)
    try {
      const raw = localStorage.getItem(COLLECTOR_HANDOFF_KEY);
      const saved = raw ? (JSON.parse(raw) as CollectorHandoff) : null;
      if (saved && Date.now() - saved.at < 5 * 60_000) take(saved);
    } catch {
      // 무시
    }
    return () => {
      ch?.close();
      window.removeEventListener('message', onMessage);
    };
  }, []);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(() => {
      getAdminLinkInspectJob(job.id)
        .then((next) => {
          setJob(next);
          setSelected((prev) => keepAllowedSelection(prev, next.items));
          // 확인 중 → 완료로 바뀌는 순간 다음 단계 안내 시작
          if (next.status === 'completed') {
            const hasNormals = next.items.some((item) => item.result === 'ok' && !item.registeredChannelId);
            setGuide(hasNormals ? 'select' : null);
            if (!hasNormals) setMessage('확인이 끝났어요. 새로 등록할 정상 항목이 없어요.');
            window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const selectable = useMemo(
    () =>
      (job?.items ?? []).filter(
        (item) => item.result === 'ok' && !item.registeredChannelId,
      ),
    [job],
  );

  const startInspect = async () => {
    setGuide(null);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { jobId } = await startAdminLinkInspect({
        text,
        category: category || undefined,
      });
      const next = await getAdminLinkInspectJob(jobId);
      setJob(next);
      setSelected(defaultSelected(next.items));
    } catch (err) {
      setError(apiErrorMessage(err, '확인을 시작하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const resumeInspect = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resumeAdminLinkInspect(job.id);
      const next = await getAdminLinkInspectJob(job.id);
      setJob(next);
    } catch (err) {
      setError(apiErrorMessage(err, '이어서 확인하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= REGISTER_MAX && !next.has(id)) return prev;
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  /** 다 등록했거나 그만둘 때: 한 줄 요약만 남기고 확인 목록을 지운다 */
  const finishAndClear = async (current: AdminInspectJobView, total: number) => {
    const summary = summarizeJob(current.items, total);
    try {
      await clearAdminLinkInspect(current.id);
    } catch {
      // 지우기 실패해도 화면은 비운다. 다음 확인 때 새 목록으로 바뀐다
    }
    setJob(null);
    setSelected(new Set());
    setText('');
    setAskContinue(null);
    setRegisteredTotal(0);
    setMessage(summary);
    setDoneSummary(summary.replace(/^✅ 등록이 완료되었습니다\. /, ''));
  };

  const stopAndClear = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const latest = await getAdminLinkInspectJob(job.id).catch(() => job);
      await finishAndClear(latest, registeredTotal);
    } finally {
      setBusy(false);
    }
  };

  const continueRegister = () => {
    setAskContinue(null);
    void registerSelected();
  };

  const selectNormals = () => {
    setSelected(new Set(selectable.slice(0, REGISTER_MAX).map((item) => item.id)));
    if (guide === 'select') setGuide('register');
  };

  /** 등록이 끝난 뒤: 남은 정상 항목이 있으면 "계속 등록?", 없으면 목록 지우고 완료 안내 */
  const afterRegister = async (run: AdminRegisterRun) => {
    try {
      localStorage.setItem(REGISTER_ACK_KEY, run.id);
    } catch {
      // 무시
    }
    const total = registeredTotal + run.ok;
    setRegisteredTotal(total);
    const next = await getAdminLinkInspectJob(run.jobId).catch(() => null);
    if (!next) {
      setMessage(`✅ 등록이 완료되었습니다. 새로 등록 ${run.ok}개${run.fail ? ` · 건너뜀 ${run.fail}개` : ''}`);
      return;
    }
    const remaining = remainingNormals(next.items);
    if (remaining > 0) {
      setJob(next);
      setSelected(defaultSelected(next.items));
      setAskContinue(remaining);
      setMessage(`${run.ok}개 등록${run.fail > 0 ? `, ${run.fail}개 건너뜀` : ''} (첫 수집까지 완료).`);
    } else {
      await finishAndClear(next, total);
    }
  };

  /** 서버 등록이 끝날 때까지 2초마다 진행 상황 확인 */
  const watchRegister = async (runId: string) => {
    setBusy(true);
    try {
      for (;;) {
        const run = await getAdminRegisterStatus().catch(() => null);
        if (!run || run.id !== runId) break;
        setRegisterProgress({ done: run.done, total: run.total });
        if (job && run.done > 0) {
          getAdminLinkInspectJob(run.jobId)
            .then((next) => setJob(next))
            .catch(() => undefined);
        }
        if (!run.running) {
          await afterRegister(run);
          break;
        }
        await new Promise((r) => window.setTimeout(r, 2000));
      }
    } finally {
      setRegisterProgress(null);
      setBusy(false);
    }
  };

  // 화면에 다시 들어왔을 때: 서버 등록이 진행 중이면 이어서 보여 주고, 내가 안 본 완료가 있으면 마무리
  useEffect(() => {
    let alive = true;
    getAdminRegisterStatus()
      .then((run) => {
        if (!alive || !run) return;
        let acked: string | null;
        try {
          acked = localStorage.getItem(REGISTER_ACK_KEY);
        } catch {
          acked = null;
        }
        if (run.running || acked !== run.id) void watchRegister(run.id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerSelected = async () => {
    setGuide(null);
    if (!job || job.status !== 'completed') {
      setError('확인이 다 끝난 뒤에 등록할 수 있어요.');
      return;
    }
    if (selected.size === 0) {
      setError('등록할 항목을 선택해 주세요.');
      return;
    }
    if (selected.size > REGISTER_MAX) {
      setError(`한 번에 최대 ${REGISTER_MAX}개만 등록할 수 있습니다.`);
      return;
    }
    setError('');
    setMessage('');
    try {
      // 서버가 혼자 끝까지 등록한다 (다른 화면으로 가거나 창을 닫아도 계속)
      const run = await startAdminRegister({
        jobId: job.id,
        ids: [...selected],
        category: category || undefined,
      });
      try {
        localStorage.setItem(REGISTER_WATCH_KEY, run.id);
      } catch {
        // 무시
      }
      setMessage('등록을 서버에서 진행해요. 다른 화면으로 가도 계속되고, 끝나면 어디서든 알려 드려요.');
      await watchRegister(run.id);
    } catch (err) {
      setError(apiErrorMessage(err, '등록을 시작하지 못했습니다.'));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {doneSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setDoneSummary(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-7 text-center shadow-2xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-5xl" aria-hidden>
              ✅
            </p>
            <p className="mt-3 text-2xl font-bold text-foreground">등록이 완료되었습니다</p>
            <p className="mt-3 text-sm leading-relaxed text-subtle">{doneSummary}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setDoneSummary(null)}
              className="mt-6 h-12 w-full rounded-2xl bg-primary text-base font-bold text-white"
            >
              확인
            </button>
          </div>
        </div>
      )}
      {message && <AdminMessage message={message} />}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      <section className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
        <label className="block text-sm font-medium text-subtle">링크 붙여넣기</label>
        <p className="mt-1 text-xs text-muted-foreground">
          t.me 링크, @아이디, 아이디만. 한 줄에 하나, 최대 500줄. 중복은 빼 둡니다.
        </p>
        <div className="relative mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={working}
            rows={10}
            className={`w-full rounded-xl bg-muted px-4 py-3 font-mono text-sm outline-none ring-1 ring-border focus:ring-ring/40 ${working ? 'pointer-events-none opacity-40' : ''}`}
            placeholder={'https://t.me/example\n@username\nchannelid'}
          />
          {working && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/60 text-center backdrop-blur-[1px]">
              <span className="text-3xl" aria-hidden>
                ⏳
              </span>
              <p className="text-base font-bold text-foreground">
                {registerProgress ? '등록 작업 중입니다…' : '링크 확인 작업 중입니다…'}
              </p>
              <p className="text-sm text-muted-foreground">
                끝나면 새 링크를 넣을 수 있어요. 헷갈리지 않게 지금은 입력을 막아 두었어요.
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl bg-muted px-3 py-2 text-sm outline-none ring-1 ring-border"
          >
            <option value="">분류 자동</option>
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || working || !text.trim()}
            onClick={() => void startInspect()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && job?.status === 'running' ? '확인 중...' : '확인'}
          </button>
          {job?.status === 'interrupted' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resumeInspect()}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              이어서 확인
            </button>
          )}
          {job && job.total > 0 && (
            <ProgressPill
              label={job.status === 'completed' ? '확인 완료' : job.status === 'interrupted' ? '확인 중단' : '확인 중'}
              done={job.processed}
              total={job.total}
              tone={job.status === 'interrupted' ? 'amber' : 'primary'}
            />
          )}
          {registerProgress && (
            <ProgressPill label="등록 중" done={registerProgress.done} total={registerProgress.total} tone="emerald" />
          )}
        </div>
      </section>

      {job && (
        <section ref={resultRef} className="mt-6 scroll-mt-4 rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-subtle">
              {job.processed}/{job.total} 확인
              {job.status === 'running' ? ' · 진행 중' : ''}
              {job.status === 'interrupted' ? ' · 중단됨' : ''}
              {job.status === 'completed' ? ' · 완료' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {guide && (
                <span className="text-sm font-bold text-emerald-600">
                  👉 다음: {guide === 'select' ? '[정상만 선택]을 누르세요' : '[선택 등록]을 누르세요'}
                </span>
              )}
              <button
                type="button"
                onClick={selectNormals}
                className={`rounded-xl px-3 py-2 text-sm ring-1 ring-border hover:bg-muted ${
                  guide === 'select' ? 'admin-guide-blink bg-emerald-500 font-bold text-white hover:bg-emerald-600' : 'bg-card text-subtle'
                }`}
              >
                정상만 선택
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0 || job.status !== 'completed'}
                title={job.status !== 'completed' ? '확인이 다 끝난 뒤에 등록할 수 있어요' : undefined}
                onClick={() => void registerSelected()}
                className={`rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 ${
                  guide === 'register' ? 'admin-guide-blink font-bold' : ''
                }`}
              >
                {registerProgress
                  ? `등록 중… ${registerProgress.done}/${registerProgress.total}`
                  : job.status === 'running'
                    ? '확인이 끝나면 등록 가능'
                    : job.status === 'interrupted'
                      ? '이어서 확인을 먼저 끝내 주세요'
                      : `선택 등록 (${selected.size}/${REGISTER_MAX})`}
              </button>
            </div>
          </div>

          {askContinue != null && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/40">
              <p className="mr-auto text-sm font-semibold text-foreground">
                남은 정상 항목 {askContinue}개가 남아 있습니다. 계속 등록하시겠습니까?
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={continueRegister}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                계속 등록 ({Math.min(askContinue, REGISTER_MAX)}개)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void stopAndClear()}
                className="rounded-xl bg-card px-4 py-2 text-sm font-medium text-subtle ring-1 ring-border disabled:opacity-50"
              >
                그만하고 목록 지우기
              </button>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">선택</th>
                  <th className="px-2 py-2 font-medium">결과</th>
                  <th className="px-2 py-2 font-medium">제목</th>
                  <th className="px-2 py-2 font-medium">인원</th>
                  <th className="px-2 py-2 font-medium">종류</th>
                  <th className="px-2 py-2 font-medium">링크</th>
                </tr>
              </thead>
              <tbody>
                {job.items.map((item) => {
                  const canSelect = isRegistrable(item);
                  return (
                    <tr key={item.id} className="border-b border-border">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={selected.has(item.id)}
                          onChange={(e) => toggle(item.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-2 py-2">{resultLabel(item)}</td>
                      <td className="px-2 py-2">{item.title ?? item.username ?? item.rawInput}</td>
                      <td className="px-2 py-2">{item.memberCount ?? '-'}</td>
                      <td className="px-2 py-2">
                        {item.linkType === 'group' ? '그룹' : item.linkType === 'channel' ? '채널' : '-'}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                        {item.link ?? item.rawInput}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function defaultSelected(items: AdminInspectItemView[]) {
  return new Set(
    items
      .filter((item) => item.result === 'ok' && !item.registeredChannelId)
      .slice(0, REGISTER_MAX)
      .map((item) => item.id),
  );
}

function keepAllowedSelection(prev: Set<string>, items: AdminInspectItemView[]) {
  const allowed = new Set(
    items
      .filter(isRegistrable)
      .map((item) => item.id),
  );
  const next = new Set<string>();
  for (const id of prev) {
    if (allowed.has(id)) next.add(id);
  }
  return next;
}

/** 확인 버튼 옆 진행 막대: 라벨 · 막대 · 45% (12/27) */
function ProgressPill({
  label,
  done,
  total,
  tone,
}: {
  label: string;
  done: number;
  total: number;
  tone: 'primary' | 'emerald' | 'amber';
}) {
  const pct = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  const bar = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="flex min-w-[260px] flex-1 items-center gap-3 rounded-xl bg-muted px-3 py-2 ring-1 ring-border sm:max-w-md">
      <span className="shrink-0 text-xs font-semibold text-subtle">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <div className={`h-full rounded-full ${bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{pct}%</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

/** 아직 등록 안 한 정상 항목 수 ([정상만 선택] 과 같은 기준) */
function remainingNormals(items: AdminInspectItemView[]): number {
  return items.filter((item) => item.result === 'ok' && !item.registeredChannelId).length;
}

/** 목록을 지울 때 남기는 한 줄 요약 */
function summarizeJob(items: AdminInspectItemView[], registeredNow: number): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.result || item.result === 'ok' || item.result === 'language_unknown') continue;
    const label = RESULT_LABEL[item.result] ?? item.result;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const rest = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${label} ${n}`);
  return `✅ 등록이 완료되었습니다. ${[`새로 등록 ${registeredNow}개`, ...rest].join(' · ')} (확인 목록은 지웠어요)`;
}
