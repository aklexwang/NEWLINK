import { isAxiosError } from 'axios';

/** Nest HttpException 본문의 message 를 그대로 꺼낸다 */
export function adminApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message;
    if (typeof raw === 'string' && raw.trim()) return raw;
    if (Array.isArray(raw)) {
      const text = raw.filter((item) => typeof item === 'string').join(', ');
      if (text) return text;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
