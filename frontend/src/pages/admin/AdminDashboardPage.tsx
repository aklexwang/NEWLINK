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
import { getAdminDashboard, getAdminStatsOps, type AdminDashboard } from '../../api/admin';
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

  useEffect(() => {
    void getAdminDashboard()
      .then(setData)
      .catch(() => setMessage('대시보드를 불러오지 못했습니다.'));
    // 서버 설정이 잘못돼 수집이 멈추는 일을 바로 보이게 (수집 운영과 같은 점검)
    void getAdminStatsOps()
      .then((ops) => setConfigWarnings(ops.configWarnings ?? []))
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
              label="비공개 채널"
              icon={<Lock />}
              value={data.privateRooms?.channel ?? 0}
              sub={
                data.privateRooms
                  ? `비공개 그룹 ${data.privateRooms.group.toLocaleString('ko-KR')} · 검사 대기 링크 ${data.privateRooms.queuedInvites.toLocaleString('ko-KR')}`
                  : undefined
              }
            />
            <StatCard to="/admin/links?memberPage=yes" label="회원 페이지 노출" icon={<Eye />} value={data.memberVisible} sub={data.memberAdultOnly ? `성인 카테고리 ${data.memberAdultOnly.toLocaleString('ko-KR')} 포함` : undefined} />
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
