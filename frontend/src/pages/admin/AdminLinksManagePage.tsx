import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveChannel,
  deleteAdminChannel,
  getAdminCategories,
  getAdminChannels,
  rejectChannel,
  updateAdminChannel,
} from '../../api/admin';
import { AdminCategoryChipBar } from '../../components/admin/AdminCategoryChipBar';
import { AdClientCells, AdClientDetail } from '../../components/admin/AdClientInfo';
import { ChannelAvatarEditor } from '../../components/admin/ChannelAvatarEditor';
import {
  AdminEmptyState,
  AdminMessage,
  AdminTable,
  AdminTableShell,
  AdminTd,
  AdminTh,
  ChannelAvatar,
} from '../../components/admin/AdminTable';
import type { Channel, LinkType } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { linkTypeBadgeClass, linkTypeLabel } from '../../utils/linkType';

type StatusFilter = '' | 'pending' | 'active' | 'rejected';

const statusLabel: Record<string, string> = {
  pending: '대기',
  active: '승인',
  rejected: '거절',
};

const statusClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

interface AdminLinksManagePageProps {
  linkType?: LinkType;
  title: string;
  subtitle: string;
  emptyMessage: string;
  registerPath?: string;
  registerPaths?: { channel: string; group: string };
  itemLabel: string;
  showTypeColumn?: boolean;
}

export function AdminLinksManagePage({
  linkType,
  title,
  subtitle,
  emptyMessage,
  registerPath,
  registerPaths,
  itemLabel,
  showTypeColumn = false,
}: AdminLinksManagePageProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [countSource, setCountSource] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, countItems, categoryItems] = await Promise.all([
        getAdminChannels({
          status: statusFilter || undefined,
          q: query.trim() || undefined,
          category: categoryFilter || undefined,
          linkType,
        }),
        getAdminChannels({ status: statusFilter || undefined, linkType }),
        getAdminCategories(),
      ]);
      setChannels(items);
      setCountSource(countItems);
      setCategories(categoryItems.filter((c) => c.isActive));
      setMessage('');
    } catch {
      setMessage(`${itemLabel} 목록을 불러오지 못했습니다.`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query, categoryFilter, linkType, itemLabel]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleApprove = async (id: string) => {
    await approveChannel(id);
    setMessage('승인되었습니다.');
    await load();
  };

  const handleReject = async (id: string) => {
    await rejectChannel(id);
    setMessage('거절되었습니다.');
    await load();
  };

  const handleUpdateMeta = async (
    id: string,
    payload: { category?: string; title?: string },
  ) => {
    try {
      await updateAdminChannel(id, payload);
      setChannels((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...payload } : item)),
      );
      setMessage('정보가 저장되었습니다.');
    } catch {
      setMessage('저장에 실패했습니다.');
    }
  };

  const handleUpdateAvatar = (id: string, patch: { avatarUrl: string | null; avatarApproved: boolean }) => {
    setChannels((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setMessage('아이콘이 저장되었습니다.');
  };

  const handleDelete = async (id: string, channelTitle: string) => {
    if (!window.confirm(`"${channelTitle}" 항목을 삭제할까요?`)) return;
    await deleteAdminChannel(id);
    setMessage('항목이 삭제되었습니다.');
    if (expandedId === id) setExpandedId(null);
    await load();
  };

  const categoryOptions = categories.map((c) => c.name);
  const colCount = showTypeColumn ? 8 : 7;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '': countSource.length };
    for (const category of categories) {
      counts[category.name] = countSource.filter((item) => item.category === category.name).length;
    }
    return counts;
  }, [categories, countSource]);

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {registerPaths ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to={registerPaths.channel}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                채널 등록
              </Link>
              <Link
                to={registerPaths.group}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-black/10 hover:bg-slate-50"
              >
                그룹 등록
              </Link>
            </div>
          ) : registerPath ? (
            <Link
              to={registerPath}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {itemLabel} 등록
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}

        <AdminCategoryChipBar
          categories={categories}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
          counts={categoryCounts}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ['', '전체'],
            ['active', '승인'],
            ['pending', '대기'],
            ['rejected', '거절'],
          ] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${statusFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목, 링크, 카테고리 검색"
            className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-blue-300"
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            검색
          </button>
        </form>

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : channels.length === 0 ? (
          <AdminEmptyState message={emptyMessage} />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-slate-50">
                <tr>
                  <AdminTh className="w-12" />
                  <AdminTh>제목</AdminTh>
                  {showTypeColumn && <AdminTh className="w-16">유형</AdminTh>}
                  <AdminTh className="w-24">카테고리</AdminTh>
                  <AdminTh className="w-16">상태</AdminTh>
                  <AdminTh className="w-12">👍</AdminTh>
                  <AdminTh className="min-w-[100px]">광고 의뢰</AdminTh>
                  <AdminTh className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channels.map((channel) => {
                  const expanded = expandedId === channel.id;
                  return (
                    <Fragment key={channel.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : channel.id)}
                        className={`cursor-pointer transition hover:bg-slate-50/80 ${expanded ? 'bg-blue-50/40' : ''}`}
                      >
                        <AdminTd><ChannelAvatar channel={channel} /></AdminTd>
                        <AdminTd>
                          <p className="max-w-[200px] truncate font-medium text-slate-900">{channel.title}</p>
                          {channel.isPromoted && (
                            <span className="mt-0.5 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">광고</span>
                          )}
                        </AdminTd>
                        {showTypeColumn && (
                          <AdminTd>
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
                              {linkTypeLabel(channel.linkType)}
                            </span>
                          </AdminTd>
                        )}
                        <AdminTd><span className="text-xs">{channel.category}</span></AdminTd>
                        <AdminTd>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass[channel.status]}`}>
                            {statusLabel[channel.status]}
                          </span>
                        </AdminTd>
                        <AdminTd><span className="text-xs tabular-nums">{channel.recommendCount}</span></AdminTd>
                        <AdminTd>
                          {channel.isPromoted ? <AdClientCells channel={channel} /> : <span className="text-xs text-slate-400">-</span>}
                        </AdminTd>
                        <AdminTd>
                          <span className={`inline-block text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}>▼</span>
                        </AdminTd>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <AdminTd colSpan={colCount}>
                            <div className="space-y-3 py-1" onClick={(e) => e.stopPropagation()}>
                              <form
                                className="flex flex-wrap items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const form = e.currentTarget;
                                  const input = form.elements.namedItem('title') as HTMLInputElement;
                                  const value = input.value.trim();
                                  if (value && value !== channel.title) {
                                    handleUpdateMeta(channel.id, { title: value });
                                  }
                                }}
                              >
                                <span className="text-xs text-slate-500">제목</span>
                                <input
                                  key={`${channel.id}-${channel.title}`}
                                  name="title"
                                  defaultValue={channel.title}
                                  className="min-w-0 flex-1 rounded-lg bg-white px-3 py-1.5 text-sm outline-none ring-1 ring-black/10 focus:ring-blue-300"
                                  placeholder={`${itemLabel} 이름`}
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  저장
                                </button>
                              </form>

                              <a href={channel.link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-600 hover:underline">
                                {channel.link}
                              </a>

                              {channel.isPromoted && <AdClientDetail channel={channel} />}

                              <ChannelAvatarEditor
                                key={`${channel.id}-${channel.avatarUrl ?? 'none'}`}
                                channelId={channel.id}
                                avatarUrl={channel.avatarUrl}
                                avatarApproved={channel.avatarApproved}
                                linkType={channel.linkType}
                                onUpdated={(patch) => handleUpdateAvatar(channel.id, patch)}
                              />

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">카테고리</span>
                                <select
                                  value={channel.category}
                                  onChange={(e) => handleUpdateMeta(channel.id, { category: e.target.value })}
                                  className="rounded-lg bg-white px-2 py-1 text-xs outline-none ring-1 ring-black/10"
                                >
                                  {!categoryOptions.includes(channel.category) && (
                                    <option value={channel.category}>{channel.category}</option>
                                  )}
                                  {categoryOptions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {channel.status === 'pending' && (
                                  <>
                                    <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">승인</button>
                                    <button type="button" onClick={() => handleReject(channel.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10">거절</button>
                                  </>
                                )}
                                {channel.status === 'rejected' && (
                                  <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">재승인</button>
                                )}
                                <button type="button" onClick={() => handleDelete(channel.id, channel.title)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">삭제</button>
                              </div>
                            </div>
                          </AdminTd>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </AdminTable>
          </AdminTableShell>
        )}
      </div>
    </>
  );
}
