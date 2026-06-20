export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function dateInputToPromotedUntil(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString();
}

export function formatPromotedUntil(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function defaultPromoteDateInput(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toDateInputValue(date.toISOString());
}

export function isPromotionActive(isPromoted: boolean, promotedUntil: string | null | undefined): boolean {
  if (!isPromoted) return false;
  if (!promotedUntil) return true;
  return new Date(promotedUntil) > new Date();
}
