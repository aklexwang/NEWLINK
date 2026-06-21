import { useRef, useState } from 'react';
import { importChannelAvatarFromTelegram, updateAdminChannel, uploadChannelAvatar } from '../../api/admin';
import { resolveMediaUrl } from '../../utils/mediaUrl';

interface ChannelAvatarEditorProps {
  channelId: string;
  avatarUrl?: string | null;
  avatarApproved?: boolean;
  linkType?: string;
  onUpdated: (patch: { avatarUrl: string | null; avatarApproved: boolean }) => void;
}

export function ChannelAvatarEditor({
  channelId,
  avatarUrl,
  avatarApproved,
  linkType,
  onUpdated,
}: ChannelAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState(avatarUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [error, setError] = useState('');

  const previewSrc = resolveMediaUrl(avatarUrl);
  const showImage = Boolean(avatarApproved && previewSrc);

  const applyAvatar = async (nextUrl: string | null, approved = Boolean(nextUrl)) => {
    await updateAdminChannel(channelId, { avatarUrl: nextUrl, avatarApproved: approved });
    onUpdated({ avatarUrl: nextUrl, avatarApproved: approved });
    setUrlDraft(nextUrl ?? '');
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const uploadedUrl = await uploadChannelAvatar(file);
      await applyAvatar(uploadedUrl, true);
    } catch {
      setError('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleRefreshFromTelegram = async () => {
    setRefreshing(true);
    setError('');
    try {
      const updated = await importChannelAvatarFromTelegram(channelId);
      onUpdated({
        avatarUrl: updated.avatarUrl,
        avatarApproved: updated.avatarApproved,
      });
      setUrlDraft(updated.avatarUrl ?? '');
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data
          ? String(err.response.data.message)
          : '텔레그램 아이콘 불러오기에 실패했습니다.';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveUrl = async () => {
    const value = urlDraft.trim();
    setSavingUrl(true);
    setError('');
    try {
      await applyAvatar(value || null, Boolean(value));
    } catch {
      setError('아이콘 URL 저장에 실패했습니다.');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleRemove = async () => {
    setError('');
    try {
      await applyAvatar(null, false);
    } catch {
      setError('아이콘 제거에 실패했습니다.');
    }
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-black/5">
      <p className="mb-2 text-xs font-medium text-slate-500">아이콘</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl ring-1 ring-black/5">
          {showImage ? (
            <img src={previewSrc} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span>{linkType === 'group' ? '👥' : '📢'}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {uploading ? '업로드 중...' : '이미지 업로드'}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshFromTelegram()}
              disabled={refreshing}
              className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10 disabled:opacity-50"
            >
              {refreshing ? '불러오는 중...' : '텔레그램에서 가져오기'}
            </button>
            {showImage && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600"
              >
                제거
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="이미지 URL 직접 입력"
              className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs outline-none ring-1 ring-black/10 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => void handleSaveUrl()}
              disabled={savingUrl}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              URL 저장
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
