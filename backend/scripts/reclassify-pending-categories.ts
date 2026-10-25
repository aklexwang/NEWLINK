/**
 * 분류대기 채널 키워드 재분류.
 * 기본 dry-run. --apply 일 때만 UPDATE.
 * 연결 주소는 출력하지 않습니다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import {
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../src/channels/auto-expose.logic';
import { scoreKeywordCategory } from '../src/channels/channel-category-score.logic';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories';
import { hasIllegalDrugSuspicion } from '../src/channels/illegal-content.logic';

function readTargetUrl(): string {
  const text = readFileSync(join(__dirname, '..', '.env.migrate'), 'utf8');
  const match = text.match(/^TARGET_DATABASE_URL=(.+)$/m);
  const url = match?.[1]?.trim();
  if (!url) throw new Error('TARGET_DATABASE_URL 이 없습니다.');
  return url;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new Client({
    connectionString: readTargetUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const hacking = await client.query<{ title: string }>(
    `SELECT title FROM channels WHERE category = '해킹' ORDER BY title`,
  );
  console.log('hacking_count', hacking.rows.length);
  for (const row of hacking.rows) console.log('hacking_title', row.title);

  const allText = await client.query<{ title: string; description: string }>(
    `SELECT title, description FROM channels`,
  );
  const drugs = allText.rows.filter((row) =>
    hasIllegalDrugSuspicion(row.title, row.description),
  );
  console.log('illegal_suspect_count', drugs.length);
  for (const row of drugs) console.log('illegal_title', row.title);

  const pending = await client.query<{
    id: string;
    title: string;
    description: string;
    link_type: string;
    category_locked: boolean;
  }>(
    `SELECT id, title, description, link_type, COALESCE(category_locked, FALSE) AS category_locked
     FROM channels
     WHERE category = $1`,
    [PENDING_CATEGORY],
  );

  const allowed = DEFAULT_CATEGORIES.map((item) => item.name).filter(
    (name) => name !== PENDING_CATEGORY,
  );
  const byCat = new Map<string, number>();
  const adultTitles: string[] = [];
  const casinoTitles: string[] = [];
  let remainPending = 0;
  let skippedLocked = 0;

  const ids = pending.rows.map((row) => row.id);
  const postMap = new Map<string, string[]>();
  const chunk = 400;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const posts = await client.query<{
      channel_id: string;
      text_excerpt: string | null;
    }>(
      `SELECT channel_id, text_excerpt
       FROM channel_posts
       WHERE channel_id = ANY($1::uuid[])
         AND text_excerpt IS NOT NULL
       ORDER BY posted_at DESC`,
      [part],
    );
    for (const post of posts.rows) {
      const list = postMap.get(post.channel_id) ?? [];
      if (list.length >= 20) continue;
      list.push(post.text_excerpt ?? '');
      postMap.set(post.channel_id, list);
    }
  }

  for (const row of pending.rows) {
    if (row.category_locked) {
      skippedLocked += 1;
      remainPending += 1;
      continue;
    }
    const posts =
      row.link_type === 'channel' ? (postMap.get(row.id) ?? []) : [];
    const scored = scoreKeywordCategory({
      title: row.title,
      description: row.description,
      posts,
      allowedCategories: allowed,
    });
    const resolved = resolveCategoryWithConfidence(
      scored.category,
      scored.confidence,
    );
    byCat.set(resolved.category, (byCat.get(resolved.category) ?? 0) + 1);
    if (resolved.pending) remainPending += 1;
    if (!resolved.pending && resolved.category === '성인') {
      adultTitles.push(row.title);
    }
    if (!resolved.pending && resolved.category === '카지노') {
      casinoTitles.push(row.title);
    }
    if (apply && !resolved.pending) {
      await client.query(
        `UPDATE channels SET category = $1, category_confidence = $2 WHERE id = $3 AND COALESCE(category_locked, FALSE) = FALSE`,
        [resolved.category, scored.confidence, row.id],
      );
    }
  }

  console.log('pending_total', pending.rows.length);
  console.log('skipped_locked', skippedLocked);
  console.log('remain_pending', remainPending);
  console.log('--- expected categories ---');
  for (const [name, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(name, n);
  }
  console.log('--- adult titles ---', adultTitles.length);
  for (const title of adultTitles) console.log('adult_title', title);
  console.log('--- casino titles ---', casinoTitles.length);
  for (const title of casinoTitles) console.log('casino_title', title);
  console.log(apply ? 'applied' : 'dry-run');
  await client.end();
}

main().catch(() => {
  console.error('script failed');
  process.exit(1);
});
