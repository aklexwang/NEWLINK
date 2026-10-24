import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

export type PayoutDestinationKind = 'wallet_address' | 'telegram_account';

@Entity('payout_methods')
export class PayoutMethod {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ name: 'destination_kind', type: 'varchar', length: 32 })
  destinationKind: PayoutDestinationKind;

  @Column({ type: 'varchar', length: 32, nullable: true })
  network: string | null;

  @Column({ type: 'varchar', length: 16 })
  currency: string;

  @Column({ name: 'default_amount', type: 'real', default: 0 })
  defaultAmount: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  sort: number;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
