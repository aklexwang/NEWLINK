import { Column, Entity, PrimaryColumn } from 'typeorm';

/** 날짜별 미니앱 방문자 수 (KST 하루 한 사람 1번) */
@Entity('visitor_daily')
export class VisitorDaily {
  /** YYYY-MM-DD (KST) */
  @PrimaryColumn({ type: 'varchar', length: 10 })
  day: string;

  /** 그날 미니앱을 연 사람 수 */
  @Column({ type: 'integer', default: 0 })
  visitors: number;

  /** 그중 처음 온 사람 수 */
  @Column({ name: 'new_visitors', type: 'integer', default: 0 })
  newVisitors: number;
}
