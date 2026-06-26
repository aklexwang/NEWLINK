import type { AdminChannelLookup, ImportCandidate } from '../../api/admin';
import { CandidateAvatar } from './CandidateAvatar';
import { linkTypeLabel } from '../../utils/linkType';

interface ImportCandidatePreviewModalProps {
  candidate: ImportCandidate | null;
  lookup: AdminChannelLookup | null;
  loading: boolean;
  acting: boolean;
  onClose: () => void;
  onPublish: () => void;
  onSkip: () => void;
}

export function ImportCandidatePreviewModal({
  candidate,
  lookup,
  loading,
  acting,
  onClose,
  onPublish,
  onSkip,
}: ImportCandidatePreviewModalProps) {
  if (!candidate && !loading) return null;

  const title = lookup?.title || candidate?.title || '';
  const description = lookup?.description || candidate?.title || '';
  const memberCount = lookup?.memberCount;
  const link = candidate?.link ?? lookup?.link ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-[#17212b] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center px-6 py-10">
            <div className="h-24 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 h-5 w-40 animate-pulse rounded bg-white/10" />
            <p className="mt-3 text-sm text-white/60">텔레그램 정보를 불러오는 중...</p>
          </div>
        ) : candidate ? (
          <>
            <div className="flex flex-col items-center px-6 pb-4 pt-8 text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-white/10">
                <CandidateAvatar
                  link={link}
                  avatarUrl={lookup?.avatarUrl ?? candidate.avatarUrl}
                  linkType={candidate.linkType}
                  fallbackClassName="text-3xl"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{linkTypeLabel(candidate.linkType)}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{candidate.category}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">{candidate.source}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              {memberCount && (
                <p className="mt-1 text-sm text-white/60">구독자 {memberCount}</p>
              )}
              {!memberCount && candidate.participantsCount > 0 && (
                <p className="mt-1 text-sm text-white/60">
                  구독자 {candidate.participantsCount.toLocaleString('ko-KR')}
                </p>
              )}
              <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-white/80">{description}</p>
              <p className="mt-3 break-all text-xs text-white/50">{link}</p>
              {candidate.alreadyOnMemberPage && (
                <p className="mt-2 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                  이미 회원 페이지에 노출 중
                </p>
              )}
            </div>
            <div className="border-t border-white/10 px-4 py-4">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block w-full rounded-full bg-[#2481cc] py-3 text-center text-sm font-semibold text-white"
              >
                텔레그램에서 열기
              </a>
              <div className="flex gap-2">
                {!candidate.alreadyOnMemberPage && (
                  <>
                    <button
                      type="button"
                      onClick={onPublish}
                      disabled={acting}
                      className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      회원 페이지 노출
                    </button>
                    <button
                      type="button"
                      onClick={onSkip}
                      disabled={acting}
                      className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                    >
                      제외
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-xl bg-white/10 py-2.5 text-sm text-white hover:bg-white/15 ${candidate.alreadyOnMemberPage ? 'w-full' : 'flex-1'}`}
                >
                  닫기
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
