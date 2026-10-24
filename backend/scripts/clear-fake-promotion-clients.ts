/**
 * 가짜 광고 의뢰자(847291036, 광고의뢰_*) 정리.
 * 기본은 dry-run(SELECT 개수만). --apply 일 때만 UPDATE.
 * 연결 주소는 출력하지 않습니다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const FAKE_ID = 847291036;

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
  const counted = await client.query(
    `SELECT COUNT(*)::int AS n FROM channels
     WHERE promotion_client_telegram_id = $1
        OR promotion_client_name LIKE '광고의뢰_%'`,
    [FAKE_ID],
  );
  const n = counted.rows[0].n as number;
  console.log('fake_promo_channels', n);
  if (!apply) {
    console.log('dry-run');
    await client.end();
    return;
  }
  const updated = await client.query(
    `UPDATE channels
     SET promotion_client_telegram_id = NULL,
         promotion_client_name = NULL,
         promotion_ton_amount = NULL
     WHERE promotion_client_telegram_id = $1
        OR promotion_client_name LIKE '광고의뢰_%'`,
    [FAKE_ID],
  );
  console.log('updated', updated.rowCount ?? 0);
  await client.end();
}

main().catch(() => {
  console.error('script failed');
  process.exit(1);
});
