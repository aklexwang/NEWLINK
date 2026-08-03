import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('channel_favorites')
@Unique(['userId', 'channelId'])
export class ChannelFavorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
