import { useCallback, useEffect, useMemo, useState } from 'react';
import { InitialAvatar } from '../components/InitialAvatar';
import { isBlankAvatarImage } from '../utils/avatarFallback';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { trackTelegramOpen } from '../api/opens';
import {
  getChannelDetailById,
  getChannelDetailByUsername,
  getChannelEvents,
  getChannelMediaMix,
  getChannelPosts,
  getChannelStats,
  verifyChannelOwner,
} from '../api/stats';
import { CategoryBadge } from '../components/CategoryBadge';
import { GradeBadge } from '../components/GradeBadge';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { useAuth } from '../providers/AuthProvider';
import { toastMessage } from '../providers/ToastProvider';
import type {
  ChannelLinkedChat,
  ChannelDetail,
  ChannelEventItem,
  ChannelEventType,
  ChannelMediaMix,
  ChannelPostItem,
  ChannelPostMediaType,
  ChannelStatsSeries,
} from '../types/stats';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { formatCount, formatPercent } from '../utils/formatCount';
import {
  deltaTone,
  formatMemberNumber,
  formatSignedMembers,
  resolveMemberDelta,
  type GrowthPeriod,
} from '../utils/memberDisplay';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { isInviteLink } from '../utils/channelDetailPath';

const EVENT_LABEL: Record<ChannelEventType, string> = {
  first_seen: '처음 관측',
  title_changed: '제목 변경',
  username_changed: '아이디 변경',
  rank_up: '순위 상승',
  gone: '사라짐',
  returned: '복귀',
  unverified: '운영자 인증 해제',
  category_changed: '카테고리 변경',
  visibility_changed: '노출 변경',
};

const VERIFY_BOT =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '').trim() ||
  'telllink_bot';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data
  ) {
    const message = error.response.data.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length > 0) return String(message[0]);
  }
  return fallback;
}

const MEDIA_META: { key: ChannelPostMediaType; label: string; icon: string }[] = [
  { key: 'photo', label: '사진', icon: '🖼' },
  { key: 'video', label: '영상', icon: '🎬' },
  { key: 'file', label: '파일', icon: '📎' },
  { key: 'text', label: '텍스트', icon: '💬' },
  { key: 'other', label: '기타', icon: '🔹' },
];

function isNotFound(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      error.response.status === 404,
  );
}

function shortDate(isoOrYmd: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrYmd)) {
    return isoOrYmd.slice(5, 10);
  }
  const d = new Date(isoOrYmd);
  if (Number.isNaN(d.getTime())) return isoOrYmd;
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function sourceLabel(href: string): string {
  try {
    const path = new URL(href).pathname.replace(/^\//, '');
    const name = path.split('/')[0];
    return name ? `@${name}` : href;
  } catch {
    return href;
  }
}

export function ChannelDetailPage() {
  const { username: usernameParam, id: idParam } = useParams();
  const navigate = useNavigate();
  const username = (usernameParam ?? '').replace(/^@/, '');
  const channelIdParam = idParam?.trim() ?? '';
  const { webApp, isLocalBrowser } = useTelegram();
  const { status: authStatus } = useAuth();
  const { searchCategories } = useCategories();
  const { favoriteIds, toggleFavorite } = useMyFavorites();

  const [detail, setDetail] = useState<ChannelDetail | null>(null);
  const [stats, setStats] = useState<ChannelStatsSeries | null>(null);
  const [posts, setPosts] = useState<ChannelPostItem[]>([]);
  const [events, setEvents] = useState<ChannelEventItem[]>([]);
  const [mediaMix, setMediaMix] = useState<ChannelMediaMix | null>(null);
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [chartTab, setChartTab] = useState<'members' | 'views'>('members');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [statsLoading, setStatsLoading] = useState(false);

  const loadSecondary = useCallback(async (channelId: string) => {
    const [postList, eventList, mix] = await Promise.all([
      getChannelPosts(channelId, 20),
      getChannelEvents(channelId, 20),
      getChannelMediaMix(channelId),
    ]);
    setPosts(postList);
    setEvents(eventList);
    setMediaMix(mix);
  }, []);

  useEffect(() => {
    if (!username && !channelIdParam) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError('');
    setDetail(null);
    void (async () => {
      try {
        const data = channelIdParam
          ? await getChannelDetailById(channelIdParam)
          : await getChannelDetailByUsername(username);
        if (cancelled) return;
        setDetail(data);
        try {
          if (data.linkType === 'group') {
            setPosts([]);
            setMediaMix(null);
            const eventList = await getChannelEvents(data.id, 20);
            if (!cancelled) setEvents(eventList);
          } else {
            await loadSecondary(data.id);
          }
        } catch {
          if (!cancelled) {
            toastMessage('부가 지표를 일부 불러오지 못했습니다.', 'info');
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (isNotFound(err)) setNotFound(true);
        else setError('채널 정보를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, channelIdParam, loadSecondary]);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setStatsLoading(true);
    void getChannelStats(detail.id, range)
      .then((series) => {
        if (!cancelled) setStats(series);
      })
      .catch(() => {
        if (!cancelled) toastMessage('추이 데이터를 불러오지 못했습니다.', 'error');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, range]);

  const categoryMeta = searchCategories.find((c) => c.id === detail?.category);
  const handle = detail?.username
    ? `@${detail.username.replace(/^@/, '')}`
    : username
      ? `@${username}`
      : isInviteLink(detail?.link)
        ? '🔒 비공개 초대방'
        : '';
  const inviteExpired = detail?.collectStatus === 'invite_expired';
  const inviteRoom = Boolean(
    detail &&
      (detail.collectStatus === 'invite_only' ||
        inviteExpired ||
        isInviteLink(detail.link)),
  );
  const favorited = detail ? favoriteIds.has(detail.id) : false;
  const lowData =
    (detail?.observedDays != null && detail.observedDays < 7) ||
    Boolean(detail?.badges.some((b) => b.code === 'low_data'));

  const avatarSources = useMemo(() => {
    if (!detail) return [];
    return getChannelAvatarSources({
      avatarUrl: resolveMediaUrl(detail.avatarUrl) || detail.avatarUrl,
      link: detail.link,
    });
  }, [detail]);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  useEffect(() => {
    setAvatarIndex(0);
    setAvatarFailed(false);
  }, [detail?.id]);

  useEffect(() => {
    document.getElementById('seo-summary')?.remove();
  }, []);

  useEffect(() => {
    const previous = document.title;
    if (notFound) {
      document.title = '채널을 찾을 수 없습니다 - TellLink';
    } else if (detail) {
      const members = formatMemberNumber(detail.memberCount ?? 0) ?? '0명';
      document.title = `${detail.title} 텔레그램 채널 · 회원 ${members} - TellLink`;
    }
    return () => {
      document.title = previous;
    };
  }, [detail, notFound]);

  const chartData = useMemo(() => {
    if (!stats) return [];
    const membersOnly = detail?.linkType === 'group' || chartTab === 'members';
    return stats.points.map((p) => ({
      date: p.date.slice(5),
      value: membersOnly ? p.memberCount : p.medianViews7d,
    }));
  }, [stats, chartTab, detail?.linkType]);

  const openTelegram = () => {
    if (!detail) return;
    // 이동 기록은 링크 이동을 막지 않게 먼저 쏘고 기다리지 않는다. (게시글 링크는 기록하지 않음)
    openTelegramChannel(webApp, isLocalBrowser, detail.link);
    trackTelegramOpen(detail.id);
  };

  const openPost = (link: string) => {
    openTelegramChannel(webApp, isLocalBrowser, link);
  };

  const handleFavorite = async () => {
    if (!detail) return;
    if (authStatus !== 'authenticated') {
      toastMessage('즐겨찾기는 로그인 후 사용할 수 있습니다.', 'info');
      return;
    }
    try {
      await toggleFavorite(detail.id);
    } catch {
      toastMessage('즐겨찾기를 바꾸지 못했습니다.', 'error');
    }
  };

  // 뒤로가기: 앞 화면이 없으면(링크로 바로 들어온 경우) 홈으로
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const handleVerify = async () => {
    if (!detail) return;
    if (authStatus !== 'authenticated') {
      toastMessage('운영자 인증은 로그인 후 사용할 수 있습니다.', 'info');
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyChannelOwner(detail.id);
      setDetail((prev) =>
        prev ? { ...prev, isVerified: result.isVerified, verifiedAt: result.verifiedAt } : prev,
      );
      setVerifyOpen(false);
      toastMessage('운영자 인증이 완료되었습니다.', 'success');
    } catch (err) {
      toastMessage(apiErrorMessage(err, '운영자 인증에 실패했습니다.'), 'error');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-5">
        <div className="flex gap-3">
          <div className="h-16 w-16 animate-pulse rounded-full bg-tg-secondary" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-5 w-2/3 animate-pulse rounded bg-tg-secondary" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-tg-secondary" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-tg-secondary" />
          ))}
        </div>
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-tg-secondary" />
        <p className="mt-4 text-center text-xs text-tg-hint">채널 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-[48px] leading-none">🔎</p>
        <h1 className="mt-4 text-lg font-bold text-tg-text">채널을 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-tg-hint">
          등록되어 있지 않거나 아직 공개되지 않았습니다.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-full bg-tg-open-bg px-5 py-2 text-sm font-semibold text-tg-open-text"
        >
          홈으로
        </Link>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm text-tg-hint">{error || '채널 정보를 표시할 수 없습니다.'}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full bg-tg-open-bg px-4 py-2 text-sm font-semibold text-tg-open-text"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (detail.isVisible === false) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-[48px] leading-none">⏸</p>
        <h1 className="mt-4 text-lg font-bold text-tg-text">노출이 중지된 채널입니다</h1>
        <p className="mt-2 text-sm text-tg-hint">{detail.title}</p>
        <Link
          to="/"
          className="mt-6 rounded-full bg-tg-open-bg px-5 py-2 text-sm font-semibold text-tg-open-text"
        >
          홈으로
        </Link>
      </div>
    );
  }

  const score = detail.latestScore;
  const avatarSrc = avatarSources[avatarIndex];
  const isGroup = detail.linkType === 'group';
  // 24시간·7일·30일 증감. 수집 기간이 모자라 값이 없으면 카드를 숨긴다
  const deltaCards = (
    [
      ['24시간', detail.growth24h, detail.memberDelta24h],
      ['7일', detail.growth7d, detail.memberDelta7d],
      ['30일', detail.growth30d, detail.memberDelta30d],
    ] as [GrowthPeriod, number | null, number | null | undefined][]
  )
    .map(([period, growth, exact]) => {
      const delta = resolveMemberDelta(exact, detail.memberCount, growth);
      const text = formatSignedMembers(delta);
      return text ? { period, text, tone: deltaTone(delta) } : null;
    })
    .filter((card): card is { period: GrowthPeriod; text: string; tone: 'up' | 'down' | 'flat' } =>
      card != null,
    );

  return (
    <div className="pb-40">
      <header className="px-4 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tg-secondary ring-1 ring-black/5">
            {avatarSrc && !avatarFailed ? (
              <img
                src={avatarSrc}
                alt=""
                referrerPolicy="no-referrer"
                onLoad={(event) => {
                  if (!isBlankAvatarImage(event.currentTarget)) return;
                  if (avatarIndex + 1 < avatarSources.length) setAvatarIndex((i) => i + 1);
                  else setAvatarFailed(true);
                }}
                onError={() => {
                  if (avatarIndex + 1 < avatarSources.length) setAvatarIndex((i) => i + 1);
                  else setAvatarFailed(true);
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <InitialAvatar title={detail.title} seed={detail.link} textClass="text-[22px]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 text-[20px] font-bold leading-tight text-tg-text">
                {detail.title}
              </h1>
              {detail.isVerified && <VerifiedBadge />}
              <GradeBadge
                grade={detail.grade}
                channelId={detail.id}
                linkType={detail.linkType}
                score={detail.score}
                observedDays={detail.observedDays}
                lowData={lowData}
              />
            </div>
            <p className="mt-0.5 text-[13px] text-tg-hint">{handle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CategoryBadge
                name={detail.category}
                emoji={categoryMeta?.emoji}
                iconUrl={categoryMeta?.iconUrl}
              />
              {detail.badges.map((badge) => (
                <span
                  key={badge.code}
                  className="rounded-full bg-tg-secondary px-2 py-0.5 text-[11px] font-medium text-tg-text"
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (authStatus !== 'authenticated') {
                  toastMessage('운영자 인증은 로그인 후 사용할 수 있습니다.', 'info');
                  return;
                }
                setVerifyOpen(true);
              }}
              className="mt-2 text-[12px] font-semibold text-tg-link"
            >
              {detail.isVerified ? '운영자 재인증' : '운영자 인증'}
            </button>
          </div>
        </div>
      </header>

      <LinkedChatSection createdOn={detail.createdOn ?? null} linked={detail.linkedChat ?? null} />

      {inviteRoom && !inviteExpired && (
        <section className="mx-4 rounded-2xl bg-tg-secondary/70 px-4 py-3 text-[13px] leading-snug text-tg-hint">
          비공개 초대방이라 인원 수만 집계합니다
        </section>
      )}
      {inviteExpired && (
        <section className="mx-4 rounded-2xl bg-tg-secondary/70 px-4 py-3 text-[13px] leading-snug text-tg-hint">
          초대 링크가 만료됐습니다. 새 링크를 제보해 주세요
        </section>
      )}

      <section className="grid grid-cols-2 gap-2 px-4">
        <MetricCard label="회원" value={formatMemberNumber(detail.memberCount) ?? '미집계'} />
        {isGroup ? (
          <MetricCard
            label="최근 7일 메시지 수"
            value={formatCount(detail.activity7d ?? detail.posts7d)}
          />
        ) : (
          <MetricCard label="평균 조회 (7일)" value={formatCount(detail.medianViews7d)} />
        )}
        {isGroup ? null : (
          <MetricCard label="실조회율" value={formatPercent(detail.viewRate)} />
        )}
        {deltaCards.map((card) => (
          <MetricCard
            key={card.period}
            label={card.period}
            value={card.text}
            valueClass={
              card.tone === 'up'
                ? 'text-emerald-600'
                : card.tone === 'down'
                  ? 'text-red-600'
                  : 'text-tg-text'
            }
          />
        ))}
      </section>

      <section className="mx-4 mt-4 rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line p-4">
        <p className="text-[13px] font-medium text-tg-hint">종합 점수</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-[40px] font-bold leading-none text-tg-text">{detail.score ?? '—'}</p>
          <div className="pb-1 text-right text-[13px] text-tg-hint">
            {score?.overallRank != null && <p>전체 {score.overallRank}위</p>}
            {score?.categoryRank != null && <p>카테고리 {score.categoryRank}위</p>}
          </div>
        </div>
        {lowData && (
          <p className="mt-2 text-[12px] leading-snug text-tg-hint">
            관측 기간이 7일 미만이라 점수는 참고용입니다. 데이터가 더 쌓이면 안정됩니다.
          </p>
        )}
        <div className="mt-4 space-y-2">
          <ScoreBar label="규모" value={score?.scaleScore} />
          {isGroup ? null : <ScoreBar label="조회율" value={score?.viewRateScore} />}
          <ScoreBar label="활동" value={score?.activityScore} />
          <ScoreBar label="성장" value={score?.growthScore} />
        </div>
      </section>

      <section className="mx-4 mt-4 rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-full bg-black/[0.05] p-0.5 dark:bg-white/[0.05]">
            <ChartTab active={chartTab === 'members'} onClick={() => setChartTab('members')}>
              회원 추이
            </ChartTab>
            {isGroup ? null : (
              <ChartTab active={chartTab === 'views'} onClick={() => setChartTab('views')}>
                평균 조회
              </ChartTab>
            )}
          </div>
          <div className="flex gap-1">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRange(d)}
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                  range === d ? 'bg-tg-open-bg text-tg-open-text' : 'text-tg-hint'
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-48 w-full">
          {statsLoading ? (
            <div className="h-full animate-pulse rounded-2xl bg-tg-secondary" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#8e8e93' }}
                  width={44}
                  tickFormatter={(v: number) => formatCount(v)}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(value) => [formatCount(typeof value === 'number' ? value : null), isGroup || chartTab === 'members' ? '회원' : '조회']}
                  labelFormatter={(label) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#12b884"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {isGroup ? null : (
        <>
      <section className="mx-4 mt-4 rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line p-4">
        <h2 className="text-[15px] font-bold text-tg-text">📊 글 구성 (90일)</h2>
        <MediaBars mix={mediaMix} />
        {mediaMix && mediaMix.topSources.length > 0 && (
          <div className="mt-3">
            <p className="text-[12px] text-tg-hint">퍼온 출처</p>
            <ul className="mt-1 space-y-1">
              {mediaMix.topSources.slice(0, 5).map((item) => (
                <li key={item.source} className="flex justify-between text-[13px] text-tg-text">
                  <span className="truncate pr-2">{sourceLabel(item.source)}</span>
                  <span className="shrink-0 text-tg-hint">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mx-4 mt-4 overflow-hidden rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line pt-4">
        <h2 className="px-4 text-[15px] font-bold text-tg-text">📝 최근 글</h2>
        {posts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-tg-hint">관측된 글이 없습니다.</p>
        ) : (
          <ul className="mt-1 divide-y divide-nl-line">
            {posts.map((post) => (
              <li key={post.messageId}>
                <button
                  type="button"
                  onClick={() => openPost(post.link)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
                >
                  <span className="text-lg">
                    {MEDIA_META.find((m) => m.key === post.mediaType)?.icon ?? '💬'}
                  </span>
                  <span className="flex-1 text-[13px] text-tg-hint">{shortDate(post.postedAt)}</span>
                  <span className="text-[14px] font-semibold text-tg-text">
                    {formatCount(post.views)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      )}

      <section className="mx-4 mt-4 mb-4 rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line p-4">
        <h2 className="text-[15px] font-bold text-tg-text">🕘 변경 기록</h2>
        {events.length === 0 ? (
          <p className="py-3 text-sm text-tg-hint">아직 기록된 변경이 없습니다.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l border-nl-line pl-4">
            {events.map((event) => (
              <li key={event.id} className="-ml-[21px]">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-tg-link" />
                  <div>
                    <p className="text-[13px] font-medium text-tg-text">{EVENT_LABEL[event.type]}</p>
                    {(event.before || event.after) && (
                      <p className="text-[12px] text-tg-hint">
                        {event.before ?? '—'} → {event.after ?? '—'}
                      </p>
                    )}
                    <p className="text-[11px] text-tg-hint">{shortDate(event.occurredAt)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {verifyOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-24 pt-8 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-nl-card p-4 shadow-xl">
            <h2 className="text-[16px] font-bold text-tg-text">운영자 인증</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-tg-hint">
              텔레그램에서 @{VERIFY_BOT} 봇을 이 채널(또는 그룹)의 관리자로 추가한 뒤 확인을 눌러 주세요. 봇과 회원님이 모두 관리자여야 인증됩니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setVerifyOpen(false)}
                disabled={verifying}
                className="flex-1 rounded-xl bg-tg-secondary py-2 text-[13px] font-semibold text-tg-text"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={verifying}
                className="flex-1 rounded-xl bg-tg-open-bg py-2 text-[13px] font-semibold text-tg-open-text disabled:opacity-50"
              >
                {verifying ? '확인 중…' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-[calc(57px+env(safe-area-inset-bottom))] left-0 right-0 z-20 mx-auto max-w-lg border-t border-nl-line bg-tg-bg/95 px-3 py-2.5 backdrop-blur-md">
        {inviteExpired ? (
          <div className="space-y-2">
            <p className="text-center text-[12px] leading-snug text-tg-hint">
              초대 링크가 만료됐습니다. 새 링크를 제보해 주세요
            </p>
            <div className="grid grid-cols-3 gap-1">
              <Link
                to="/submit"
                className="rounded-xl bg-tg-open-bg px-1 py-2 text-center text-[11px] font-semibold text-tg-open-text"
              >
                제보
              </Link>
              <ActionButton onClick={() => void handleFavorite()}>{favorited ? '★ 해제' : '⭐ 즐겨찾기'}</ActionButton>
              <ActionButton onClick={goBack}>← 뒤로가기</ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            <IconAction label="뒤로가기" onClick={goBack} iconClass="text-tg-text">
              ←
            </IconAction>
            <button
              type="button"
              onClick={openTelegram}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#2AABEE] py-3 text-[15px] font-bold text-white shadow-sm active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
              </svg>
              텔레그램에서 열기
            </button>
            <IconAction label={favorited ? '해제' : '즐겨찾기'} onClick={() => void handleFavorite()}>
              {favorited ? '★' : '⭐'}
            </IconAction>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClass = 'text-tg-text',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line px-3.5 py-3">
      <p className="text-[11px] text-tg-hint">{label}</p>
      <p className={`mt-1 truncate text-[18px] font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number | null }) {
  const pct = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11px] text-tg-hint">
        <span>{label}</span>
        <span>{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-nl-elev">
        <div className="h-full rounded-full bg-nl-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ChartTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
        active ? 'bg-nl-card text-tg-text shadow-sm ring-1 ring-nl-line dark:bg-nl-elev dark:ring-white/10' : 'text-tg-hint'
      }`}
    >
      {children}
    </button>
  );
}

function MediaBars({ mix }: { mix: ChannelMediaMix | null }) {
  const total = mix?.total ?? 0;
  if (!mix || total === 0) {
    return <p className="mt-2 text-sm text-tg-hint">아직 글 구성 데이터가 없습니다.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {MEDIA_META.map((item) => {
        const count = mix.byType[item.key] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={item.key} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[12px] text-tg-hint">
              {item.icon} {item.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tg-secondary">
              <div className="h-full rounded-full bg-tg-link" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right text-[11px] text-tg-hint">{Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function IconAction({
  onClick,
  label,
  children,
  iconClass = 'text-amber-400',
}: {
  onClick: () => void;
  label: string;
  children: string;
  iconClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl bg-nl-card py-1.5 ring-1 ring-nl-line active:scale-95"
    >
      <span className={`text-[18px] leading-none font-bold ${iconClass}`}>{children}</span>
      <span className="text-[10px] font-semibold text-tg-text">{label}</span>
    </button>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-tg-secondary px-1 py-2 text-[11px] font-semibold text-tg-text active:bg-black/[0.06]"
    >
      {children}
    </button>
  );
}

function formatKoreanDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // 개설일은 KST 날짜로
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

function LinkedChatSection({
  createdOn,
  linked,
}: {
  createdOn: string | null;
  linked: ChannelLinkedChat | null;
}) {
  const created = formatKoreanDate(createdOn);
  if (!created && !linked) return null;
  const linkedTitle = linked?.title ?? (linked?.username ? `@${linked.username}` : null);
  const target = linked?.channelId
    ? linked.username
      ? `/c/${linked.username}`
      : `/c/id/${linked.channelId}`
    : null;
  return (
    <section className="mx-4 space-y-2 rounded-2xl bg-tg-secondary/70 px-4 py-3 text-[13px] leading-snug text-tg-text">
      {created && (
        <p>
          <span className="text-tg-hint">개설</span> {created}
        </p>
      )}
      {linked && linkedTitle && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-tg-hint">
            {linked.role === 'parent'
              ? '이 대화방은 아래 채널에 딸린 방입니다'
              : '이 채널에 딸린 대화방'}
          </span>
          {target ? (
            <Link
              to={target}
              className="rounded-full bg-tg-bg px-3 py-1 text-[12px] font-semibold text-tg-link ring-1 ring-black/5"
            >
              {linked.role === 'parent' ? '📢' : '💬'} {linkedTitle}
            </Link>
          ) : (
            <span className="rounded-full bg-tg-bg px-3 py-1 text-[12px] font-semibold ring-1 ring-black/5">
              {linked.role === 'parent' ? '📢' : '💬'} {linkedTitle}
              {linked.isPrivate ? ' · 비공개' : ''}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
