import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintNumberRequiredTransformer } from '../common/bigint-transformer';

@Entity('users')
export class User {
  @PrimaryColumn({
    name: 'telegram_id',
    type: 'bigint',
    transformer: bigintNumberRequiredTransformer,
  })
  telegramId: number;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ name: 'ton_wallet_address', type: 'varchar', length: 128, nullable: true })
  tonWalletAddress: string | null;

  @Column({ name: 'is_registered', default: false })
  isRegistered: boolean;

  @Column({ name: 'is_blocked', default: false })
  isBlocked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}