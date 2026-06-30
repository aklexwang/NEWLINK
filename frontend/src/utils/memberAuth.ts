import { getStoredAccessToken } from './authSession';
import { getTestProfile, isTestRegistrationMode } from './testRegistration';

/** 회원 API용 — 관리자 우회(X-Dev-Admin) 사용하지 않음 */
export function getMemberAuthHeaders(): Record<string, string> {
  if (getStoredAccessToken()) {
    return {};
  }

  if (isTestRegistrationMode()) {
    const profile = getTestProfile();
    if (profile) {
      return { 'X-Demo-Telegram-Id': String(profile.telegramId) };
    }
  }

  return {};
}
