import { Column, Entity, PrimaryColumn } from 'typeorm';

export type AdKind = 'banner' | 'rank';

/** 광고 성과: 광고·날짜(KST)별 노출·클릭 수 */
@Entity('ad_daily_stats')
export class AdDailyStat {
  @PrimaryColumn({ name: 'ad_kind', type: 'varchar', length: 10 })
  adKind: AdKind;

  @PrimaryColumn({ name: 'ad_id', type: 'varchar', length: 36 })
  adId: string;

  /** 'YYYY-MM-DD' (KST) */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  day: string;

  @Column({ type: 'integer', default: 0 })
  impressions: number;

  @Column({ type: 'integer', default: 0 })
  clicks: number;
}
