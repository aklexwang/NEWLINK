import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintNumberTransformer } from '../common/bigint-transformer';

@Entity('ton_payments')
export class TonPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date;

  @Column({ type: 'float' })
  amount: number;

  @Column({ type: 'varchar', length: 256 })
  wallet: string;

  @Column({
    name: 'telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  telegramId: number | null;

  @Column({ name: 'reporter_name', type: 'varchar', length: 255, nullable: true })
  reporterName: string | null;

  @Index()
  @Column({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Column({ name: 'channel_title', type: 'varchar', length: 255 })
  channelTitle: string;

  @Column({ name: 'channel_link', type: 'varchar', length: 512 })
  channelLink: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  memo: string | null;

  /** tonconnect | external */
  @Column({ type: 'varchar', length: 20, default: 'external' })
  method: string;
}
