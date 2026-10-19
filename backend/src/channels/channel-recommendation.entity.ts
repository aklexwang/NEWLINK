import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintNumberRequiredTransformer } from '../common/bigint-transformer';
import { dateTimeColumnType } from '../common/db-types';

@Entity('channel_recommendations')
@Unique(['userId', 'channelId'])
export class ChannelRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'user_id',
    type: 'bigint',
    transformer: bigintNumberRequiredTransformer,
  })
  userId: number;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
