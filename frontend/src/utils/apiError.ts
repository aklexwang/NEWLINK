/** NestJS / axios 에러에서 사용자용 메시지 추출 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const maybeAxios = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };

  const raw = maybeAxios.response?.data?.message;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw.map(String).join(', ');

  if (typeof maybeAxios.message === 'string' && maybeAxios.message.trim()) {
    if (maybeAxios.message.includes('401')) {
      return '인증에 실패했습니다. 봇 토큰/미니앱을 다시 확인해 주세요.';
    }
    return maybeAxios.message;
  }

  return fallback;
}
