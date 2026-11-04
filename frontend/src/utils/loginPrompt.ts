/** 비회원이 로그인이 필요한 버튼을 눌렀을 때 띄우는 안내 시트 (LoginPromptSheet) */
export const LOGIN_PROMPT_EVENT = 'nl-login-prompt';

export type LoginPromptDetail = {
  /** 시트 제목 아래 한 줄 (예: "로그인하면 즐겨찾기가 저장돼요") */
  reason: string;
  /** 로그인에 성공하면 이어서 할 일 (예: 누른 별을 바로 저장) */
  onSuccess?: () => void | Promise<void>;
};

export function openLoginPrompt(detail: LoginPromptDetail): void {
  window.dispatchEvent(new CustomEvent<LoginPromptDetail>(LOGIN_PROMPT_EVENT, { detail }));
}
