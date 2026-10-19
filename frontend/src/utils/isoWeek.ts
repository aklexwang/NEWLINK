export function formatKstYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addKstDays(ymd: string, days: number): string {
  const pivot = new Date(`${ymd}T12:00:00+09:00`);
  pivot.setTime(pivot.getTime() + days * 24 * 60 * 60 * 1000);
  return formatKstYmd(pivot);
}

export function isoWeekFromYmd(ymd: string): { year: number; week: number } {
  const date = new Date(`${ymd}T12:00:00+09:00`);
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - isoDow);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(`${year}-01-04T12:00:00+09:00`);
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const week = Math.round((date.getTime() - week1Monday.getTime()) / 86_400_000 / 7) + 1;
  return { year, week };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function shiftIsoWeek(weekLabel: string, deltaWeeks: number): string {
  const match = weekLabel.match(/^(\d{4})-W(\d{2})$/i);
  if (!match) return weekLabel;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(`${year}-01-04T12:00:00+09:00`);
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1 + deltaWeeks) * 7);
  const ymd = formatKstYmd(monday);
  const next = isoWeekFromYmd(ymd);
  return formatIsoWeek(next.year, next.week);
}
