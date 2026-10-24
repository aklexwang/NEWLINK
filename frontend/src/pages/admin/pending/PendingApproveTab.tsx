import { useCallback, useEffect, useState } from 'react';
import {
  approveChannel,
  getChannelPreview,
  getPendingChannels,
  rejectChannel,
} from '../../../api/admin';
import { CandidateAvatar } from '../../../components/admin/CandidateAvatar';
import { ChannelPreviewModal } from '../../../components/ChannelPreviewModal';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/skeleton';
import type { ChannelPreview, PendingChannel } from '../../../types/channel';
import {
  ADMIN_PENDING_ALERT_EVENT,
  refreshAdminBadges,
} from '../../../utils/adminBadges';
import { adminApiErrorMessage } from '../../../utils/adminApiError';
import { walletKindLabel } from '../../../utils/payoutDisplay';

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PendingApproveTab() {
  const [pending, setPending] = useState<PendingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);

  const loadPending = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const items = await getPendingChannels();
      setPending(items);
      setMessage('');
      refreshAdminBadges();
    } catch (error) {
      if (!opts?.silent) {
        setMessage(adminApiErrorMessage(error, '데이터를 불러오지 못했습니다. 관리자 권한을 확인하세요.'));
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    const onAlert = () => {
      void loadPending({ silent: true });
    };
    window.addEventListener(ADMIN_PENDING_ALERT_EVENT, onAlert);
    return () => window.removeEventListener(ADMIN_PENDING_ALERT_EVENT, onAlert);
  }, [loadPending]);

  const handleOpenPreview = async (item: PendingChannel) => {
    setPreviewChannelId(item.id);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await getChannelPreview(item.id);
      setPreview(data);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '채널 미리보기를 불러오지 못했습니다.'));
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
      {message && <p className="mb-4 text-sm text-foreground">{message}</p>}
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : pending.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">승인 대기 항목이 없습니다.</p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          {pending.map((item) => {
            const reporter = item.reporter;
            const telegramId = reporter?.telegramId ?? item.submittedBy;
            return (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    <CandidateAvatar
                      link={item.link}
                      avatarUrl={item.avatarUrl}
                      linkType={item.linkType ?? 'channel'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">pending</Badge>
                      <Badge variant="outline">{item.category}</Badge>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    <p>
                      텔레그램 ID:{' '}
                      <span className="font-mono font-medium">{telegramId ?? '알 수 없음'}</span>
                      {telegramId != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-1 h-7 px-2"
                          onClick={() => void copyText(String(telegramId))}
                        >
                          복사
                        </Button>
                      )}
                    </p>
                    <p>
                      사용자명:{' '}
                      {reporter?.username ? `@${reporter.username}` : reporter?.firstName ?? '-'}
                    </p>
                    <p>
                      지갑: {walletKindLabel(reporter?.walletKind)} ·{' '}
                      <span className="break-all font-mono text-xs">
                        {reporter?.tonWalletAddress || '미등록'}
                      </span>
                    </p>
                  </div>
                  <Button type="button" className="w-full" onClick={() => void handleOpenPreview(item)}>
                    채널 미리보기 (로고 확인)
                  </Button>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-primary underline"
                  >
                    {item.link}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    승인하면 회원 페이지에 공개되고 이 목록에서 빠집니다. 보상 지급은 「지급」 탭에서
                    합니다.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" onClick={() => void handleApprove(item.id)}>
                      승인
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void handleReject(item.id)}>
                      거절
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ChannelPreviewModal
        preview={preview}
        loading={previewLoading}
        onClose={closePreview}
        onApprove={() => previewChannelId && handleApprove(previewChannelId)}
      />
    </>
  );
}
