import { useCallback, useEffect, useState } from 'react';
import {
  getAdminStatsOps,
  getAdminStatsRuns,
  startAdminLightCollect,
  type AdminCollectBand,
  type AdminStatsOps,
  type AdminStatsRun,
  type AdminStatsRunKind,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';

function formatKst(value: string | null | undefined): string {
  if (!value) return '-';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '-';
  return at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/** 수집 구간: 표시 순서 · 이름 · 목표 간격 */
const QUEUE_BANDS: Array<{ key: AdminCollectBand; label: string; interval: string; rule: string }> = [
  { key: 'hot', label: '핫', interval: '12시간', rule: '신규 7일 · 회원 1만 이상 · 7일 게시 28 이상' },
  { key: 'normal', label: '보통', interval: '24시간', rule: '7일 게시 7~27 · 회원 1천 이상 · 그룹' },
  { key: 'quiet', label: '조용', interval: '48시간', rule: '7일 게시 1~6' },
  { key: 'dormant', label: '휴면', interval: '72시간', rule: '7일 게시 0 · 회원 1천 미만' },
];

function kindVariant(kind: AdminStatsRunKind): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (kind === 'completed') return 'default';
  if (kind === 'budget') return 'secondary';
  if (kind === 'interrupted') return 'destructive';
  return 'outline';
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
    if (!window.confirm('light 수집을 지금 시작할까요? 약 25분 걸립니다')) {
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
          <p className="mt-1 text-sm text-muted-foreground">
            최근 실행 기록과 MTProto 상태입니다. full 수동 실행은 없습니다.
          </p>
        </div>
        <Button type="button" disabled={starting || hasRunning} onClick={() => void handleLight()}>
          {starting || hasRunning ? '수집 중…' : 'light 수집 지금 실행'}
        </Button>
      </div>
      {message && <AdminMessage message={message} />}

      {ops?.configWarnings && ops.configWarnings.length > 0 && (
        <div className="mt-6 rounded-2xl bg-red-500/10 px-4 py-3 ring-2 ring-red-500/50">
          <p className="text-base font-bold text-red-500">⚠ 서버 설정 확인 필요 (Render → newlink-api → Environment)</p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {ops.configWarnings.map((w) => (
              <li key={w.text}>
                {w.level === 'error' ? '🔴' : '🟡'} {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ops?.miniAppGate && (
        <div className="mt-4 rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
          <p className="text-sm font-semibold text-foreground">
            🔒 공개 API 미니앱 전용 문지기 ·{' '}
            {ops.miniAppGate.mode === 'block'
              ? '막는 중'
              : ops.miniAppGate.mode === 'watch'
                ? '지켜보는 중 (아직 막지 않음)'
                : '꺼짐'}
          </p>
          <p className="mt-1 text-sm text-foreground/80">
            서명 있음(미니앱) {ops.miniAppGate.signed.toLocaleString('ko-KR')} · 관리자{' '}
            {ops.miniAppGate.admin.toLocaleString('ko-KR')} · 서명 없음(미니앱 밖){' '}
            {ops.miniAppGate.unsigned.toLocaleString('ko-KR')}
            {ops.miniAppGate.mode === 'block' &&
              ` · 막음 ${ops.miniAppGate.blocked.toLocaleString('ko-KR')} · 너무 잦아 막음 ${ops.miniAppGate.rateLimited.toLocaleString('ko-KR')}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            서버가 켜진 뒤부터 센 수예요. 미니앱으로 써 보고 "서명 있음"이 오르면 Render 의 MINIAPP_ONLY 를 true 로 바꿔 막기를 켜요.
          </p>
        </div>
      )}

      {loading || !ops ? (
        <Skeleton className="mt-6 h-32 w-full" />
      ) : (
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>MTProto</CardDescription>
              <CardTitle>{ops.mtproto.enabled ? '켜짐' : '꺼짐'}</CardTitle>
              {!ops.mtproto.enabled && (
                <p className="text-[12px] font-medium text-amber-500">{mtprotoOffReason(ops.mtproto.lastError, ops.mtproto.dailyLimit)}</p>
              )}
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>오늘 요청</CardDescription>
              <CardTitle>
                {ops.mtproto.requestsToday}
                {ops.mtproto.dailyLimit ? `/${ops.mtproto.dailyLimit}` : ''}
              </CardTitle>
              {ops.mtproto.specialReserve != null && (
                <p className="text-[11px] text-muted-foreground">
                  그중 {ops.mtproto.specialReserve}은 검색·초대 확인·가입·발견용으로 남겨 둠
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">매일 0시(한국) 초기화</p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>resolve</CardDescription>
              <CardTitle>
                {ops.mtproto.resolvesToday}/{ops.mtproto.resolveDailyLimit}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">매일 0시(한국) 초기화</p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>키워드 검색</CardDescription>
              <CardTitle>
                {ops.mtproto.searchesToday}/{ops.mtproto.searchDailyLimit}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">매일 0시(한국) 초기화</p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>비공개 채널 가입</CardDescription>
              <CardTitle>
                {ops.mtproto.joinsToday ?? 0}/{ops.mtproto.joinDailyLimit ?? 0}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                전체 {ops.mtproto.joinedTotal ?? 0}/{ops.mtproto.joinTotalMax ?? 950} · 초대 링크 확인{' '}
                {ops.mtproto.invitesToday ?? 0}/{ops.mtproto.inviteDailyLimit ?? 40} · 매일 0시 초기화
              </p>
              {ops.mtproto.joinOutcomes && Object.keys(ops.mtproto.joinOutcomes).length > 0 && (
                <p className="text-[12px] text-foreground/80">
                  오늘 결과:{' '}
                  {Object.entries(ops.mtproto.joinOutcomes)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(' · ')}
                </p>
              )}
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>FLOOD_WAIT</CardDescription>
              <CardTitle className="text-sm">{floodLabel}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>시간 예산</CardDescription>
              <CardTitle className="text-sm">
                light {ops.budgets.lightMin} / full {ops.budgets.fullMin} / 발견 {ops.budgets.discoveryMin} / 인증 재확인 {ops.budgets.verifyRecheckMin}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>발견 오늘</CardDescription>
              <CardTitle>
                {ops.discovery.today}/{ops.discovery.dailyMax}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>오늘 AI 분류</CardDescription>
              <CardTitle>
                {ops.categoryAi.configured
                  ? `${ops.categoryAi.today}/${ops.categoryAi.dailyMax}`
                  : '꺼짐'}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                {!ops.categoryAi.configured
                  ? 'AI 키 없음 · 키워드만 사용'
                  : ops.categoryAi.stopReason
                    ? `오늘 중단됨(${ops.categoryAi.stopReason}) · 키워드 결과 사용`
                    : ops.categoryAi.stopped
                      ? '오늘 상한 도달 · 키워드 결과 사용'
                      : `${ops.categoryAi.provider} · 매일 0시(한국) 초기화`}
              </p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>t.me 동시 수 (현재/상한)</CardDescription>
              <CardTitle>
                {ops.collectGate.collectLimit}/{ops.collectGate.collectMax}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                간격 {(ops.collectGate.gapMs / 1000).toFixed(2)}초
                {ops.collectGate.lockedToday ? ' · 오늘 429 초과로 1 고정' : ''}
                {ops.collectGate.coolingRemainingMs > 0
                  ? ` · 쿨다운 ${Math.ceil(ops.collectGate.coolingRemainingMs / 1000)}초 남음`
                  : ''}
              </p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>오늘 429 (t.me / Bot)</CardDescription>
              <CardTitle>
                {ops.collectGate.today.tme429} / {ops.collectGate.today.bot429}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">매일 0시(한국) 초기화</p>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>
                {ops.collectGate.run ? '이번 회차' : '지난 회차'} 수집 게이트
              </CardDescription>
              {(() => {
                const gateRun = ops.collectGate.run ?? ops.collectGate.lastRun;
                if (!gateRun) {
                  return <CardTitle className="text-sm">기록 없음</CardTitle>;
                }
                return (
                  <>
                    <CardTitle className="text-sm">
                      {gateRun.mode} · 최대 동시 {gateRun.peakCollectInflight}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      429 t.me {gateRun.tme429} / Bot {gateRun.bot429} · 쿨다운 합계{' '}
                      {Math.round(gateRun.cooldownMs / 1000)}초
                      {gateRun.timeoutBackoffs > 0
                        ? ` · 타임아웃 감속 ${gateRun.timeoutBackoffs}회`
                        : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">서버 재시작 후 0부터</p>
                  </>
                );
              })()}
            </CardHeader>
          </Card>
        </section>
      )}

      {ops?.failures && (
        <Card className="mt-6 py-0">
          <CardHeader className="px-4 pt-4">
            <CardDescription>수집 실패 이유 (지금 실패 상태인 방)</CardDescription>
            <CardTitle className="text-base">
              실패 {ops.failures.total.toLocaleString('ko-KR')}개 · 3번 이상 반복{' '}
              {ops.failures.reasons.reduce((sum, r) => sum + r.repeated, 0).toLocaleString('ko-KR')}개
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">이유</th>
                  <th className="px-2 py-1.5 text-right font-medium">방 수</th>
                  <th className="px-2 py-1.5 text-right font-medium">3번 이상</th>
                  <th className="px-2 py-1.5 font-medium">뜻</th>
                </tr>
              </thead>
              <tbody>
                {ops.failures.reasons.map((row) => (
                  <tr key={row.reason} className="border-t border-border">
                    <td className="px-2 py-1.5 font-mono text-xs">{row.reason}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.count.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.repeated.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{failureReasonLabel(row.reason)}</td>
                  </tr>
                ))}
                {ops.failures.reasons.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                      지금 실패 상태인 방이 없어요
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="px-2 pt-2 text-[11px] text-muted-foreground">
              채널·그룹 관리에서 수집 상태 "실패 묶음"으로 걸러 보면 방마다 수집 메모가 보여요.
            </p>
          </div>
        </Card>
      )}

      {ops && (
        <Card className="mt-6 py-0">
          <CardHeader className="px-4 pt-4">
            <CardDescription>수집 큐 (next_collect_at 기준)</CardDescription>
            <CardTitle className="text-sm">
              전체 {ops.queue.total.toLocaleString('ko-KR')}개 · 지금 밀림 {ops.queue.overdue.toLocaleString('ko-KR')}개 · 다음 24시간 예상 수집 {ops.queue.expected24h.toLocaleString('ko-KR')}건
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>구간</TableHead>
                <TableHead>목표 간격</TableHead>
                <TableHead className="text-right">채널 수</TableHead>
                <TableHead className="text-right">지금 밀린 수</TableHead>
                <TableHead className="text-right">다음 24시간 예상</TableHead>
                <TableHead>기준</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {QUEUE_BANDS.map((band) => {
                const row = ops.queue.bands[band.key];
                return (
                  <TableRow key={band.key}>
                    <TableCell className="font-medium">{band.label}</TableCell>
                    <TableCell>{band.interval}</TableCell>
                    <TableCell className="text-right">{row.count.toLocaleString('ko-KR')}</TableCell>
                    <TableCell className="text-right">{row.overdue.toLocaleString('ko-KR')}</TableCell>
                    <TableCell className="text-right">{row.expected24h.toLocaleString('ko-KR')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{band.rule}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="px-4 pb-4 text-[11px] text-muted-foreground">
            밀린 수는 지금 바로 수집 대상인 채널입니다. 예상 수집은 실패 백오프(1·2·4배, 최대 7일)를 반영한 추정치입니다.
          </p>
        </Card>
      )}

      <Card className="mt-8 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>모드</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>처리</TableHead>
              <TableHead>시작 (KST)</TableHead>
              <TableHead>끝 (KST)</TableHead>
              <TableHead>걸린 시간</TableHead>
              <TableHead>ended_reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  실행 기록이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.mode}</TableCell>
                  <TableCell>
                    <Badge variant={kindVariant(run.kind)}>{kindLabel(run.kind)}</Badge>
                    {run.budgetNote && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{run.budgetNote}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {run.processed}/{run.total}
                    <span className="text-muted-foreground"> · 남은 {run.remaining}</span>
                  </TableCell>
                  <TableCell className="text-xs">{formatKst(run.startedAt)}</TableCell>
                  <TableCell className="text-xs">{formatKst(run.finishedAt)}</TableCell>
                  <TableCell>{run.durationLabel}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{run.endedReason ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/** 수집 실패 코드 → 한국어 뜻 */
function failureReasonLabel(reason: string): string {
  const r = reason.toLowerCase();
  if (r.startsWith('fetch:timeout') || r.includes('timeout')) return '텔레그램 페이지 응답이 늦음 (일시적)';
  if (r.startsWith('fetch:429') || r.includes('429')) return '요청이 많아 텔레그램이 잠시 막음 (일시적)';
  if (r.startsWith('fetch:network')) return '네트워크 오류 (일시적)';
  if (r.startsWith('fetch:empty')) return '빈 응답 (일시적)';
  if (r.includes('not_found')) return '방을 찾을 수 없음 (사라졌을 수 있음)';
  if (r.includes('private')) return '비공개로 바뀜';
  if (r.includes('no_posts')) return '공개 글이 안 보임';
  if (r.includes('no_username')) return '아이디가 없음';
  if (r.startsWith('page:user')) return '개인 계정';
  if (r.startsWith('page:bot')) return '봇 계정';
  if (r.includes('http_')) return '텔레그램 페이지 오류 응답';
  if (r.includes('mtproto')) return 'MTProto 수집 오류';
  if (r.includes('bot:')) return '봇 수집 오류';
  if (r.startsWith('fetch:')) return '텔레그램 접속 오류 (일시적)';
  if (r === '(없음)') return '이유 기록 없음';
  return '';
}

/** MTProto 가 꺼진 이유 */
function mtprotoOffReason(code: string | null, dailyLimit?: number): string {
  if (!code) return 'MTPROTO_ENABLED 설정이 꺼져 있거나 세션이 없어요';
  if (code === 'daily_limit') return `오늘 요청 한도${dailyLimit ? `(${dailyLimit})` : ''}를 다 써서 0시까지 멈춤`;
  if (code === 'flood_wait') return '텔레그램 속도 제한(FLOOD_WAIT)으로 잠시 멈춤';
  if (/AUTH|SESSION|DEACTIVATED|BANNED|RESTRICTED/i.test(code)) return `계정·세션 문제(${code}) — 확인 필요`;
  return `멈춘 이유: ${code}`;
}
