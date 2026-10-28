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
import { getAdminDashboard, type AdminDashboard } from '../../api/admin';
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
  sub?: string;
}) {
  const long = typeof value === 'string' && value.length > 12;
  return (
    <Link to={to} className="block">
      <Card className="h-full flex-row items-center gap-4 px-4 py-4 transition-transform hover:-translate-y-0.5 sm:px-5 sm:py-5">
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
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </Card>
    </Link>
  );
}

function adminSub(v?: { visible: number; hidden: number }): string | undefined {
  if (!v) return undefined;
  return `회원 노출 ${v.visible.toLocaleString('ko-KR')} · 숨김 ${v.hidden.toLocaleString('ko-KR')}`;
}

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getAdminDashboard()
      .then(setData)
      .catch(() => setMessage('대시보드를 불러오지 못했습니다.'));
  }, []);

  const run = data?.lastCollectRun;
  const runLabel = run
    ? `${run.mode} · ${run.status} · 처리 ${run.processed}/${run.total}, 남은 ${run.remaining ?? Math.max(0, run.total - run.processed)}`
    : '기록 없음';

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-8 md:px-7">
      <p className="text-sm text-muted-foreground">숫자를 누르면 해당 조건의 목록으로 갑니다.</p>
      {message && <AdminMessage message={message} />}
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
            <StatCard to="/admin/links?memberPage=no" label="회원 페이지 숨김" icon={<EyeOff />} value={data.memberHidden} />
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
              <StatCard to="/admin/links?createdFrom=today&source=auto" label="오늘 자동" icon={<Bot />} value={data.registered.today.auto} />
              <StatCard to="/admin/links?createdFrom=today&source=admin" label="오늘 링크 등록 (어드민)" icon={<UserCog />} value={data.registered.today.admin} sub={adminSub(data.adminRegistered?.today)} />
              <StatCard to="/admin/links?createdFrom=today&source=report" label="오늘 제보" icon={<Megaphone />} value={data.registered.today.report} />
              <StatCard to="/admin/links?createdFrom=7d&source=auto" label="7일 자동" icon={<Bot />} value={data.registered.last7d.auto} />
              <StatCard to="/admin/links?createdFrom=7d&source=admin" label="7일 링크 등록 (어드민)" icon={<UserCog />} value={data.registered.last7d.admin} sub={adminSub(data.adminRegistered?.last7d)} />
              <StatCard to="/admin/links?createdFrom=7d&source=report" label="7일 제보" icon={<Megaphone />} value={data.registered.last7d.report} />
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
