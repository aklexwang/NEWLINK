import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LinkType } from '../channels/channel.entity';

export enum ImportCandidateStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  SKIPPED = 'skipped',
}

@Entity('channel_import_candidates')
export class ChannelImportCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 512, unique: true })
  link: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 100 })
  category: string;

  @Column({ name: 'link_type', type: 'varchar', length: 20, default: LinkType.CHANNEL })
  linkType: LinkType;

  @Column({ name: 'participants_count', type: 'integer', default: 0 })
  participantsCount: number;

  @Column({ name: 'avatar_url', type: 'varchar', length: 1024, nullable: true })
  avatarUrl: string | null;

  @Column({ length: 20 })
  source: string;

  @Column({ type: 'varchar', length: 20, default: ImportCandidateStatus.PENDING })
  status: ImportCandidateStatus;

  @Column({ name: 'published_channel_id', type: 'varchar', length: 36, nullable: true })
  publishedChannelId: string | null;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt: Date;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
