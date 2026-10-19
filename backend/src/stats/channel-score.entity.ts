import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type ChannelGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** 채널 일일 점수 (날짜는 KST YYYY-MM-DD) */
@Entity('channel_scores')
@Unique('uq_channel_scores_channel_scored', ['channelId', 'scoredOn'])
@Index('idx_channel_scores_channel', ['channelId'])
export class ChannelScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'scored_on', type: 'varchar', length: 10 })
  scoredOn: string;

  @Column({ type: 'integer', default: 0 })
  total: number;

  @Column({ type: 'varchar', length: 1 })
  grade: ChannelGrade;

  @Column({ name: 'scale_score', type: 'real', default: 0 })
  scaleScore: number;

  @Column({ name: 'view_rate_score', type: 'real', default: 0 })
  viewRateScore: number;

  @Column({ name: 'activity_score', type: 'real', default: 0 })
  activityScore: number;

  @Column({ name: 'growth_score', type: 'real', default: 0 })
  growthScore: number;

  @Column({ name: 'manipulation_suspected', type: 'boolean', default: false })
  manipulationSuspected: boolean;

  @Column({ name: 'overall_rank', type: 'integer', nullable: true })
  overallRank: number | null;

  @Column({ name: 'category_rank', type: 'integer', nullable: true })
  categoryRank: number | null;
}
