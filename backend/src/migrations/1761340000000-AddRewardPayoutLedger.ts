import { randomUUID } from 'crypto';
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';
import { backfillPayoutStatus } from '../payments/payout-status.logic';
import { classifyWalletKind } from '../payments/wallet-kind.logic';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function uuidType(sqlite: boolean): string {
  return sqlite ? 'varchar' : 'uuid';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}

function bigintType(sqlite: boolean): string {
  return sqlite ? 'integer' : 'bigint';
}

export class AddRewardPayoutLedger1761340000000 implements MigrationInterface {
  name = 'AddRewardPayoutLedger1761340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    const uuid = uuidType(sqlite);
    const dt = datetimeType(sqlite);
    const uuidLen = sqlite ? '36' : undefined;
    const boolTrue = sqlite ? '1' : 'true';
    const bigint = bigintType(sqlite);

    if (!(await queryRunner.hasTable('reward_settings'))) {
      await queryRunner.createTable(
        new Table({
          name: 'reward_settings',
          columns: [
            { name: 'id', type: uuid, length: uuidLen, isPrimary: true },
            {
              name: 'enabled',
              type: 'boolean',
              isNullable: false,
              default: boolTrue,
            },
            { name: 'updated_at', type: dt, isNullable: false },
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('payout_methods'))) {
      await queryRunner.createTable(
        new Table({
          name: 'payout_methods',
          columns: [
            { name: 'id', type: uuid, length: uuidLen, isPrimary: true },
            {
              name: 'code',
              type: 'varchar',
              length: '32',
              isNullable: false,
              isUnique: true,
            },
            { name: 'label', type: 'varchar', length: '64', isNullable: false },
            {
              name: 'destination_kind',
              type: 'varchar',
              length: '32',
              isNullable: false,
            },
            {
              name: 'network',
              type: 'varchar',
              length: '32',
              isNullable: true,
            },
            {
              name: 'currency',
              type: 'varchar',
              length: '16',
              isNullable: false,
            },
            {
              name: 'default_amount',
              type: 'real',
              isNullable: false,
              default: 0,
            },
            {
              name: 'enabled',
              type: 'boolean',
              isNullable: false,
              default: boolTrue,
            },
            { name: 'sort', type: 'integer', isNullable: false, default: 0 },
            { name: 'created_at', type: dt, isNullable: false },
          ],
        }),
      );
      await queryRunner.createIndex(
        'payout_methods',
        new TableIndex({
          name: 'idx_payout_methods_enabled_sort',
          columnNames: ['enabled', 'sort'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('payout_records'))) {
      await queryRunner.createTable(
        new Table({
          name: 'payout_records',
          columns: [
            { name: 'id', type: uuid, length: uuidLen, isPrimary: true },
            {
              name: 'channel_id',
              type: 'varchar',
              length: '36',
              isNullable: false,
            },
            { name: 'telegram_id', type: bigint, isNullable: true },
            {
              name: 'username',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
            {
              name: 'method_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            {
              name: 'destination_kind',
              type: 'varchar',
              length: '32',
              isNullable: false,
            },
            {
              name: 'currency',
              type: 'varchar',
              length: '16',
              isNullable: false,
            },
            { name: 'amount', type: 'real', isNullable: false },
            {
              name: 'wallet_address',
              type: 'varchar',
              length: '256',
              isNullable: true,
            },
            {
              name: 'send_method',
              type: 'varchar',
              length: '32',
              isNullable: false,
            },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'tx_or_memo',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            {
              name: 'void_or_fail_reason',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            {
              name: 'source',
              type: 'varchar',
              length: '32',
              isNullable: false,
              default: "'live'",
            },
            {
              name: 'source_ton_payment_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
              isUnique: true,
            },
            { name: 'created_at', type: dt, isNullable: false },
            { name: 'updated_at', type: dt, isNullable: false },
            { name: 'paid_at', type: dt, isNullable: true },
          ],
        }),
      );
      await queryRunner.createIndex(
        'payout_records',
        new TableIndex({
          name: 'idx_payout_records_channel_id',
          columnNames: ['channel_id'],
        }),
      );
      await queryRunner.createIndex(
        'payout_records',
        new TableIndex({
          name: 'idx_payout_records_telegram_id',
          columnNames: ['telegram_id'],
        }),
      );
      await queryRunner.createIndex(
        'payout_records',
        new TableIndex({
          name: 'idx_payout_records_status',
          columnNames: ['status'],
        }),
      );
      await queryRunner.createIndex(
        'payout_records',
        new TableIndex({
          name: 'idx_payout_records_paid_at',
          columnNames: ['paid_at'],
        }),
      );
    }

    if (
      (await queryRunner.hasTable('users')) &&
      !(await queryRunner.hasColumn('users', 'wallet_kind'))
    ) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'wallet_kind',
          type: 'varchar',
          length: '20',
          isNullable: true,
        }),
      );
    }

    if (
      (await queryRunner.hasTable('channels')) &&
      !(await queryRunner.hasColumn('channels', 'payout_status'))
    ) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'payout_status',
          type: 'varchar',
          length: '20',
          isNullable: false,
          default: "'not_eligible'",
        }),
      );
    }
    if (
      (await queryRunner.hasTable('channels')) &&
      !(await queryRunner.hasColumn('channels', 'payout_skip_reason'))
    ) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'payout_skip_reason',
          type: 'varchar',
          length: '200',
          isNullable: true,
        }),
      );
    }

    await this.backfill(queryRunner, sqlite);
  }

  private async backfill(queryRunner: QueryRunner, sqlite: boolean) {
    const tonPaymentsCount = await this.countIfTable(queryRunner, 'ton_payments');
    const rewardChannelCount = await this.countQuery(
      queryRunner,
      `SELECT COUNT(*) AS n FROM channels WHERE reward_ton_amount IS NOT NULL AND reward_ton_amount > 0`,
    );
    const walletUserCount = await this.countQuery(
      queryRunner,
      sqlite
        ? `SELECT COUNT(*) AS n FROM users WHERE TRIM(COALESCE(ton_wallet_address, '')) <> ''`
        : `SELECT COUNT(*) AS n FROM users WHERE BTRIM(COALESCE(ton_wallet_address, '')) <> ''`,
    );

    if (await queryRunner.hasColumn('users', 'wallet_kind')) {
      const users = (await queryRunner.query(
        `SELECT telegram_id, ton_wallet_address FROM users`,
      )) as Array<Record<string, unknown>>;
      for (const user of users) {
        const kind = classifyWalletKind(
          String(user.ton_wallet_address ?? user.tonWalletAddress ?? ''),
        );
        await this.exec(queryRunner, sqlite,
          `UPDATE users SET wallet_kind = ? WHERE CAST(telegram_id AS TEXT) = ?`,
          [kind, String(user.telegram_id ?? user.telegramId ?? '')],
        );
      }
    }

    if (await queryRunner.hasColumn('channels', 'payout_status')) {
      const channels = (await queryRunner.query(
        `SELECT id, reward_ton_amount, submitted_by, status, payout_status FROM channels`,
      )) as Array<Record<string, unknown>>;
      for (const channel of channels) {
        if (String(channel.payout_status ?? channel.payoutStatus) === 'skipped') {
          continue;
        }
        const next = backfillPayoutStatus({
          rewardTonAmount: Number(channel.reward_ton_amount ?? channel.rewardTonAmount ?? 0),
          submittedBy: channel.submitted_by ?? channel.submittedBy,
          status: String(channel.status ?? ''),
        });
        await this.exec(queryRunner, sqlite,
          `UPDATE channels SET payout_status = ? WHERE id = ?`,
          [next, String(channel.id)],
        );
      }
    }

    let copied = 0;
    let gap = 0;
    if (await queryRunner.hasTable('ton_payments')) {
      const table = await queryRunner.getTable('ton_payments');
      const cols = new Set(table?.columns.map((col) => col.name) ?? []);
      const existing = (await queryRunner.query(
        `SELECT source_ton_payment_id AS id FROM payout_records WHERE source_ton_payment_id IS NOT NULL`,
      )) as Array<{ id: string }>;
      const seen = new Set(existing.map((row) => row.id));
      const payments = (await queryRunner.query(
        `SELECT * FROM ton_payments`,
      )) as Array<Record<string, unknown>>;
      const now = new Date().toISOString();
      for (const row of payments) {
        const paymentId = cols.has('id') ? String(row.id ?? '') : '';
        if (!paymentId || seen.has(paymentId)) continue;
        const sendMethod =
          cols.has('method') && row.method === 'tonconnect'
            ? 'tonconnect'
            : 'external';
        await this.exec(queryRunner, sqlite,
          `INSERT INTO payout_records (
            id, channel_id, telegram_id, username, method_id, destination_kind,
            currency, amount, wallet_address, send_method, status, tx_or_memo,
            void_or_fail_reason, source, source_ton_payment_id, created_at, updated_at, paid_at
          ) VALUES (?, ?, ?, ?, NULL, 'wallet_address', 'TON', ?, ?, ?, 'paid', ?, NULL, 'ton_payment', ?, ?, ?, ?)`,
          [
            randomUUID(),
            cols.has('channel_id') ? String(row.channel_id ?? '') : '',
            cols.has('telegram_id') ? (row.telegram_id ?? null) : null,
            cols.has('reporter_name')
              ? ((row.reporter_name as string | null) ?? null)
              : null,
            Number(cols.has('amount') ? row.amount : 0) || 0,
            cols.has('wallet') ? ((row.wallet as string | null) ?? null) : null,
            sendMethod,
            cols.has('memo') ? ((row.memo as string | null) ?? null) : null,
            paymentId,
            cols.has('paid_at') ? (row.paid_at ?? now) : now,
            now,
            cols.has('paid_at') ? (row.paid_at ?? now) : now,
          ],
        );
        copied += 1;
        seen.add(paymentId);
      }
    }

    const paidChannels = (await queryRunner.query(
      `SELECT id, reward_ton_amount, reward_wallet, submitted_by, reward_paid_at
       FROM channels
       WHERE reward_ton_amount IS NOT NULL AND reward_ton_amount > 0`,
    )) as Array<Record<string, unknown>>;
    const now = new Date().toISOString();
    for (const channel of paidChannels) {
      const channelId = String(channel.id);
      const existing = (await this.exec(
        queryRunner,
        sqlite,
        `SELECT COUNT(*) AS n FROM payout_records WHERE channel_id = ?`,
        [channelId],
      )) as Array<{ n: number | string }>;
      if (Number(existing[0]?.n ?? 0) > 0) continue;
      const paidAt = channel.reward_paid_at ?? channel.rewardPaidAt ?? now;
      await this.exec(queryRunner, sqlite,
        `INSERT INTO payout_records (
          id, channel_id, telegram_id, username, method_id, destination_kind,
          currency, amount, wallet_address, send_method, status, tx_or_memo,
          void_or_fail_reason, source, source_ton_payment_id, created_at, updated_at, paid_at
        ) VALUES (?, ?, ?, NULL, NULL, 'wallet_address', 'TON', ?, ?, 'external', 'paid', 'reward_* 보강', NULL, 'channel_reward', NULL, ?, ?, ?)`,
        [
          randomUUID(),
          channelId,
          channel.submitted_by ?? channel.submittedBy ?? null,
          Number(channel.reward_ton_amount ?? channel.rewardTonAmount) || 0,
          (channel.reward_wallet ?? channel.rewardWallet ?? null) as string | null,
          paidAt,
          now,
          paidAt,
        ],
      );
      gap += 1;
    }

    const paidAfter = await this.countQuery(
      queryRunner,
      `SELECT COUNT(*) AS n FROM channels WHERE payout_status = 'paid'`,
    );
    console.log(
      `backfill payout: ton_payments=${tonPaymentsCount} copied=${copied} gap=${gap} reward_channels=${rewardChannelCount} paid_channels=${paidAfter} wallet_users=${walletUserCount}`,
    );
  }

  private async exec(
    queryRunner: QueryRunner,
    sqlite: boolean,
    sql: string,
    values: unknown[] = [],
  ) {
    if (values.length === 0) return queryRunner.query(sql);
    if (sqlite) return queryRunner.query(sql, values);
    let index = 0;
    const pgSql = sql.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });
    return queryRunner.query(pgSql, values);
  }

  private async countIfTable(queryRunner: QueryRunner, table: string) {
    if (!(await queryRunner.hasTable(table))) return 0;
    return this.countQuery(queryRunner, `SELECT COUNT(*) AS n FROM ${table}`);
  }

  private async countQuery(queryRunner: QueryRunner, sql: string) {
    try {
      const rows = (await queryRunner.query(sql)) as Array<{
        n?: number | string;
      }>;
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('payout_records')) {
      await queryRunner.dropTable('payout_records');
    }
    if (await queryRunner.hasTable('payout_methods')) {
      await queryRunner.dropTable('payout_methods');
    }
    if (await queryRunner.hasTable('reward_settings')) {
      await queryRunner.dropTable('reward_settings');
    }
    if (await queryRunner.hasColumn('users', 'wallet_kind')) {
      await queryRunner.dropColumn('users', 'wallet_kind');
    }
    if (await queryRunner.hasColumn('channels', 'payout_skip_reason')) {
      await queryRunner.dropColumn('channels', 'payout_skip_reason');
    }
    if (await queryRunner.hasColumn('channels', 'payout_status')) {
      await queryRunner.dropColumn('channels', 'payout_status');
    }
  }
}
