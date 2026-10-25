import axios from 'axios';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminCategories,
  lookupAdminChannel,
  registerAdminChannel,
  type AdminChannelLookup,
  type AdminInspectItemResult,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent } from '@/components/admin/ui/card';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Input } from '@/components/admin/ui/input';
import type { LinkType } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const RESULT_LABEL: Record<AdminInspectItemResult, string> = {
  ok: '정상',
  already_registered: '이미 등록됨',
  not_korean: '외국어',
  language_unknown: '언어 미확인',
  too_small: '100명 미만',
  not_found: '없는 방·초대 만료',
  invite_or_private: '없는 방·초대 만료',
  invalid_format: '형식 오류',
};

const REACTIVATE_CONFIRM =
  '이전에 거절된 링크입니다. 새로 만들지 않고 그 행을 다시 활성화할까요?';

const NOT_FOUND_MESSAGE =
  '이 링크로 방을 찾지 못했습니다. 링크(대소문자 포함)를 다시 확인하세요';

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg)) return msg.filter(Boolean).join('\n');
  }
  return fallback;
}

function kindLabel(kind: 'channel' | 'group' | null) {
  if (kind === 'group') return '그룹';
  if (kind === 'channel') return '채널';
  return '미확인';
}

function canRegisterLookup(lookup: AdminChannelLookup, chosenKind: LinkType | '') {
  if (!lookup.title.trim()) return false;
  // 거절된 행만 있는 경우는 확인 후 다시 활성화할 수 있다
  if (lookup.alreadyRegistered && lookup.existingStatus !== 'rejected') return false;
  if (
    lookup.result === 'not_found' ||
    lookup.result === 'invite_or_private' ||
    lookup.result === 'invalid_format'
  ) {
    return false;
  }
  if (!lookup.linkType && !chosenKind) return false;
  return true;
}

export function AdminLinkRegisterPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [lookup, setLookup] = useState<AdminChannelLookup | null>(null);
  const [titleValue, setTitleValue] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [chosenKind, setChosenKind] = useState<LinkType | ''>('');
  const [isPromoted, setIsPromoted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminCategories()
      .then((items) => {
        const active = items.filter((item) => item.isActive);
        setCategories(active);
        if (active[0]) setCategory(active[0].name);
      })
      .catch(() => setCategories([]));
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = linkInput.trim();
    if (!keyword) return;

    setSearching(true);
    setError('');
    setMessage('');
    setLookup(null);
    setChosenKind('');

    try {
      const result = await lookupAdminChannel(keyword);
      setLookup(result);
      setTitleValue(result.title);
      setDescription(result.description);
      if (result.linkType) setChosenKind(result.linkType);
      if (!result.title.trim()) {
        setError(NOT_FOUND_MESSAGE);
      } else if (result.alreadyRegistered && result.existingStatus === 'rejected') {
        setError('이전에 거절된 링크입니다. 등록하면 새로 만들지 않고 그 행을 다시 활성화합니다.');
      } else if (result.alreadyRegistered) {
        setError(
          result.resultCaption ||
            '이미 등록된 채널입니다. 링크 관리에서 확인해 주세요.',
        );
      } else if (result.result === 'not_korean') {
        setError('외국어로 분류됐습니다. 확인 후 등록할 수 있습니다.');
      } else if (result.result === 'language_unknown') {
        setError('언어를 확인하지 못했습니다. 확인 후 등록할 수 있습니다.');
      } else if (result.result === 'too_small') {
        setError('인원이 100명 미만입니다. 확인 후 등록할 수 있습니다.');
      } else if (
        result.result === 'not_found' ||
        result.result === 'invite_or_private' ||
        result.result === 'invalid_format'
      ) {
        setError(NOT_FOUND_MESSAGE);
      }
    } catch (err) {
      setError(apiErrorMessage(err, NOT_FOUND_MESSAGE));
    } finally {
      setSearching(false);
    }
  };

  const handleRegister = async () => {
    if (!lookup) return;
    if (!titleValue.trim() || !category) {
      setError('제목과 카테고리를 입력해 주세요.');
      return;
    }
    if (!canRegisterLookup(lookup, chosenKind)) {
      setError(NOT_FOUND_MESSAGE);
      return;
    }
    if (lookup.result === 'not_korean') {
      if (!window.confirm('외국어로 분류됐습니다. 그래도 등록할까요?')) return;
    }
    if (lookup.result === 'language_unknown') {
      if (!window.confirm('언어를 확인하지 못했습니다. 그래도 등록할까요?')) return;
    }
    if (lookup.result === 'too_small') {
      if (!window.confirm('인원이 100명 미만입니다. 그래도 등록할까요?')) return;
    }
    const rejectedBefore = lookup.alreadyRegistered && lookup.existingStatus === 'rejected';
    if (rejectedBefore) {
      if (!window.confirm(REACTIVATE_CONFIRM)) return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      title: titleValue.trim(),
      link: lookup.link,
      linkType: lookup.linkType ?? (chosenKind || undefined),
      category,
      description: description.trim() || titleValue.trim(),
      isPromoted,
    };

    try {
      try {
        await registerAdminChannel({ ...payload, reactivateRejected: rejectedBefore || undefined });
      } catch (err) {
        // 조회 이후에 거절 행이 생긴 경우: 서버가 확인을 요청하면 한 번 더 묻고 다시 보낸다
        const code = axios.isAxiosError(err) ? err.response?.data?.code : null;
        if (code !== 'DUPLICATE_REJECTED' || !window.confirm(REACTIVATE_CONFIRM)) throw err;
        await registerAdminChannel({ ...payload, reactivateRejected: true });
      }
      setMessage('등록되었습니다. 공개 페이지 수집 후 랭킹에 노출됩니다.');
      setLookup(null);
      setLinkInput('');
      setTitleValue('');
      setDescription('');
      setChosenKind('');
      setIsPromoted(false);
    } catch (err) {
      setError(apiErrorMessage(err, '등록에 실패했습니다. 링크 중복 여부를 확인해 주세요.'));
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = lookup?.avatarUrl ? resolveMediaUrl(lookup.avatarUrl) : '';
  const missingRoom = Boolean(lookup && !lookup.title.trim());
  const registerDisabled =
    saving || !lookup || !canRegisterLookup(lookup, chosenKind) || !category;

  return (
    <>
      <header className="border-b border-border bg-background px-6 py-5">
        <h2 className="text-xl font-bold">링크 등록 · 단건</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          텔레그램 링크를 찾아 종류를 자동 판별한 뒤 등록합니다.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleLookup} className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <label className="block text-sm font-medium">텔레그램 링크 검색</label>
              <p className="mt-1 text-xs text-muted-foreground">
                예: https://t.me/example · @username · https://t.me/+초대코드
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://t.me/채널명 또는 https://t.me/+초대코드"
                />
                <Button type="submit" disabled={searching || !linkInput.trim()}>
                  {searching ? '검색 중...' : '찾기'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {lookup && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl">
                      {lookup.linkType === 'group' ? '👥' : '📢'}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold">
                      {titleValue || '이름 없음'}
                    </p>
                    <Badge variant={lookup.result === 'ok' ? 'default' : 'secondary'}>
                      {lookup.result === 'already_registered'
                        ? lookup.resultCaption
                        : RESULT_LABEL[lookup.result]}
                    </Badge>
                    <Badge variant="outline">{kindLabel(lookup.linkType)}</Badge>
                  </div>
                  <a
                    href={lookup.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-primary hover:underline"
                  >
                    {lookup.link}
                  </a>
                  {lookup.memberCount != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      인원 {lookup.memberCount.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {missingRoom && (
                <p className="mt-4 text-sm text-destructive">{NOT_FOUND_MESSAGE}</p>
              )}

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-medium">제목</label>
                  <Input
                    className="mt-1"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    disabled={missingRoom}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium">설명</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    disabled={missingRoom}
                    className="mt-1 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  />
                </div>

                {!lookup.linkType && !missingRoom && (
                  <div>
                    <label className="text-xs font-medium">종류</label>
                    <select
                      value={chosenKind}
                      onChange={(e) => setChosenKind(e.target.value as LinkType | '')}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">채널 / 그룹을 선택하세요</option>
                      <option value="channel">채널</option>
                      <option value="group">그룹</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium">카테고리</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    {categories.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={isPromoted}
                    onCheckedChange={(checked) => setIsPromoted(checked === true)}
                  />
                  등록과 함께 광고(Promoted)로도 등록
                </label>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => void handleRegister()}
                    disabled={registerDisabled}
                  >
                    {saving ? '등록 중...' : '등록하기'}
                  </Button>
                  {lookup.existingChannelId && (
                    <Button variant="outline" asChild>
                      <Link
                        to={
                          lookup.linkType === 'group'
                            ? '/admin/links?type=group'
                            : '/admin/links?type=channel'
                        }
                      >
                        링크 관리에서 보기
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
