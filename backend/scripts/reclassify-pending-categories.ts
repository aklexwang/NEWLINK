/**
 * 분류대기 채널 키워드 재분류.
 * 기본 dry-run. --apply 일 때만 UPDATE.
 * --ai: 키워드 점수가 낮은 채널만 AI 로 다시 분류(AI_API_KEY 필요).
 *   dry-run 에서는 AI 를 부르지 않고 대상 수와 예상 호출 수만 보여 준다.
 * 연결 주소는 출력하지 않습니다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { aiSkipReason } from '../src/auto-manage/category-ai.logic';
import { CategoryAiService } from '../src/auto-manage/category-ai.service';
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
  const useAi = process.argv.includes('--ai');
  const aiService = new CategoryAiService(new ConfigService(process.env));
  if (useAi && apply && !aiService.isConfigured()) {
    throw new Error('--ai --apply 에는 AI_API_KEY 가 필요합니다.');
  }
  const client = new Client({
    connectionString: readTargetUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // 해킹 → 게임 이동 + 빈 해킹 카테고리 행 정리 (--apply 때만 실제 변경)
  const hacking = await client.query<{ title: string }>(
    `SELECT title FROM channels WHERE category = '해킹' ORDER BY title`,
  );
  const hackingCandidates = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM channel_import_candidates
     WHERE category = '해킹' OR category_ai_suggested = '해킹'`,
  );
  const hackingRow = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM categories WHERE name = '해킹'`,
  );
  const gameRow = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM categories WHERE name = '게임'`,
  );
  console.log('hacking_channels_to_game', hacking.rows.length);
  for (const row of hacking.rows) console.log('hacking_title', row.title);
  console.log('hacking_candidates_to_game', hackingCandidates.rows[0].n);
  console.log('hacking_category_row', hackingRow.rows[0].n);
  console.log('game_category_row', gameRow.rows[0].n);
  if (apply) {
    if (gameRow.rows[0].n === 0) {
      throw new Error('게임 카테고리가 없어 해킹을 옮길 수 없습니다.');
    }
    await client.query('BEGIN');
    await client.query(
      `UPDATE channels SET category = '게임' WHERE category = '해킹'`,
    );
    await client.query(
      `UPDATE channel_import_candidates SET category = '게임' WHERE category = '해킹'`,
    );
    await client.query(
      `UPDATE channel_import_candidates SET category_ai_suggested = '게임' WHERE category_ai_suggested = '해킹'`,
    );
    const removed = await client.query(
      `DELETE FROM categories
       WHERE name = '해킹'
         AND NOT EXISTS (SELECT 1 FROM channels WHERE category = '해킹')
         AND NOT EXISTS (SELECT 1 FROM channel_import_candidates WHERE category = '해킹')`,
    );
    await client.query('COMMIT');
    console.log('hacking_category_rows_removed', removed.rowCount ?? 0);
  }

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
  let aiTargets = 0;
  let aiResolved = 0;

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
    let resolved = resolveCategoryWithConfidence(
      scored.category,
      scored.confidence,
    );
    let confidence = scored.confidence;
    // 키워드로 못 정한 채널만 AI 후보. 불법 의심·성인 키워드 근거가 있는 채널은 제외된다.
    if (
      useAi &&
      resolved.pending &&
      aiSkipReason({
        configured: true,
        keyword: scored,
        title: row.title,
        description: row.description,
        posts,
      }) === null
    ) {
      aiTargets += 1;
      if (apply) {
        const classified = await aiService.classify({
          title: row.title,
          description: row.description,
          posts,
          allowedCategories: allowed,
        });
        if (classified.source === 'ai') {
          resolved = resolveCategoryWithConfidence(
            classified.category,
            classified.confidence,
          );
          confidence = classified.confidence;
          if (!resolved.pending) aiResolved += 1;
        }
      }
    }
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
        [resolved.category, confidence, row.id],
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
  if (useAi) {
    const limit = aiService.status().dailyMax;
    console.log('--- AI ---');
    console.log('ai_targets', aiTargets);
    console.log('ai_daily_limit', limit);
    console.log('ai_expected_calls', Math.min(aiTargets, limit));
    if (apply) {
      const status = aiService.status();
      console.log('ai_calls_used', status.today);
      console.log('ai_resolved', aiResolved);
      if (status.stopReason) console.log('ai_stopped', status.stopReason);
    } else {
      console.log('dry-run: AI 를 부르지 않았습니다.');
    }
  }
  console.log(apply ? 'applied' : 'dry-run');
  await client.end();
}

main().catch(() => {
  console.error('script failed');
  process.exit(1);
});
