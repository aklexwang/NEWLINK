import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumberTransformer } from '../common/bigint-transformer';
import { dateTimeColumnType } from '../common/db-types';

export type PayoutRecordStatus = 'sending' | 'paid' | 'failed' | 'void';
export type PayoutSendMethod =
  | 'tonconnect'
  | 'external'
  | 'manual_gift'
  | 'bot_gift';
export type PayoutRecordSource = 'ton_payment' | 'channel_reward' | 'live';

@Entity('payout_records')
export class PayoutRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Index('idx_payout_records_channel_id')
  @Column({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Index('idx_payout_records_telegram_id')
  @Column({
    name: 'telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  telegramId: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ name: 'method_id', type: 'varchar', length: 36, nullable: true })
  methodId: string | null;

  @Column({ name: 'destination_kind', type: 'varchar', length: 32 })
  destinationKind: string;

  @Column({ type: 'varchar', length: 16 })
  currency: string;

  @Column({ type: 'real' })
  amount: number;

  @Column({ name: 'wallet_address', type: 'varchar', length: 256, nullable: true })
  walletAddress: string | null;

  @Column({ name: 'send_method', type: 'varchar', length: 32 })
  sendMethod: PayoutSendMethod;

  @Index('idx_payout_records_status')
  @Column({ type: 'varchar', length: 20 })
  status: PayoutRecordStatus;

  @Column({ name: 'tx_or_memo', type: 'varchar', length: 500, nullable: true })
  txOrMemo: string | null;

  @Column({
    name: 'void_or_fail_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  voidOrFailReason: string | null;

  @Column({ type: 'varchar', length: 32, default: 'live' })
  source: PayoutRecordSource;

  @Column({
    name: 'source_ton_payment_id',
    type: 'varchar',
    length: 36,
    nullable: true,
    unique: true,
  })
  sourceTonPaymentId: string | null;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @Column({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;

  @Index('idx_payout_records_paid_at')
  @Column({ name: 'paid_at', type: dateTimeColumnType(), nullable: true })
  paidAt: Date | null;
}
