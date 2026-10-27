import { useEffect, useState } from 'react';
import { getChannelQuickPreview, type QuickPreview } from '../../api/admin';

const MEDIA_ICON: Record<string, string> = {
  photo: '🖼️',
  video: '🎬',
  document: '📎',
  voice: '🎙️',
  poll: '📊',
  sticker: '🧩',
  text: '💬',
};

function shortDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 오른쪽 편집 칸의 텔레그램 미리보기: 소개글 + 최근 글 */
export function ChannelQuickPreview({ channelId }: { channelId: string }) {
  const [state, setState] = useState<{ id: string; data: QuickPreview | null; error: boolean }>({
    id: '',
    data: null,
    error: false,
  });

  useEffect(() => {
    let alive = true;
    getChannelQuickPreview(channelId)
      .then((data) => {
        if (alive) setState({ id: channelId, data, error: false });
      })
      .catch(() => {
        if (alive) setState({ id: channelId, data: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [channelId]);

  const loading = state.id !== channelId;
  const data = loading ? null : state.data;

  return (
    <div className="mt-5 rounded-2xl bg-background p-4 ring-1 ring-border">
      <p className="text-sm font-bold text-foreground">📱 텔레그램 미리보기</p>
      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : state.error ? (
        <p className="mt-2 text-sm text-destructive">미리보기를 불러오지 못했어요.</p>
      ) : (
        <>
          <p className="mt-2 text-xs font-semibold text-subtle">소개글</p>
          <p className="mt-1 max-h-24 overflow-hidden whitespace-pre-line text-[13px] leading-relaxed text-foreground">
            {data?.description || '소개글이 없어요.'}
          </p>
          <p className="mt-4 text-xs font-semibold text-subtle">최근 글</p>
          {data && data.posts.length > 0 ? (
            <ul className="mt-1.5 space-y-2">
              {data.posts.slice(0, 4).map((post, i) => (
                <li key={i} className="rounded-xl bg-card px-3 py-2 ring-1 ring-border">
                  <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{MEDIA_ICON[post.mediaType] ?? '💬'}</span>
                    <span>{shortDate(post.postedAt)}</span>
                    {post.views != null && <span>· 조회 {post.views.toLocaleString()}</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-foreground">{post.text || '(글 없이 사진·영상만)'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">{data?.note ?? '글이 없어요.'}</p>
          )}
        </>
      )}
    </div>
  );
}
