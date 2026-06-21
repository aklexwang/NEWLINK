import { useCallback, useEffect, useState } from 'react';
import {
  approveChannel,
  getChannelPreview,
  getPendingChannels,
  rejectChannel,
} from '../../api/admin';
import { ChannelPreviewModal } from '../../components/ChannelPreviewModal';
import { ReporterTonPanel } from '../../components/ReporterTonPanel';
import type { ChannelPreview, PendingChannel } from '../../types/channel';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export function AdminPendingPage() {
  const [pending, setPending] = useState<PendingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getPendingChannels();
      setPending(items);
      setMessage('');
    } catch {
      setMessage('데이터를 불러오지 못했습니다. 관리자 권한을 확인하세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleOpenPreview = async (item: PendingChannel) => {
    setPreviewChannelId(item.id);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await getChannelPreview(item.id);
      setPreview(data);
    } catch {
      setMessage('채널 미리보기를 불러오지 못했습니다.');
      setPreviewChannelId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setPreviewChannelId(null);
  };

  const handleApprove = async (id: string) => {
    await approveChannel(id);
    setMessage('승인되었습니다. 로고가 회원 페이지에 노출됩니다. 광고 노출은 광고 관리에서 설정하세요.');
    closePreview();
    await loadPending();
  };

  const handleReject = async (id: string) => {
    await rejectChannel(id);
    setMessage('거절되었습니다.');
    await loadPending();
  };

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <h2 className="text-xl font-bold text-slate-900">승인 대기</h2>
        <p className="mt-1 text-sm text-slate-500">제보된 채널/그룹을 검토하고 승인합니다.</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
            {message}
          </div>
        )}

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : pending.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
            승인 대기 항목이 없습니다.
          </div>
        ) : (
          <div className="flex max-w-3xl flex-col gap-4">
            {pending.map((item) => (
              <article key={item.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="mb-3 flex items-start gap-3">
                  {item.avatarUrl ? (
                    <img
                      src={resolveMediaUrl(item.avatarUrl)}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl">📢</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">pending</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{item.category}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenPreview(item)}
                  className="mb-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  채널 미리보기 (로고 확인)
                </button>

                <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-blue-600 hover:underline">
                  {item.link}
                </a>
                <ReporterTonPanel item={item} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => handleApprove(item.id)} className="rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700">승인</button>
                  <button type="button" onClick={() => handleReject(item.id)} className="rounded-xl bg-white py-2.5 text-sm ring-1 ring-black/10 hover:bg-slate-50">거절</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ChannelPreviewModal
        preview={preview}
        loading={previewLoading}
        onClose={closePreview}
        onApprove={() => previewChannelId && handleApprove(previewChannelId)}
      />
    </>
  );
}