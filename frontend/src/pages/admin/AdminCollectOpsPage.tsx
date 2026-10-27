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

      {loading || !ops ? (
        <Skeleton className="mt-6 h-32 w-full" />
      ) : (
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>MTProto</CardDescription>
              <CardTitle>{ops.mtproto.enabled ? '켜짐' : '꺼짐'}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>오늘 요청</CardDescription>
              <CardTitle>{ops.mtproto.requestsToday}</CardTitle>
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
