import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import {
  AUTO_EXPOSE_MIN_MEMBERS,
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../channels/auto-expose.logic';
import { scoreKeywordCategory } from '../channels/channel-category-score.logic';
import { linkIdentityKey } from '../channels/channel-link.logic';
import type { ChannelLanguage } from '../channels/channel-language.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { publicInspectDecision } from '../stats/public-channel-inspect.logic';
import {
  isMissingChannelHtml,
  isPrivateChannelHtml,
  parseInviteLinkHtml,
  parsePublicUsernamePage,
} from '../stats/telegram-preview-html';
import type { AdminInspectItemResult } from './admin-inspect-item.entity';

export const ADMIN_INSPECT_MAX_LINES = 500;
export const ADMIN_REGISTER_MANY_MAX = 100;
export const ADMIN_INSPECT_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_INSPECT_BUSY_COLLECT = '이미 수집이 돌고 있습니다';
export const ADMIN_INSPECT_BUSY_JOB = '이미 확인 작업이 진행 중입니다';

export type ParsedInspectLine = {
  rawInput: string;
  link: string | null;
  username: string | null;
  result: AdminInspectItemResult | null;
};

export function parseAdminInspectLines(raw: string): ParsedInspectLine[] {
  const out: ParsedInspectLine[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    if (out.length >= ADMIN_INSPECT_MAX_LINES) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseOneInspectLine(trimmed);
    // 공개 링크는 대소문자 무시, 초대 링크는 해시 대소문자를 그대로 비교한다
    const key = parsed.link
      ? linkIdentityKey(parsed.link)
      : `raw:${parsed.rawInput.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export function parseOneInspectLine(raw: string): ParsedInspectLine {
  const trimmed = raw.trim().slice(0, 512);
  if (isInviteOnlyLink(trimmed)) {
    const link = normalizeInviteLink(trimmed);
    return { rawInput: trimmed, link, username: null, result: null };
  }
  const username = extractTelegramUsernameFromLink(trimmed);
  if (username) {
    return {
      rawInput: trimmed,
      link: `https://t.me/${username}`,
      username,
      result: null,
    };
  }
  return {
    rawInput: trimmed,
    link: null,
    username: null,
    result: 'invalid_format',
  };
}

export type AdminInspectPageClassified = {
  result: AdminInspectItemResult;
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number | null;
  linkType: 'channel' | 'group' | null;
  language: string | null;
};

export function classifyAdminInspectPage(input: {
  html: string | null;
  status: number;
  isInvite: boolean;
  finalUrl?: string | null;
  /** 채널 최근 글 발췌(t.me/s). 언어 판별에만 쓴다 */
  excerpts?: Array<string | null | undefined>;
}): AdminInspectPageClassified {
  if (!input.html || input.status >= 400) {
    return emptyInspect('not_found');
  }
  if (isPrivateChannelHtml(input.html)) {
    return emptyInspect('invite_or_private');
  }
  if (input.isInvite) {
    const invite = parseInviteLinkHtml(input.html, input.finalUrl);
    if (invite.expired) return emptyInspect('invite_or_private');
    const decided = publicInspectDecision({
      kind: invite.kind === 'channel' ? 'channel' : 'group',
      title: invite.title,
      description: invite.description,
      memberCount: invite.memberCount,
      avatarUrl: invite.avatarUrl,
    });
    return fromPublicDecision(
      decided,
      invite.title,
      invite.memberCount,
      invite.description,
      invite.avatarUrl,
    );
  }
  if (isMissingChannelHtml(input.html)) {
    return emptyInspect('not_found');
  }
  const parsed = parsePublicUsernamePage(input.html);
  if (parsed.kind !== 'channel' && parsed.kind !== 'group') {
    if (parsed.reason === 'page:bot' || parsed.reason === 'page:user') {
      return emptyInspect('invalid_format');
    }
    return emptyInspect('not_found');
  }
  const decided = publicInspectDecision({
    kind: parsed.kind,
    title: parsed.title,
    description: parsed.description,
    memberCount: parsed.memberCount,
    avatarUrl: parsed.avatarUrl ?? null,
    excerpts: input.excerpts,
  });
  return fromPublicDecision(
    decided,
    parsed.title,
    parsed.memberCount,
    parsed.description,
    parsed.avatarUrl,
  );
}

/** 제목이 없으면 방을 못 찾은 것으로 본다. */
export function applyMissingTitleResult(
  classified: AdminInspectPageClassified,
): AdminInspectPageClassified {
  if (classified.title?.trim()) return classified;
  if (
    classified.result === 'invite_or_private' ||
    classified.result === 'invalid_format'
  ) {
    return classified;
  }
  return { ...classified, result: 'not_found' };
}

/** 검사 결과로 저장된 언어 문자열을 채널 언어로. 알 수 없으면 null(저장하지 않음) */
export function toChannelLanguage(
  value: string | null | undefined,
): ChannelLanguage | null {
  return value === 'ko' || value === 'foreign' || value === 'unknown'
    ? value
    : null;
}

export const ADMIN_INSPECT_REGISTER_BLOCKED = new Set<AdminInspectItemResult>([
  'not_found',
  'invite_or_private',
  'invalid_format',
  'already_registered',
]);

export function interruptRunningInspectJobs<
  T extends { status: string; finishedAt?: Date | string | null },
>(
  jobs: T[],
  now: Date,
): Array<
  T & { status: 'interrupted'; endedReason: 'interrupted'; finishedAt: Date }
> {
  return jobs
    .filter((job) => job.status === 'running')
    .map((job) => ({
      ...job,
      status: 'interrupted' as const,
      endedReason: 'interrupted' as const,
      finishedAt: now,
    }));
}

export function inspectJobTtlCutoff(now = new Date()): Date {
  return new Date(now.getTime() - ADMIN_INSPECT_JOB_TTL_MS);
}

export function inspectItemResultCaption(input: {
  result: AdminInspectItemResult | null;
  registeredThisJob: boolean;
  memberVisible: boolean | null;
  memberReason: string | null;
}): string {
  if (!input.result) return '확인 중';
  if (input.result === 'already_registered') {
    if (input.memberVisible === true) return '이미 등록됨 · 노출 중';
    if (input.memberVisible === false) {
      const reason = input.memberReason?.trim();
      return reason ? `이미 등록됨 · 숨김(${reason})` : '이미 등록됨 · 숨김';
    }
    return '이미 등록됨';
  }
  if (input.registeredThisJob) return '이번에 등록함';
  if (input.result === 'ok') return '정상';
  if (input.result === 'not_korean') return '외국어';
  if (input.result === 'language_unknown') return '언어 미확인';
  if (input.result === 'too_small') return '100명 미만';
  if (input.result === 'not_found') return '없는 채널';
  if (input.result === 'invite_or_private') return '초대 만료·비공개';
  if (input.result === 'invalid_format') return '형식 오류';
  return input.result;
}

export function assertRegisterManySize(ids: string[]): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error('등록할 항목을 선택해 주세요.');
  }
  if (unique.length > ADMIN_REGISTER_MANY_MAX) {
    throw new Error(
      `한 번에 최대 ${ADMIN_REGISTER_MANY_MAX}개만 등록할 수 있습니다.`,
    );
  }
  return unique;
}

function fromPublicDecision(
  decided: ReturnType<typeof publicInspectDecision>,
  title: string | null,
  memberCount: number | null,
  description: string | null,
  avatarUrl: string | null,
): AdminInspectPageClassified {
  let result: AdminInspectItemResult = 'not_found';
  if (decided.result === 'ok') result = 'ok';
  else if (decided.result === 'not_korean') result = 'not_korean';
  else if (decided.result === 'language_unknown') result = 'language_unknown';
  else if (decided.result === 'too_small') result = 'too_small';
  return {
    result,
    title,
    description,
    avatarUrl,
    memberCount,
    linkType: decided.linkType,
    language: decided.language,
  };
}

function emptyInspect(
  result: AdminInspectItemResult,
): AdminInspectPageClassified {
  return {
    result,
    title: null,
    description: null,
    avatarUrl: null,
    memberCount: null,
    linkType: null,
    language: null,
  };
}

function normalizeInviteLink(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
  if (/^(?:t\.me|telegram\.me)\//i.test(trimmed)) {
    return `https://${trimmed.replace(/\/$/, '')}`;
  }
  if (trimmed.startsWith('+')) return `https://t.me/${trimmed}`;
  return trimmed;
}

export { AUTO_EXPOSE_MIN_MEMBERS };

/**
 * 단건 등록 화면의 카테고리 기본값. 제목·소개를 키워드로만 분류한 추천값이고(AI 는 부르지 않는다),
 * 확신이 낮으면 분류대기를 돌려준다.
 */
export function suggestInspectCategory(
  title: string | null | undefined,
  description: string | null | undefined,
): string {
  const allowed = DEFAULT_CATEGORIES.map((item) => item.name).filter(
    (name) => name !== PENDING_CATEGORY,
  );
  const scored = scoreKeywordCategory({
    title: title ?? '',
    description: description ?? '',
    allowedCategories: allowed,
  });
  return resolveCategoryWithConfidence(scored.category, scored.confidence)
    .category;
}
