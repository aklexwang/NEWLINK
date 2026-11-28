import { useCallback, useEffect, useState } from 'react';
import {
  bulkPromoTargets,
  getPromoJoin,
  promoJoinNow,
  updatePromoJoin,
  type PromoJoinStatus,
  createPromoCreative,
  deletePromoCreative,
  getPromoCreatives,
  getPromoLogs,
  getPromoStatus,
  getPromoTargets,
  promoSendNow,
  suggestPromoCopies,
  syncPromoTargets,
  updatePromoCreative,
  updatePromoSettings,
  updatePromoTarget,
  uploadPromoImage,
  type PromoCreative,
  type PromoLog,
  type PromoStatus,
  type PromoTarget,
} from '../../api/promo';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import {
  PROMO_IMAGE_STYLES,
  promoHeadlines,
  renderPromoImage,
  type PromoImageStyle,
} from '../../utils/promoImage';

const card = 'rounded-[16px] bg-card p-5 shadow-[var(--hz-shadow)] md:p-6';
const btn =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition disabled:opacity-40';
const btnPrimary = `${btn} bg-[#229af0] text-white hover:bg-[#1683e6]`;
const btnGhost = `${btn} border border-border bg-card hover:bg-muted`;

const GAP_OPTIONS = [180, 240, 360, 480, 720, 1440];

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function gapLabel(min: number) {
  return min % 60 === 0 ? `${min / 60}시간` : `${min}분`;
}
const STATUS_LABEL: Record<string, string> = {
  ok: '정상',
  room_blocked: '글쓰기 막힘',
  gone: '나간 방',
};

/** 홍보 자동화: 홍보 전용 계정이 들어가 있는 홍보방에 방별 규칙을 지키며 천천히 올린다 */
export function AdminPromoPage() {
  const [status, setStatus] = useState<PromoStatus | null>(null);
  const [targets, setTargets] = useState<PromoTarget[]>([]);
  const [creatives, setCreatives] = useState<PromoCreative[]>([]);
  const [logs, setLogs] = useState<PromoLog[]>([]);
  const [join, setJoin] = useState<PromoJoinStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newStyle, setNewStyle] = useState<PromoImageStyle>('bright');
  const [filter, setFilter] = useState<'all' | 'on' | 'off' | 'forbidden'>('all');

  const load = useCallback(async () => {
    try {
      const [s, t, c, l] = await Promise.all([
        getPromoStatus(),
        getPromoTargets(),
        getPromoCreatives(),
        getPromoLogs(50),
      ]);
      setStatus(s);
      setTargets(t);
      setCreatives(c);
      setLogs(l);
      setJoin(await getPromoJoin().catch(() => null));
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '불러오지 못했어요.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setMessage('');
    try {
      const m = await fn();
      if (m) setMessage(m);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '처리하지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  const settings = status?.settings;

  /** 문구 하나 + 스타일로 이미지 그려 올리고 홍보 글로 저장 */
  const makeCreative = async (text: string, style: PromoImageStyle, idx: number, source: string) => {
    const heads = promoHeadlines(status?.rooms ?? 0);
    const blob = await renderPromoImage({
      style,
      headline: heads[idx % heads.length],
      sub: '텔레그램 채널·그룹 디렉터리 · 무료',
      chips: ['카테고리별', '랭킹', '급상승', '무료 등록'],
      cta: 'TellLink 열기 →',
    });
    const imageUrl = await uploadPromoImage(blob);
    await createPromoCreative({ text, imageUrl, source });
  };

  const autoGenerate = () =>
    run('gen', async () => {
      const res = await suggestPromoCopies(5);
      const styles = PROMO_IMAGE_STYLES.map((s) => s.id);
      for (let i = 0; i < res.copies.length; i += 1) {
        await makeCreative(res.copies[i], styles[i % styles.length], i, res.source);
      }
      return `홍보 글 ${res.copies.length}개를 만들었어요 (${res.source === 'ai' ? 'AI 문구' : '기본 문구'} + 이미지).`;
    });

  const shown = targets.filter((t) =>
    filter === 'on' ? t.enabled : filter === 'off' ? !t.enabled : filter === 'forbidden' ? t.ruleForbidden : true,
  );

  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-10 md:px-7">
      <p className="text-sm text-muted-foreground">
        홍보 전용 텔레그램 계정이 들어가 있는 홍보방에, 방마다 정해진 횟수·간격을 지키며 TellLink 홍보 글을 천천히 올려요.
        텔레그램이 경고를 보내면 바로 멈춰요. 수집 계정(1~3번)과는 완전히 따로예요.
      </p>
      {message && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200">
          {message}
        </p>
      )}

      {/* 계정·상태 */}
      <div className={card}>
        {!status ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : !status.configured ? (
          <div className="space-y-3">
            <p className="text-[16px] font-bold">📱 홍보 계정이 아직 연결되지 않았어요</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>홍보용 텔레그램 계정(4번)을 새로 만들어요. 수집용 3번 계정은 쓰지 않아요.</li>
              <li>
                PC에서 <code className="rounded bg-muted px-1">npm run telegram:login -- --promo</code> 로 로그인하면
                세션이 <code className="rounded bg-muted px-1">TELEGRAM_PROMO_SESSION</code> 에 저장돼요.
              </li>
              <li>그 값을 Render 환경변수 TELEGRAM_PROMO_SESSION 에 넣고 다시 배포해요.</li>
              <li>홍보 계정으로 무료 홍보방들에 미리 들어가 두고, 여기서 [방 목록 가져오기]를 눌러요.</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
                  📣 {status.account?.name ?? '홍보 계정'}
                  {status.account?.username && (
                    <span className="text-sm font-medium text-muted-foreground">@{status.account.username}</span>
                  )}
                  {status.account?.premium && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-bold text-violet-600">프리미엄</span>
                  )}
                  {status.accountError && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-600">
                      연결 오류 {status.accountError}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  오늘 {status.todaySent} / {settings?.dailyMax}건 · 켜진 방 {status.targetOn} / {status.targetTotal} · 켜진 홍보 글{' '}
                  {status.creativeOn}개 · 마지막 {fmtTime(status.lastPostedAt)} ·{' '}
                  {status.activeHourNow ? '지금 활동 시간' : '지금은 쉬는 시간'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy != null}
                onClick={() =>
                  void run('toggle', async () => {
                    await updatePromoSettings({ enabled: !settings?.enabled });
                    return !settings?.enabled ? '자동 홍보를 켰어요.' : '자동 홍보를 껐어요.';
                  })
                }
                className={`${btn} ${settings?.enabled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-muted text-foreground hover:bg-muted/70'}`}
              >
                {settings?.enabled ? '● 자동 홍보 켜짐' : '○ 자동 홍보 꺼짐'}
              </button>
              <button
                type="button"
                disabled={busy != null}
                className={btnGhost}
                onClick={() =>
                  void run('send', async () => {
                    const r = await promoSendNow();
                    return r.sent ? `"${r.target}" 에 1건 보냈어요.` : `보내지 않았어요: ${r.reason}`;
                  })
                }
              >
                지금 1건 보내기
              </button>
            </div>

            {settings?.pausedUntil && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/30">
                <p className="min-w-0 flex-1 text-sm">
                  <b className="text-red-600">⏸ 자동 멈춤</b> · {settings.pauseReason} · {fmtTime(settings.pausedUntil)} 까지
                </p>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy != null}
                  onClick={() =>
                    void run('unpause', async () => {
                      await updatePromoSettings({ pausedUntil: null });
                      return '멈춤을 풀었어요.';
                    })
                  }
                >
                  멈춤 풀기
                </button>
              </div>
            )}

            {settings && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">
                  <span className="text-muted-foreground">하루 전체 최대</span>
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3"
                    value={settings.dailyMax}
                    onChange={(e) => void run('set', async () => void (await updatePromoSettings({ dailyMax: Number(e.target.value) })))}
                  >
                    {[3, 5, 8, 10, 15, 20, 30, 40].map((n) => (
                      <option key={n} value={n}>
                        {n}건{n <= 5 ? ' (새 계정 권장)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">글 사이 최소 간격</span>
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3"
                    value={settings.globalGapMin}
                    onChange={(e) => void run('set', async () => void (await updatePromoSettings({ globalGapMin: Number(e.target.value) })))}
                  >
                    {[15, 20, 30, 45, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {n}분
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">활동 시간 (KST)</span>
                  <div className="mt-1 flex items-center gap-1">
                    <select
                      className="h-10 flex-1 rounded-xl border border-border bg-card px-2"
                      value={settings.hourStart}
                      onChange={(e) => void run('set', async () => void (await updatePromoSettings({ hourStart: Number(e.target.value) })))}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {h}시
                        </option>
                      ))}
                    </select>
                    ~
                    <select
                      className="h-10 flex-1 rounded-xl border border-border bg-card px-2"
                      value={settings.hourEnd}
                      onChange={(e) => void run('set', async () => void (await updatePromoSettings({ hourEnd: Number(e.target.value) })))}
                    >
                      {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                        <option key={h} value={h}>
                          {h}시
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">홍보 링크</span>
                  <input
                    defaultValue={settings.link}
                    onBlur={(e) => {
                      if (e.target.value !== settings.link) {
                        void run('set', async () => void (await updatePromoSettings({ link: e.target.value })));
                      }
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 font-mono text-xs"
                  />
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              안전 규칙: 방마다 하루 최대 {status.limits.roomDailyCap}회 · 같은 방 최소 {gapLabel(status.limits.roomMinGapMin)} 간격 ·
              10분마다 한 곳에 1건 · 같은 방에 같은 글 연속 금지 · 텔레그램 경고(쉬어라/스팸 제한) 오면 자동 멈춤 · 강퇴·글쓰기 막힌 방은
              자동으로 꺼짐. 새 계정은 1~2주 동안 하루 5건 정도로 시작하세요.
            </p>
          </div>
        )}
      </div>

      {/* 홍보 글 */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[16px] font-bold">🖼 홍보 글 ({creatives.length})</p>
          <button type="button" className={btnPrimary} disabled={busy != null} onClick={() => void autoGenerate()}>
            {busy === 'gen' ? '만드는 중…' : '✨ 자동 생성 (문구+이미지 5개)'}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          여러 개를 돌려 써요(같은 글 반복은 스팸으로 보여요). 문구는 AI가 쓰고, AI를 못 쓰면 기본 문구로 만들어요. 이미지는 4가지 스타일로 그려요.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
            placeholder="직접 쓰기: 홍보 문구를 입력하면 선택한 스타일로 이미지를 같이 만들어 저장해요"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-2">
            <select
              value={newStyle}
              onChange={(e) => setNewStyle(e.target.value as PromoImageStyle)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            >
              {PROMO_IMAGE_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnGhost}
              disabled={busy != null || newText.trim().length < 10}
              onClick={() =>
                void run('add', async () => {
                  await makeCreative(newText.trim(), newStyle, creatives.length, 'manual');
                  setNewText('');
                  return '홍보 글을 추가했어요.';
                })
              }
            >
              + 추가
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {creatives.map((c) => (
            <div key={c.id} className={`overflow-hidden rounded-2xl ring-1 ring-border ${c.enabled ? '' : 'opacity-50'}`}>
              {c.imageUrl && (
                <img src={resolveMediaUrl(c.imageUrl)} alt="" className="aspect-[1200/630] w-full object-cover" loading="lazy" />
              )}
              <div className="space-y-2 p-3">
                <p className="line-clamp-6 whitespace-pre-line text-[13px]">{c.text}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.source === 'ai' ? 'AI' : c.source === 'template' ? '기본' : '직접'} · 보낸 횟수 {c.sentCount} · 마지막 {fmtTime(c.lastSentAt)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${btnGhost} h-8 px-3 text-xs`}
                    disabled={busy != null}
                    onClick={() => void run('c', async () => void (await updatePromoCreative(c.id, { text: c.text, imageUrl: c.imageUrl, enabled: !c.enabled })))}
                  >
                    {c.enabled ? '끄기' : '켜기'}
                  </button>
                  <button
                    type="button"
                    className={`${btnGhost} h-8 px-3 text-xs`}
                    disabled={busy != null}
                    onClick={() => {
                      const next = window.prompt('문구 고치기', c.text);
                      if (next && next.trim() !== c.text) {
                        void run('c', async () => void (await updatePromoCreative(c.id, { text: next.trim(), imageUrl: c.imageUrl, enabled: c.enabled })));
                      }
                    }}
                  >
                    문구 고치기
                  </button>
                  <button
                    type="button"
                    className={`${btnGhost} h-8 px-3 text-xs text-red-600`}
                    disabled={busy != null}
                    onClick={() => {
                      if (window.confirm('이 홍보 글을 지울까요?')) void run('c', async () => void (await deletePromoCreative(c.id)));
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 홍보방 자동 가입 */}
      {join && (
        <div className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[16px] font-bold">🤝 홍보방 자동 가입</p>
            <button
              type="button"
              className={join.settings.enabled ? btnPrimary : btnGhost}
              disabled={busy != null}
              onClick={() =>
                void run('join', async () => {
                  await updatePromoJoin({ enabled: !join.settings.enabled });
                  return join.settings.enabled ? '자동 가입을 껐어요.' : '자동 가입을 켰어요.';
                })
              }
            >
              {join.settings.enabled ? '● 자동 가입 켜짐' : '○ 자동 가입 꺼짐'}
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={busy != null}
              onClick={() => void run('join', async () => (await promoJoinNow()).message)}
            >
              지금 1곳 가입
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            우리 DB의 "홍보" 카테고리 공개 그룹(회원 많은 순)에 홍보 계정이 천천히 들어가요. 가입 사이 1시간~1시간 30분, 활동
            시간에만. 들어간 방은 아래 홍보방 목록에 꺼진 상태로 추가돼요. 텔레그램이 경고하면 가입만 자동으로 멈춰요.
          </p>
          {join.settings.pausedUntil && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">
              ⏸ 가입 멈춤: {join.settings.pauseReason} · {new Date(join.settings.pausedUntil).toLocaleString('ko-KR')} 까지
              <button
                type="button"
                className="ml-auto rounded-lg bg-white px-3 py-1 text-xs font-semibold ring-1 ring-amber-300"
                onClick={() => void run('join', async () => (await updatePromoJoin({ resume: true }), '가입 멈춤을 풀었어요.'))}
              >
                멈춤 풀기
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              하루 가입
              <select
                value={join.settings.daily}
                disabled={busy != null}
                onChange={(e) =>
                  void run('join', async () => {
                    await updatePromoJoin({ daily: Number(e.target.value) });
                    return `하루 ${e.target.value}곳으로 바꿨어요.`;
                  })
                }
                className="h-9 rounded-lg border border-border bg-card px-2"
              >
                {[3, 5, 8, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}곳{n === 5 ? ' (새 계정 권장)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <span>
              오늘 <b>{join.today}</b> / {join.settings.daily}
            </span>
            <span>
              들어감 <b>{join.totals.joined}</b> · 승인 대기 <b>{join.totals.requested}</b> · 못 들어감{' '}
              <b>{join.totals.failed}</b>
            </span>
            <span className="text-muted-foreground">남은 후보 {join.candidatesLeft}곳</span>
          </div>
          {join.recent.length > 0 && (
            <div className="mt-3 divide-y divide-border rounded-xl ring-1 ring-border">
              {join.recent.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                      a.status === 'joined'
                        ? 'bg-green-100 text-green-800'
                        : a.status === 'requested'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-muted text-subtle'
                    }`}
                  >
                    {a.status === 'joined' ? '들어감' : a.status === 'requested' ? '승인 대기' : '못 들어감'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {a.title} <span className="text-muted-foreground">@{a.username}</span>
                    {a.status === 'failed' && a.error && <span className="ml-1 text-xs text-muted-foreground">({a.error})</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(a.attemptedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 홍보방 */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-[16px] font-bold">💬 홍보방 ({targets.length})</p>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy != null || !status?.configured}
            onClick={() =>
              void run('sync', async () => {
                const r = await syncPromoTargets();
                return `그룹 ${r.groups}곳 확인 · 새로 ${r.added}곳 · 나간 방 ${r.gone}곳`;
              })
            }
          >
            {busy === 'sync' ? '가져오는 중…' : '방 목록 가져오기'}
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={busy != null}
            onClick={() =>
              void run('bulk', async () => {
                const r = await bulkPromoTargets('all', true, true);
                return `${r.changed}곳을 켰어요 ('홍보 금지'로 보이는 방은 건너뜀).`;
              })
            }
          >
            금지 아닌 방 모두 켜기
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={busy != null}
            onClick={() =>
              void run('bulk', async () => {
                const r = await bulkPromoTargets('all', false, false);
                return `${r.changed}곳을 껐어요.`;
              })
            }
          >
            모두 끄기
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          새로 가져온 방은 꺼진 상태예요. 소개글에서 읽은 규칙(1일 N회·N시간 간격·홍보 금지)으로 하루 횟수·간격을 미리 채워 두니 확인하고 켜 주세요.
        </p>
        <div className="mt-3 flex gap-1.5">
          {(
            [
              ['all', '전체'],
              ['on', '켜짐'],
              ['off', '꺼짐'],
              ['forbidden', '홍보 금지 의심'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${filter === k ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">방</th>
                <th className="py-2 pr-2">소개글 규칙</th>
                <th className="py-2 pr-2">하루</th>
                <th className="py-2 pr-2">간격</th>
                <th className="py-2 pr-2">오늘</th>
                <th className="py-2 pr-2">마지막</th>
                <th className="py-2 pr-2">상태</th>
                <th className="py-2">켜기</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2">
                    <p className="font-semibold">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.username ? `@${t.username} · ` : ''}
                      {t.memberCount != null ? `${t.memberCount.toLocaleString('ko-KR')}명` : ''}
                      {t.textOnly ? ' · 글만(사진 막힘)' : ''}
                    </p>
                  </td>
                  <td className="max-w-[260px] py-2 pr-2 text-xs">
                    {t.ruleForbidden && <span className="mr-1 rounded bg-red-500/10 px-1.5 py-0.5 font-bold text-red-600">홍보 금지?</span>}
                    <span className="text-muted-foreground" title={t.about ?? ''}>
                      {t.ruleText ?? (t.about ? '규칙 문구 없음' : '소개글 없음')}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={t.dailyLimit}
                      onChange={(e) => void run('t', async () => void (await updatePromoTarget(t.id, { dailyLimit: Number(e.target.value) })))}
                      className="h-8 rounded-lg border border-border bg-card px-2"
                    >
                      {Array.from({ length: status?.limits.roomDailyCap ?? 3 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}회
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={t.minGapMinutes}
                      onChange={(e) => void run('t', async () => void (await updatePromoTarget(t.id, { minGapMinutes: Number(e.target.value) })))}
                      className="h-8 rounded-lg border border-border bg-card px-2"
                    >
                      {[...new Set([...GAP_OPTIONS, t.minGapMinutes])]
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n} value={n}>
                            {gapLabel(n)}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">
                    {t.todayCount}/{t.dailyLimit}
                  </td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground">{fmtTime(t.lastPostedAt)}</td>
                  <td className="py-2 pr-2 text-xs">
                    <span className={t.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>{STATUS_LABEL[t.status] ?? t.status}</span>
                    {t.lastError && <p className="text-[11px] text-muted-foreground">{t.lastError}</p>}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => {
                        if (!t.enabled && t.ruleForbidden && !window.confirm('소개글에 홍보 금지로 보이는 문구가 있어요. 그래도 켤까요?')) return;
                        void run('t', async () => void (await updatePromoTarget(t.id, { enabled: !t.enabled })));
                      }}
                      className={`h-8 rounded-full px-3 text-xs font-bold ${t.enabled ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}
                    >
                      {t.enabled ? '켜짐' : '꺼짐'}
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {targets.length === 0 ? '홍보 계정으로 홍보방에 들어간 뒤 [방 목록 가져오기]를 눌러 주세요.' : '해당하는 방이 없어요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기록 */}
      <div className={card}>
        <p className="text-[16px] font-bold">🧾 최근 기록</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {logs.length === 0 && <li className="py-4 text-center text-muted-foreground">아직 보낸 기록이 없어요.</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${l.ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {l.ok ? '성공' : '실패'}
              </span>
              <span className="min-w-0 flex-1 truncate">{l.targetTitle}</span>
              {l.error && <span className="text-xs text-red-600">{l.error}</span>}
              <span className="text-xs text-muted-foreground">
                {l.kind === 'manual' ? '직접 · ' : ''}
                {fmtTime(l.postedAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
