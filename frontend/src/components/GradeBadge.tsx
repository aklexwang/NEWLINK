import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { getChannelDetailById } from '../api/stats';
import {
  GRADE_BANDS,
  GRADE_LABEL,
  formatScore,
  normalizeGrade,
  provisionalNote,
  weightsText,
  type GradeCode,
} from '../utils/grade';

type LinkKind = 'channel' | 'group';

/** 등급별 색. 최상이 가장 눈에 띄고 아래로 갈수록 차분하다 */
const GRADE_CLASS: Record<GradeCode, string> = {
  S: 'bg-linear-to-r from-amber-400 to-orange-500 text-white ring-amber-300 shadow-sm',
  A: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  B: 'bg-sky-100 text-sky-800 ring-sky-200',
  C: 'bg-orange-50 text-orange-700 ring-orange-200',
  D: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const SIZE_CLASS = {
  sm: 'h-5 px-1.5 text-[11px]',
  md: 'h-7 px-2.5 text-[13px]',
} as const;

/** 글자가 길어도 줄바꿈·잘림 없이 한 줄로 */
const CHIP_BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-bold leading-none ring-1';

function GradeChip({ grade, size }: { grade: GradeCode; size: 'sm' | 'md' }) {
  return (
    <span className={`${CHIP_BASE} ${SIZE_CLASS[size]} ${GRADE_CLASS[grade]}`}>
      {GRADE_LABEL[grade]}
    </span>
  );
}

interface DetailExtra {
  score: number | null;
  observedDays: number | null;
  linkType: LinkKind;
}

const detailCache = new Map<string, Promise<DetailExtra>>();

/** 점수·수집 일수·종류를 모를 때만 상세를 한 번 불러온다 (채널별로 기억) */
function loadDetailExtra(channelId: string): Promise<DetailExtra> {
  const cached = detailCache.get(channelId);
  if (cached) return cached;
  const request = getChannelDetailById(channelId).then((detail) => ({
    score: detail.score ?? null,
    observedDays: detail.observedDays ?? null,
    linkType: detail.linkType === 'group' ? ('group' as const) : ('channel' as const),
  }));
  detailCache.set(channelId, request);
  request.catch(() => detailCache.delete(channelId));
  return request;
}

export interface GradeBadgeProps {
  /** 서버 grade 값(S~D). 화면에는 한글로 보인다 */
  grade: string | null | undefined;
  size?: 'sm' | 'md';
  /** 설명 창에서 점수·수집 일수를 채우는 데 쓴다 */
  channelId?: string;
  linkType?: LinkKind | null;
  score?: number | null;
  observedDays?: number | null;
  /** 상세를 못 불러왔을 때 임시 등급 문구에 쓴다 */
  lowData?: boolean;
}

export function GradeBadge({
  grade,
  size = 'md',
  channelId,
  linkType,
  score,
  observedDays,
  lowData,
}: GradeBadgeProps) {
  const code = normalizeGrade(grade);
  const [panel, setPanel] = useState<{ anchor: DOMRect; sheet: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // 카드 클릭(상세 이동)이 같이 일어나지 않게 한다
    event.stopPropagation();
    event.preventDefault();
    const anchor = event.currentTarget.getBoundingClientRect();
    const sheet = !window.matchMedia('(min-width: 640px)').matches;
    setPanel({ anchor, sheet });
  };

  const close = useCallback(() => {
    setPanel(null);
    buttonRef.current?.focus();
  }, []);

  const stopKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Enter·Space 가 카드의 키 이동으로 번지지 않게 한다
    event.stopPropagation();
  };

  if (!code) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        onKeyDown={stopKey}
        aria-haspopup="dialog"
        aria-label={`${GRADE_LABEL[code]} 등급 설명 보기`}
        className="inline-flex shrink-0 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <GradeChip grade={code} size={size} />
      </button>
      {panel &&
        createPortal(
          <GradeInfoPanel
            grade={code}
            anchor={panel.anchor}
            sheet={panel.sheet}
            channelId={channelId}
            linkType={linkType}
            score={score}
            observedDays={observedDays}
            lowData={lowData}
            onClose={close}
          />,
          document.body,
        )}
    </>
  );
}

interface GradeInfoPanelProps {
  grade: GradeCode;
  anchor: DOMRect;
  sheet: boolean;
  channelId?: string;
  linkType?: LinkKind | null;
  score?: number | null;
  observedDays?: number | null;
  lowData?: boolean;
  onClose: () => void;
}

const PANEL_WIDTH = 296;
const PANEL_GAP = 8;
const PANEL_FIT_HEIGHT = 380;

function GradeInfoPanel({
  grade,
  anchor,
  sheet,
  channelId,
  linkType,
  score,
  observedDays,
  lowData,
  onClose,
}: GradeInfoPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const needsFetch =
    Boolean(channelId) && (score === undefined || observedDays === undefined || linkType == null);
  const [fetched, setFetched] = useState<DetailExtra | 'failed' | null>(null);

  useEffect(() => {
    if (!needsFetch || !channelId) return;
    let cancelled = false;
    loadDetailExtra(channelId)
      .then((extra) => {
        if (!cancelled) setFetched(extra);
      })
      .catch(() => {
        if (!cancelled) setFetched('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, channelId]);

  useEffect(() => {
    // 포커스 이동으로 화면이 밀리지 않게 한다 (밀리면 팝오버가 닫힌다)
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = 'hidden';
    // PC 팝오버는 열 때 위치에 고정이라 화면이 움직이면 닫는다
    const onMove = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node | null)) return;
      onClose();
    };
    if (!sheet) {
      window.addEventListener('scroll', onMove, true);
      window.addEventListener('resize', onMove);
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [sheet, onClose]);

  const extra = fetched && fetched !== 'failed' ? fetched : null;
  const effectiveScore = score !== undefined ? score : (extra?.score ?? null);
  const effectiveDays = observedDays !== undefined ? observedDays : (extra?.observedDays ?? null);
  const kind: LinkKind | null = linkType ?? extra?.linkType ?? null;
  const loading = needsFetch && fetched === null;
  const note =
    provisionalNote(effectiveDays) ??
    (effectiveDays == null && lowData ? '수집 7일 미만 · 임시 등급' : null);
  const scoreText = formatScore(effectiveScore);

  const body = (
    <div className="text-[13px] leading-snug text-slate-700">
      <div className="flex items-center gap-2.5">
        <GradeChip grade={grade} size="md" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-slate-900">{GRADE_LABEL[grade]} 등급</p>
          <p className="text-[12px] text-slate-500">
            {scoreText ? `${scoreText} / 100점 만점` : loading ? '점수 불러오는 중…' : '점수 집계 전'}
          </p>
        </div>
      </div>

      {note && (
        <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-800">
          {note}
        </p>
      )}

      <p className="mt-4 text-[12px] font-semibold text-slate-900">점수 기준</p>
      <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600">
        {(kind === null || kind === 'channel') && (
          <li>
            {kind === null ? '채널: ' : ''}
            {weightsText('channel')}
          </li>
        )}
        {(kind === null || kind === 'group') && (
          <li>
            {kind === null ? '그룹: ' : ''}
            {weightsText('group')}
          </li>
        )}
      </ul>

      <p className="mt-4 text-[12px] font-semibold text-slate-900">등급 구간</p>
      <ul className="mt-1 space-y-1">
        {GRADE_BANDS.map((band) => (
          <li
            key={band.grade}
            className={`flex items-center justify-between rounded-md px-2 py-1 text-[12px] ${
              band.grade === grade ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600'
            }`}
          >
            <span>{band.label}</span>
            <span>{band.range}</span>
          </li>
        ))}
      </ul>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-slate-100 py-2 text-[13px] font-semibold text-slate-700"
      >
        닫기
      </button>
    </div>
  );

  // 포털이어도 React 이벤트는 카드까지 올라가므로 여기서 막는다 (카드 클릭 이동 방지)
  const stop = (event: ReactMouseEvent | ReactKeyboardEvent) => event.stopPropagation();

  if (sheet) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-end bg-black/40"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        onKeyDown={stop}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="등급 설명"
          className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          onClick={stop}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden />
          {body}
        </div>
      </div>
    );
  }

  const left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - PANEL_WIDTH - 8));
  const placeAbove = anchor.bottom + PANEL_GAP + PANEL_FIT_HEIGHT > window.innerHeight;
  const vertical = placeAbove
    ? { bottom: Math.max(8, window.innerHeight - anchor.top + PANEL_GAP) }
    : { top: anchor.bottom + PANEL_GAP };

  return (
    <div
      className="fixed inset-0 z-[70]"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={stop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="등급 설명"
        className="absolute max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10"
        style={{ left, width: PANEL_WIDTH, ...vertical }}
        onClick={stop}
      >
        {body}
      </div>
    </div>
  );
}
