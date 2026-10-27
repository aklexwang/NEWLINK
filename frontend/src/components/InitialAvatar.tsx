import { avatarGradient, avatarInitials } from '../utils/avatarFallback';

/** 사진 없는 방: 텔레그램처럼 색 바탕 + 머리글자 (부모 상자를 꽉 채움) */
export function InitialAvatar({ title, seed, textClass = 'text-[17px]' }: { title: string; seed: string; textClass?: string }) {
  return (
    <span
      className={`flex h-full w-full items-center justify-center font-bold text-white ${textClass}`}
      style={{ backgroundImage: avatarGradient(seed || title) }}
    >
      {avatarInitials(title)}
    </span>
  );
}
