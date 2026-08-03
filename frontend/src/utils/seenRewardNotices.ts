const STORAGE_KEY = 'newlink_seen_reward_notices';

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function hasSeenRewardNotice(channelId: string): boolean {
  return readSeen().has(channelId);
}

export function markRewardNoticeSeen(channelId: string) {
  const next = readSeen();
  next.add(channelId);
  writeSeen(next);
}
