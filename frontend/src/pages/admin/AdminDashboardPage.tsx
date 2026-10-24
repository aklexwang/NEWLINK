import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, type AdminDashboard } from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';

function Card({
  to,
  label,
  value,
}: {
  to: string;
  label: string;
  value: number | string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:ring-blue-200"
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Link>
  );
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
    ? `${run.mode} · ${run.status} · 처리 ${run.processed}/${run.total}`
    : '기록 없음';

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-xl font-bold text-slate-900">대시보드</h2>
      <p className="mt-1 text-sm text-slate-500">숫자를 누르면 해당 조건의 목록으로 갑니다.</p>
      {message && <AdminMessage message={message} />}
      {!data ? (
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-white" />
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card to="/admin/links?type=channel" label="채널" value={data.channelCount} />
            <Card to="/admin/links?type=group" label="그룹" value={data.groupCount} />
            <Card to="/admin/links?memberPage=yes" label="회원 페이지 노출" value={data.memberVisible} />
            <Card to="/admin/links?memberPage=no" label="회원 페이지 숨김" value={data.memberHidden} />
            <Card to="/admin/links?status=pending" label="승인 대기" value={data.pendingCount} />
            <Card to="/admin/links?createdFrom=today" label="오늘 등록" value={data.registered.today.total} />
            <Card to="/admin/links?createdFrom=7d" label="최근 7일 등록" value={data.registered.last7d.total} />
            <Card to="/admin/links" label="마지막 수집" value={runLabel} />
          </div>

          <section className="mt-8">
            <h3 className="text-sm font-semibold text-slate-800">오늘 / 7일 등록 경로</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Card to="/admin/links?createdFrom=today&source=auto" label="오늘 자동" value={data.registered.today.auto} />
              <Card to="/admin/links?createdFrom=today&source=admin" label="오늘 어드민" value={data.registered.today.admin} />
              <Card to="/admin/links?createdFrom=today&source=report" label="오늘 제보" value={data.registered.today.report} />
              <Card to="/admin/links?createdFrom=7d&source=auto" label="7일 자동" value={data.registered.last7d.auto} />
              <Card to="/admin/links?createdFrom=7d&source=admin" label="7일 어드민" value={data.registered.last7d.admin} />
              <Card to="/admin/links?createdFrom=7d&source=report" label="7일 제보" value={data.registered.last7d.report} />
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-slate-800">숨김 이유</h3>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {Object.entries(data.hiddenReasons).map(([reason, count]) => (
                    <tr key={reason} className="border-t border-slate-100">
                      <td className="py-2">
                        <Link className="text-blue-700 hover:underline" to={`/admin/links?memberPage=no&hideReason=${encodeURIComponent(reason)}`}>
                          {reason || '(없음)'}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-medium">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-slate-800">수집 상태</h3>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {Object.entries(data.collectStatus).map(([status, count]) => (
                    <tr key={status} className="border-t border-slate-100">
                      <td className="py-2">
                        <Link
                          className="text-blue-700 hover:underline"
                          to={`/admin/links?collectStatus=${encodeURIComponent(status === '(없음)' ? 'none' : status)}`}
                        >
                          {status}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-medium">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-slate-800">언어</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="rounded-full bg-slate-100 px-3 py-1 text-sm" to="/admin/links?language=ko">한국어 {data.language.ko}</Link>
                <Link className="rounded-full bg-slate-100 px-3 py-1 text-sm" to="/admin/links?language=foreign">외국어 {data.language.foreign}</Link>
                <Link className="rounded-full bg-slate-100 px-3 py-1 text-sm" to="/admin/links?language=unknown">미확인 {data.language.unknown}</Link>
              </div>
            </section>
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="text-sm font-semibold text-slate-800">카테고리 상위 10</h3>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {data.categories.map((row) => (
                    <tr key={row.name} className="border-t border-slate-100">
                      <td className="py-2">
                        <Link className="text-blue-700 hover:underline" to={`/admin/links?category=${encodeURIComponent(row.name)}`}>
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-medium">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          {run && (
            <p className="mt-6 text-xs text-slate-500">
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
