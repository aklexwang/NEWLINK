import { isInviteLink } from '../utils/channelDetailPath';

/** 공개방 "공"(초록) / 비공개 초대방 "비"(빨강) 한 글자 표시 */
export function PublicPrivateBadge({ link }: { link: string | null | undefined }) {
  const isPrivate = isInviteLink(link);
  return (
    <span
      title={isPrivate ? '비공개 방 (초대 링크)' : '공개 방'}
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold leading-none text-white ${
        isPrivate ? 'bg-red-500' : 'bg-emerald-500'
      }`}
    >
      {isPrivate ? '비' : '공'}
    </span>
  );
}
