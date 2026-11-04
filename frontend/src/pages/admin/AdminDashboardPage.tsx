import { useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  Megaphone,
  Radio,
  Timer,
  UserCog,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, getAdminStatsOps, type AdminDashboard, type AdminStatsOps } from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import { Badge } from '@/components/admin/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/admin/ui/table';

function StatCard({
  to,
  label,
  value,
  icon,
  sub,
}: {
  to: string;
  label: string;
  value: number | string;
  icon?: ReactNode;
  /** 숫자 아래 작은 설명 */
  sub?: ReactNode;
}) {
  const long = typeof value === 'string' && value.length > 12;
  return (
    <Link to={to} className="block">
      <Card className="relative h-full flex-row items-center gap-4 px-4 py-4 transition duration-200 ease-out hover:z-10 hover:scale-[1.04] hover:shadow-xl hover:ring-2 hover:ring-primary/40 sm:px-5 sm:py-5">
        {icon && (
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-muted text-primary sm:flex [&>svg]:size-6">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={long ? 'mt-1 text-[15px] leading-snug font-bold' : 'mt-1 text-2xl font-bold'}>
            {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
          </p>
          {sub && <div className="mt-1 space-y-0.5 text-sm font-medium text-foreground/75">{sub}</div>}
        </div>
      </Card>
    </Link>
  );
}

function kindsLine(k?: { channelPublic: number; channelPrivate: number; group: number }): string | undefined {
  if (!k) return undefined;
  const f = (n: number) => n.toLocaleString('ko-KR');
  return `채널 [공개 ${f(k.channelPublic)} / 비공개 ${f(k.channelPrivate)}] · 그룹 ${f(k.group)}`;
}

function subLines(...lines: Array<string | undefined>) {
  const list = lines.filter(Boolean) as string[];
  if (list.length === 0) return undefined;
  return (
    <>
      {list.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </>
  );
}

function adminSub(v?: { visible: number; hidden: number }): string | undefined {
  if (!v) return undefined;
  return `회원 노출 ${v.visible.toLocaleString('ko-KR')} · 숨김 ${v.hidden.toLocaleString('ko-KR')}`;
}

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [message, setMessage] = useState('');

  const [configWarnings, setConfigWarnings] = useState<Array<{ level: string; text: string }>>([]);
  const [ops, setOps] = useState<AdminStatsOps | null>(null);

  useEffect(() => {
    void getAdminDashboard()
      .then(setData)
      .catch(() => setMessage('대시보드를 불러오지 못했습니다.'));
    // 서버 설정이 잘못돼 수집이 멈추는 일을 바로 보이게 (수집 운영과 같은 점검)
    void getAdminStatsOps()
      .then((result) => {
        setOps(result);
        setConfigWarnings(result.configWarnings ?? []);
      })
      .catch(() => undefined);
  }, []);

  const run = data?.lastCollectRun;
  const modeKo = (m: string) => (m === 'light' ? '가벼운 수집' : m === 'full' ? '전체 수집' : m);
  const statusKo = (st: string) =>
    st === 'completed' ? '완료' : st === 'running' ? '진행 중' : st === 'interrupted' ? '중간에 멈춤' : st;
  const runLabel = run
    ? `${modeKo(run.mode)} · ${statusKo(run.status)} · ${run.total.toLocaleString('ko-KR')}개 중 ${
        run.succeeded != null
          ? `성공 ${run.succeeded.toLocaleString('ko-KR')} · 실패 ${(run.failed ?? 0).toLocaleString('ko-KR')}`
          : `${run.processed.toLocaleString('ko-KR')}개 처리`
      }${(run.remaining ?? 0) > 0 ? ` · 못 한 것 ${run.remaining}` : ''}`
    : '기록 없음';

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-8 md:px-7">
      <p className="text-sm text-muted-foreground">숫자를 누르면 해당 조건의 목록으로 갑니다.</p>
      {message && <AdminMessage message={message} />}
      {configWarnings.length > 0 && (
        <Link
          to="/admin/collect"
          className="mt-4 block rounded-2xl bg-red-500/10 px-4 py-3 ring-2 ring-red-500/50 hover:bg-red-500/15"
        >
          <p className="text-base font-bold text-red-500">⚠ 서버 설정 확인 필요 {configWarnings.length}건 — 눌러서 보기</p>
          <p className="mt-1 text-sm text-foreground">{configWarnings[0].text}</p>
        </Link>
      )}
      {!data ? (
        <Skeleton className="mt-6 h-32 w-full" />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
            <StatCard to="/admin/links?type=channel" label="채널" icon={<Radio />} value={data.channelCount} />
            <StatCard to="/admin/links?type=group" label="그룹" icon={<Users />} value={data.groupCount} />
            <StatCard
              to="/admin/links?q=t.me%2F%2B"
              label="비공개"
              icon={<Lock />}
              value={(data.privateRooms?.channel ?? 0) + (data.privateRooms?.group ?? 0)}
              sub={
                data.privateRooms
                  ? `채널 ${data.privateRooms.channel.toLocaleString('ko-KR')} · 그룹 ${data.privateRooms.group.toLocaleString('ko-KR')} · 검사 대기 링크 ${data.privateRooms.queuedInvites.toLocaleString('ko-KR')}`
                  : undefined
              }
            />
            {/* 큰 숫자는 회원 화면 "전체"와 같은 기준(같은 링크는 1개). 중복 등록 건수는 아래 작게 */}
            <StatCard
              to="/admin/links?memberPage=yes"
              label="회원 페이지 노출"
              icon={<Eye />}
              value={data.memberListTotal ?? data.memberVisible}
              sub={
                [
                  data.memberAdultOnly ? `성인 카테고리 ${data.memberAdultOnly.toLocaleString('ko-KR')} 포함` : null,
                  data.memberDuplicateExcess
                    ? `같은 링크 중복 ${data.memberDuplicateExcess.toLocaleString('ko-KR')}건 제외 (등록 ${data.memberVisible.toLocaleString('ko-KR')})`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
            />
            <StatCard
              to="/admin/links?memberPage=no"
              label="회원 페이지 미노출"
              icon={<EyeOff />}
              value={data.memberHidden}
              sub={(() => {
                // 첫 수집 전인 방은 수집되면 자동으로 노출된다 → 진짜 숨김과 나눠 보여 준다
                const waiting = data.hiddenReasons['아직 수집되지 않음'] ?? 0;
                const hidden = Math.max(0, data.memberHidden - waiting);
                return `⏳ 수집 대기 ${waiting.toLocaleString('ko-KR')} (자동 노출 예정) · 🚫 숨김 ${hidden.toLocaleString('ko-KR')}`;
              })()}
            />
            <StatCard to="/admin/links?status=pending" label="승인 대기" icon={<ClipboardList />} value={data.pendingCount} />
            <StatCard to="/admin/links?createdFrom=today" label="오늘 등록" icon={<CalendarPlus />} value={data.registered.today.total} />
            <StatCard to="/admin/links?createdFrom=7d" label="최근 7일 등록" icon={<CalendarDays />} value={data.registered.last7d.total} />
            <StatCard to="/admin/collect" label="마지막 수집" icon={<Timer />} value={runLabel} />
          </div>

          <TodoCard data={data} ops={ops} />

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            회원 페이지 노출 {data.memberVisible} − 같은 링크 중복 {data.memberDuplicateExcess} = 회원 화면 “전체”{' '}
            {data.memberListTotal}. 노출은 채널을 한 건씩 판정한 수이고(승인됨 · 관리자 노출 · 수집됨 · 한국어 또는 광고 ·
            불법 의심 아님 · 분류대기 아님), 성인 카테고리 방도 포함합니다(성인 방은 회원이 “성인”을 고를 때만 목록에
            보입니다). 같은 링크는 1개로 합쳐 셉니다. 숨김 이유는 아래 표 순서대로 처음 걸리는 한 가지만 셉니다.
          </p>

          <section className="mt-8">
            <h3 className="text-sm font-semibold">오늘 / 7일 등록 경로</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 md:gap-5 sm:grid-cols-3">
              <StatCard to="/admin/links?createdFrom=today&source=auto" label="오늘 자동" icon={<Bot />} value={data.registered.today.auto} sub={subLines(kindsLine(data.registeredKinds?.today.auto))} />
              <StatCard to="/admin/links?createdFrom=today&source=admin" label="오늘 링크 등록 (어드민)" icon={<UserCog />} value={data.registered.today.admin} sub={subLines(kindsLine(data.registeredKinds?.today.admin), adminSub(data.adminRegistered?.today))} />
              <StatCard to="/admin/links?createdFrom=today&source=report" label="오늘 제보" icon={<Megaphone />} value={data.registered.today.report} sub={subLines(kindsLine(data.registeredKinds?.today.report))} />
              <StatCard to="/admin/links?createdFrom=7d&source=auto" label="7일 자동" icon={<Bot />} value={data.registered.last7d.auto} sub={subLines(kindsLine(data.registeredKinds?.last7d.auto))} />
              <StatCard to="/admin/links?createdFrom=7d&source=admin" label="7일 링크 등록 (어드민)" icon={<UserCog />} value={data.registered.last7d.admin} sub={subLines(kindsLine(data.registeredKinds?.last7d.admin), adminSub(data.adminRegistered?.last7d))} />
              <StatCard to="/admin/links?createdFrom=7d&source=report" label="7일 제보" icon={<Megaphone />} value={data.registered.last7d.report} sub={subLines(kindsLine(data.registeredKinds?.last7d.report))} />
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">숨김 이유</CardTitle>
              </CardHeader>
              <Table>
                <TableBody>
                  {Object.entries(data.hiddenReasons).map(([reason, count]) => (
                    <TableRow key={reason}>
                      <TableCell>
                        <Link className="text-primary hover:underline" to={`/admin/links?memberPage=no&hideReason=${encodeURIComponent(reason)}`}>
                          {reason || '(없음)'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">수집 상태</CardTitle>
              </CardHeader>
              <Table>
                <TableBody>
                  {Object.entries(data.collectStatus).map(([status, count]) => (
                    <TableRow key={status}>
                      <TableCell>
                        <Link
                          className="text-primary hover:underline"
                          to={`/admin/links?collectStatus=${encodeURIComponent(status === '(없음)' ? 'none' : status)}`}
                        >
                          {status}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">언어</CardTitle>
              </CardHeader>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                <Badge variant="secondary" asChild>
                  <Link to="/admin/links?language=ko">한국어 {data.language.ko}</Link>
                </Badge>
                <Badge variant="secondary" asChild>
                  <Link to="/admin/links?language=foreign">외국어 {data.language.foreign}</Link>
                </Badge>
                <Badge variant="secondary" asChild>
                  <Link to="/admin/links?language=unknown">미확인 {data.language.unknown}</Link>
                </Badge>
              </div>
            </Card>
            <Card className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">카테고리 상위 10</CardTitle>
              </CardHeader>
              <Table>
                <TableBody>
                  {data.categories.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>
                        <Link className="text-primary hover:underline" to={`/admin/links?category=${encodeURIComponent(row.name)}`}>
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
          {run && (
            <p className="mt-6 text-xs text-muted-foreground">
              마지막 수집 시작 {new Date(run.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              {run.finishedAt
                ? ` · 종료 ${new Date(run.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                : ' · 진행 중'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** 아침에 한눈에: 지금 손볼 것만 모아 둔 카드 (0인 줄은 회색) */
function TodoCard({ data, ops }: { data: AdminDashboard; ops: AdminStatsOps | null }) {
  const pending = data.hiddenReasons['분류대기'] ?? 0;
  const illegal = data.hiddenReasons['불법 의심(관리자 확인)'] ?? 0;
  const failed = ops?.failures?.total ?? null;
  const repeated = ops?.failures?.reasons.reduce((sum, r) => sum + r.repeated, 0) ?? 0;
  const blocked = ops?.previewBlocked?.waiting ?? null;
  const interrupted = data.lastCollectRun?.status === 'interrupted';
  const rows: Array<{ title: string; desc: string; value: number | null; unit: string; to: string; urgent?: boolean }> = [
    { title: '승인 대기', desc: '회원 제보 확인', value: data.pendingCount, unit: '건', to: '/admin/pending' },
    {
      title: '분류 대기',
      desc: '카테고리를 정해야 하는 방 (light 수집마다 AI가 30개씩 정리)',
      value: pending,
      unit: '건',
      to: '/admin/links?category=%EB%B6%84%EB%A5%98%EB%8C%80%EA%B8%B0',
    },
    {
      title: '불법 의심 확인',
      desc: '관리자가 보고 노출·숨김을 정할 방',
      value: illegal,
      unit: '건',
      to: `/admin/links?memberPage=no&hideReason=${encodeURIComponent('불법 의심(관리자 확인)')}`,
      urgent: illegal > 0,
    },
    {
      title: '미리보기 막힌 채널',
      desc: '수집 계정 차례를 기다리는 채널 (새벽 3시에 처리)',
      value: blocked,
      unit: '개',
      to: '/admin/collect',
    },
    {
      title: '수집 실패',
      desc: repeated > 0 ? `3번 이상 반복 ${repeated.toLocaleString('ko-KR')}개` : '일시적인 실패가 대부분',
      value: failed,
      unit: '개',
      to: '/admin/links?collectStatus=failed',
    },
  ];
  return (
    <div className="mt-5 rounded-[16px] bg-card p-5 shadow-[var(--hz-shadow)]">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[16px] font-bold text-foreground">처리할 일</p>
          <p className="mt-0.5 text-xs text-muted-foreground">지금 남아 있는 건 기준 · 누르면 해당 목록으로</p>
        </div>
        {interrupted && (
          <Link to="/admin/collect" className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-500">
            ⚠ 마지막 수집이 중간에 끊겼어요
          </Link>
        )}
      </div>
      <div className="mt-3 grid gap-x-8 md:grid-cols-2">
        {rows.map((row) => (
          <Link
            key={row.title}
            to={row.to}
            className="flex items-center justify-between border-b border-border py-3 last:border-0 hover:opacity-80 md:[&:nth-last-child(2)]:border-0"
          >
            <div className="min-w-0 pr-3">
              <p className="text-sm font-semibold text-foreground">{row.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.desc}</p>
            </div>
            <p
              className={`shrink-0 text-lg font-bold tabular-nums ${
                row.value == null || row.value === 0
                  ? 'text-muted-foreground'
                  : row.urgent
                    ? 'text-red-500'
                    : 'text-primary'
              }`}
            >
              {row.value == null ? '—' : row.value.toLocaleString('ko-KR')}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">{row.unit}</span>
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
