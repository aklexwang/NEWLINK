import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  getAdminChannels,
  getAdminPromotedChannelsPaged,
  promoteChannel,
  updateAdminChannel,
  updatePromotionOrder,
} from '../../api/admin';
import { AdClientCells, AdClientDetail } from '../../components/admin/AdClientInfo';
import { ChannelAvatarEditor } from '../../components/admin/ChannelAvatarEditor';
import { ChannelAvatar } from '../../components/admin/AdminTable';
import type { Channel, LinkType } from '../../types/channel';
import { LinkTypeToggle } from '../../components/admin/LinkTypeToggle';
import {
  dateInputToPromotedUntil,
  defaultPromoteDateInput,
  isPromotionActive,
  toDateInputValue,
} from '../../utils/promotion';
import { refreshAdminBadges } from '../../utils/adminBadges';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { formatPercent } from '../../utils/formatCount';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';

export function AdminAdsManagePage() {
  const [promoted, setPromoted] = useState<Channel[]>([]);
  const [candidates, setCandidates] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [promoteDates, setPromoteDates] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const canReorder = !query.trim();

  const isPromoteDateChanged = (channel: Channel) => {
    const edited = promoteDates[channel.id];
    if (!edited) return false;
    const saved = toDateInputValue(channel.promotedUntil);
    return edited !== saved;
  };

  const syncPromoteDates = (items: Channel[]) => {
    setPromoteDates((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (next[item.id] === undefined) {
          next[item.id] = toDateInputValue(item.promotedUntil) || defaultPromoteDateInput();
        }
      }
      return next;
    });
  };

  const loadPromoted = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getAdminPromotedChannelsPaged(query.trim() || undefined);
      setPromoted(items);
      syncPromoteDates(items);
      setMessage('');
      refreshAdminBadges();
    } catch {
      setMessage('광고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadPromoted();
  }, [loadPromoted]);

  const searchCandidates = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const result = await getAdminChannels({
        status: 'active',
        q: candidateQuery.trim() || undefined,
        pageSize: 50,
      });
      setCandidates(result.items);
      syncPromoteDates(result.items);
      setShowAddSection(true);
    } catch {
      setMessage('채널 검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleApply = async (id: string) => {
    const date = promoteDates[id];
    if (!date) {
      setMessage('노출 종료일을 입력해 주세요.');
      return;
    }
    setApplyingId(id);
    try {
      await promoteChannel(id, dateInputToPromotedUntil(date));
      setMessage('광고 기간이 적용되었습니다.');
      await loadPromoted();
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setMessage('광고 적용에 실패했습니다.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleStop = async (channel: Channel) => {
    if (
      !window.confirm(
        `「${channel.title}」광고 노출을 중지할까요?\n(광고 목록에는 만료 상태로 남습니다)`,
      )
    ) {
      return;
    }
    try {
      await updateAdminChannel(channel.id, {
        isPromoted: true,
        promotedUntil: new Date().toISOString(),
      });
      setMessage('광고 노출을 중지했습니다.');
      await loadPromoted();
    } catch {
      setMessage('광고 중지에 실패했습니다.');
    }
  };

  const handleDeleteFromAds = async (channel: Channel) => {
    if (
      !window.confirm(
        `「${channel.title}」을(를) 광고 관리에서 삭제할까요?\n(채널/그룹 등록은 유지됩니다)`,
      )
    ) {
      return;
    }
    try {
      await updateAdminChannel(channel.id, { isPromoted: false, promotedUntil: null });
      setMessage('광고 관리에서 삭제했습니다.');
      if (expandedId === channel.id) setExpandedId(null);
      await loadPromoted();
    } catch {
      setMessage('광고 삭제에 실패했습니다.');
    }
  };

  const handleUpdateLinkType = async (id: string, linkType: LinkType) => {
    try {
      await updateAdminChannel(id, { linkType });
      setPromoted((prev) => prev.map((item) => (item.id === id ? { ...item, linkType } : item)));
      setCandidates((prev) => prev.map((item) => (item.id === id ? { ...item, linkType } : item)));
      setMessage('유형이 저장되었습니다.');
    } catch {
      setMessage('유형 저장에 실패했습니다.');
    }
  };

  const handleUpdateAvatar = (
    id: string,
    patch: { avatarUrl: string | null; avatarApproved: boolean },
  ) => {
    setPromoted((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setCandidates((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setMessage('아이콘이 저장되었습니다.');
  };

  const handleReorder = async (fromId: string, toId: string) => {
    if (!canReorder || fromId === toId) return;
    const fromIdx = promoted.findIndex((item) => item.id === fromId);
    const toIdx = promoted.findIndex((item) => item.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...promoted];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setPromoted(next);
    setOrderSaving(true);
    try {
      await updatePromotionOrder(next.map((item) => item.id));
      setMessage('노출 순서가 저장되었습니다.');
    } catch {
      await loadPromoted();
      setMessage('순서 저장에 실패했습니다.');
    } finally {
      setOrderSaving(false);
    }
  };

  const activeCount = promoted.filter((item) =>
    isPromotionActive(item.isPromoted, item.promotedUntil),
  ).length;
  const colCount = canReorder ? 12 : 11;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">광고 관리</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            노출 중 {activeCount}건 · 전체 {promoted.length}건
          </p>
        </div>
        <Button type="button" onClick={() => setShowAddSection((value) => !value)}>
          {showAddSection ? '추가 패널 닫기' : '+ 광고 추가'}
        </Button>
      </div>
      {message && <p className="mt-3 text-sm text-foreground">{message}</p>}

      {showAddSection && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">광고 추가</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={searchCandidates} className="flex gap-2">
              <Input
                value={candidateQuery}
                onChange={(e) => setCandidateQuery(e.target.value)}
                placeholder="승인된 채널/그룹 검색"
              />
              <Button type="submit" disabled={searchLoading}>
                {searchLoading ? '...' : '검색'}
              </Button>
            </form>
            {candidates.length > 0 && (
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>제목</TableHead>
                    <TableHead>인증</TableHead>
                    <TableHead>점수</TableHead>
                    <TableHead>조회율</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>종료일</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((channel) => (
                    <TableRow key={channel.id}>
                      <TableCell>
                        <ChannelAvatar channel={channel} />
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[180px] truncate font-medium">{channel.title}</p>
                        {channel.isPromoted && (
                          <span className="text-[10px] text-muted-foreground">등록됨</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {channel.isVerified ? (
                          <VerifiedBadge size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">미인증</span>
                        )}
                      </TableCell>
                      <TableCell>{channel.score ?? '—'}</TableCell>
                      <TableCell>{formatPercent(channel.viewRate)}</TableCell>
                      <TableCell>
                        <LinkTypeToggle
                          value={channel.linkType ?? 'channel'}
                          onChange={(type) => handleUpdateLinkType(channel.id, type)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={promoteDates[channel.id] ?? defaultPromoteDateInput()}
                          onChange={(e) =>
                            setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button type="button" size="sm" onClick={() => void handleApply(channel.id)}>
                          {channel.isPromoted ? '변경' : '등록'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {canReorder
            ? `⋮⋮ 핸들을 드래그해 노출 순서를 변경할 수 있습니다.${orderSaving ? ' 저장 중…' : ''}`
            : '검색 중에는 순서 변경이 비활성화됩니다.'}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadPromoted();
          }}
          className="flex gap-2"
        >
          <Input
            className="w-48"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="광고 검색"
          />
          <Button type="submit" variant="secondary">
            검색
          </Button>
        </form>
      </div>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : promoted.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">등록된 광고가 없습니다.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canReorder && <TableHead className="w-10">순서</TableHead>}
              <TableHead className="w-12" />
              <TableHead>제목</TableHead>
              <TableHead>인증</TableHead>
              <TableHead>점수</TableHead>
              <TableHead>조회율</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>노출</TableHead>
              <TableHead>종료일</TableHead>
              <TableHead>의뢰 · TON</TableHead>
              <TableHead>관리</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoted.map((channel, index) => {
              const active = isPromotionActive(channel.isPromoted, channel.promotedUntil);
              const expanded = expandedId === channel.id;
              const isDragging = dragId === channel.id;
              const isDropTarget = dropTargetId === channel.id && dragId !== channel.id;
              return (
                <Fragment key={channel.id}>
                  <TableRow
                    onClick={() => setExpandedId(expanded ? null : channel.id)}
                    onDragOver={(e) => {
                      if (!canReorder || !dragId || dragId === channel.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropTargetId(channel.id);
                    }}
                    onDragLeave={() => {
                      if (dropTargetId === channel.id) setDropTargetId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragId) void handleReorder(dragId, channel.id);
                      setDragId(null);
                      setDropTargetId(null);
                    }}
                    className={`cursor-pointer ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'bg-accent' : ''}`}
                  >
                    {canReorder && (
                      <TableCell>
                        <button
                          type="button"
                          draggable
                          aria-label={`${index + 1}번째 광고 순서 변경`}
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDragId(channel.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', channel.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropTargetId(null);
                          }}
                          className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing"
                        >
                          ⋮⋮
                        </button>
                      </TableCell>
                    )}
                    <TableCell>
                      <ChannelAvatar channel={channel} />
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[180px] truncate font-medium">{channel.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{channel.category}</p>
                    </TableCell>
                    <TableCell>
                      {channel.isVerified ? (
                        <VerifiedBadge size="sm" />
                      ) : (
                        <span className="text-xs text-muted-foreground">미인증</span>
                      )}
                    </TableCell>
                    <TableCell>{channel.score ?? '—'}</TableCell>
                    <TableCell>{formatPercent(channel.viewRate)}</TableCell>
                    <TableCell>
                      <LinkTypeToggle
                        value={channel.linkType ?? 'channel'}
                        onChange={(type) => handleUpdateLinkType(channel.id, type)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={active ? 'default' : 'secondary'}>
                        {active ? '노출' : '만료'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="date"
                          className="h-8 w-36"
                          value={
                            promoteDates[channel.id] ??
                            toDateInputValue(channel.promotedUntil) ??
                            defaultPromoteDateInput()
                          }
                          onChange={(e) =>
                            setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={applyingId === channel.id || !isPromoteDateChanged(channel)}
                          onClick={() => void handleApply(channel.id)}
                        >
                          {applyingId === channel.id ? '…' : '확인'}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AdClientCells channel={channel} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!active}
                          onClick={() => void handleStop(channel)}
                        >
                          중지
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteFromAds(channel)}
                        >
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-muted-foreground ${expanded ? 'inline-block rotate-180' : ''}`}>
                        ▼
                      </span>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell colSpan={colCount}>
                        <div className="space-y-3 py-1" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={channel.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-primary underline"
                          >
                            {channel.link}
                          </a>
                          <AdClientDetail channel={channel} />
                          <ChannelAvatarEditor
                            key={`${channel.id}-${channel.avatarUrl ?? 'none'}`}
                            channelId={channel.id}
                            link={channel.link}
                            avatarUrl={channel.avatarUrl}
                            avatarApproved={channel.avatarApproved}
                            linkType={channel.linkType}
                            onUpdated={(patch) => handleUpdateAvatar(channel.id, patch)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
