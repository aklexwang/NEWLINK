import type { ChannelPreview } from '../types/channel';

interface ChannelPreviewModalProps {
  preview: ChannelPreview | null;
  loading: boolean;
  onClose: () => void;
  onApprove: () => void;
}

export function ChannelPreviewModal({ preview, loading, onClose, onApprove }: ChannelPreviewModalProps) {
  if (!preview && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#17212b] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center px-6 py-10">
            <div className="h-24 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 h-5 w-40 animate-pulse rounded bg-white/10" />
          </div>
        ) : preview ? (
          <>
            <div className="flex flex-col items-center px-6 pb-4 pt-8 text-center">
              {preview.avatarUrl ? (
                <img
                  src={preview.avatarUrl}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover ring-2 ring-white/10"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl">📢</div>
              )}
              <h3 className="mt-4 text-xl font-bold">{preview.title}</h3>
              {preview.memberCount && (
                <p className="mt-1 text-sm text-white/60">{preview.memberCount} subscribers</p>
              )}
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-white/80">{preview.description}</p>
            </div>
            <div className="border-t border-white/10 px-4 py-4">
              <a
                href={preview.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block w-full rounded-full bg-[#2481cc] py-3 text-center text-sm font-semibold text-white"
              >
                JOIN CHANNEL
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onApprove}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
                >
                  로고 승인
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm text-white hover:bg-white/15"
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