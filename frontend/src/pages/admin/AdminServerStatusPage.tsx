import { useCallback, useEffect, useState } from 'react';
import { getServerStatus, type ServerLevel, type ServerStatus } from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';

/** 표 이름을 알기 쉬운 말로 */
const TABLE_LABEL: Record<string, string> = {
  channel_posts: '수집한 게시글',
  channel_snapshots: '날짜별 숫자 기록',
  channel_events: '변경 기록',
  channels: '채널·그룹',
  stored_images: '업로드 이미지',
  ad_banners: '배너 광고 이미지',
  discovered_usernames: '발견한 아이디',
  admin_inspect_items: '대량 등록 확인 목록',
  analytics_events: '방문·클릭 기록',
  users: '회원',
  discovery_keywords: '발견용 검색어',
  admin_notifications: '어드민 알림',
  payout_records: '보상 지급 기록',
  channel_scores: '채널 점수',
  category_proposals: '카테고리 제안',
  categories: '카테고리',
  rank_ads: '방 광고',
  ad_daily_stats: '광고 성과 기록',
  app_settings: '설정 값',
  stats_runs: '수집 실행 기록',
  search_logs: '검색 기록',
  channel_favorites: '즐겨찾기',
  channel_recommendations: '추천',
  mtproto_state: 'MTProto 상태',
  discovered_username_sources: '발견 출처',
  admin_inspect_jobs: '대량 등록 작업',
};

const LEVEL_STYLE: Record<ServerLevel, { bar: string; chip: string; text: string }> = {
  ok: { bar: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-600', text: '여유 있음' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-600', text: '주의 (80% 이상)' },
  danger: { bar: 'bg-red-500', chip: 'bg-red-500/15 text-red-600', text: '위험 (90% 이상)' },
};

function Meter({ title, used, limit, pct, level, unit = 'MB', foot }: {
  title: string;
  used: number;
  limit: number;
  pct: number;
  level: ServerLevel;
  unit?: string;
  foot?: string;
}) {
  const st = LEVEL_STYLE[level];
  return (
    <div className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
      <div className="flex items-center gap-2">
        <p className="mr-auto text-[15px] font-bold text-foreground">{title}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.chip}`}>{st.text}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">
        {pct}%
        <span className="ml-2 text-base font-medium text-muted-foreground">
          {used.toLocaleString('ko-KR')}
          {unit} / {limit.toLocaleString('ko-KR')}
          {unit}
        </span>
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {foot && <p className="mt-3 text-sm text-subtle">{foot}</p>}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AdminServerStatusPage() {
  const [data, setData] = useState<ServerStatus | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getServerStatus());
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '서버 상황을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getServerStatus()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((error: unknown) => {
        if (alive) setMessage(adminApiErrorMessage(error, '서버 상황을 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, []);

  const db = data?.db;
  const growthText =
    db && db.growthMbPerDay != null
      ? `하루에 약 ${db.growthMbPerDay}MB씩 늘어요${db.daysUntilFull != null ? ` · 이 속도면 약 ${db.daysUntilFull.toLocaleString('ko-KR')}일 뒤 가득 차요` : ''}`
      : '하루 증가량은 이틀 이상 기록이 쌓이면 보여요';

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-10 md:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted-foreground">
          Render 요금제 한도와 비교한 지금 사용량이에요. 80%를 넘으면 어드민 종(🔔)과 텔레그램으로 알려 드려요.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl bg-card px-4 py-2 text-sm font-medium ring-1 ring-border disabled:opacity-50"
        >
          {loading ? '확인 중…' : '↻ 다시 확인'}
        </button>
      </div>
      {message && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600">{message}</p>}

      {data && db && (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Meter
              title="💾 DB 저장 용량"
              used={db.usedMb}
              limit={db.limitMb}
              pct={db.percent}
              level={db.level}
              foot={growthText}
            />
            <Meter
              title="🧠 서버 메모리"
              used={data.memory.usedMb}
              limit={data.memory.limitMb}
              pct={data.memory.percent}
              level={data.memory.level}
              foot={`프로그램이 실제로 쓰는 양 ${data.memory.heapMb}MB · 자주 80%를 넘으면 요금제를 올릴 때예요`}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
              <p className="text-sm text-muted-foreground">요금제</p>
              <p className="mt-1 text-[15px] font-semibold">서버 · {data.plan.web}</p>
              <p className="mt-0.5 text-[15px] font-semibold">DB · {data.plan.db}</p>
            </div>
            <div className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
              <p className="text-sm text-muted-foreground">마지막 재시작(배포)</p>
              <p className="mt-1 text-xl font-bold">{fmtDate(data.server.startedAt)}</p>
              <p className="mt-0.5 text-sm text-subtle">{data.server.uptimeHours}시간째 켜져 있음</p>
            </div>
            <div className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
              <p className="text-sm text-muted-foreground">마지막 확인</p>
              <p className="mt-1 text-xl font-bold">{fmtDate(data.checkedAt)}</p>
              <p className="mt-0.5 text-sm text-subtle">CPU 부하(1분) {data.server.load1m}</p>
            </div>
          </div>

          <section className="mt-6 rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
            <p className="text-[15px] font-bold">DB를 많이 차지하는 것 (상위 10)</p>
            <div className="mt-3 space-y-2">
              {db.tables.map((t) => (
                <div key={t.name} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate font-medium" title={t.name}>
                    {TABLE_LABEL[t.name] ?? t.name}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(1, (t.mb / Math.max(1, db.tables[0]?.mb ?? 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">{t.mb}MB</span>
                  <span className="w-28 shrink-0 text-right tabular-nums text-muted-foreground">
                    {t.rows.toLocaleString('ko-KR')}줄
                  </span>
                </div>
              ))}
              {db.tables.length === 0 && <p className="text-sm text-muted-foreground">표 정보를 읽을 수 없어요.</p>}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Render 화면의 Storage 퍼센트는 DB 기록 파일(WAL)까지 포함해서 여기 숫자보다 조금 클 수 있어요. 게시글은 90일이 지나면
              자동으로 지워져요.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
