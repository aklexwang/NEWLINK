import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DiscoveredUsername } from './discovered-username.entity';

export const DISCOVERY_SOURCE_INVITE = 'invite';
/** 그룹 대화 속 t.me/아이디 링크에서 찾은 공개 채널·그룹 */
export const DISCOVERY_SOURCE_GROUP = 'group';

/**
 * 수집한 글·소개글에서 찾은 비공개 초대 링크(+해시)를 발견 대기열에 넣는다.
 * 실제 검사·등록은 새벽 발견 단계(channel-discovery)가 한다.
 */
@Injectable()
export class InviteDiscoveryQueueService {
  private readonly logger = new Logger(InviteDiscoveryQueueService.name);

  constructor(
    @InjectRepository(DiscoveredUsername)
    private readonly repo: Repository<DiscoveredUsername>,
  ) {}

  async enqueue(tokens: Iterable<string>): Promise<number> {
    const list = [
      ...new Set([...tokens].filter((t) => /^\+[A-Za-z0-9_-]{10,40}$/.test(t))),
    ].slice(0, 200);
    if (list.length === 0) return 0;
    try {
      const existing = await this.repo.find({
        where: { username: In(list) },
        select: ['username'],
      });
      const known = new Set(existing.map((r) => r.username));
      const fresh = list.filter((t) => !known.has(t));
      if (fresh.length === 0) return 0;
      const now = new Date();
      await this.repo
        .createQueryBuilder()
        .insert()
        .values(
          fresh.map((username) => ({
            username,
            result: 'queued' as const,
            checkedAt: now,
            mentionCount: 1,
            source: DISCOVERY_SOURCE_INVITE,
          })),
        )
        .orIgnore()
        .execute();
      return fresh.length;
    } catch (error) {
      this.logger.warn(`초대 링크 대기열 저장 실패: ${String(error)}`);
      return 0;
    }
  }

  /**
   * 그룹 대화 속 t.me/아이디 링크를 발견 대기열에 넣는다(이미 있는 아이디는 건너뜀).
   * 실제 검사는 새벽 발견 단계가 하루 한도(대기열 300개) 안에서 공개 페이지로 한다(텔레그램 계정 안 씀).
   */
  async enqueueUsernames(
    usernames: Iterable<string>,
    source: string = DISCOVERY_SOURCE_GROUP,
  ): Promise<number> {
    const list = [
      ...new Set(
        [...usernames]
          .map((u) => u.replace(/^@/, '').trim().toLowerCase())
          .filter(
            (u) => /^[a-z][a-z0-9_]{3,31}$/.test(u) && !u.endsWith('bot'),
          ),
      ),
    ].slice(0, 200);
    if (list.length === 0) return 0;
    try {
      const existing = await this.repo.find({
        where: { username: In(list) },
        select: ['username'],
      });
      const known = new Set(existing.map((r) => r.username));
      const fresh = list.filter((u) => !known.has(u));
      if (fresh.length === 0) return 0;
      const now = new Date();
      await this.repo
        .createQueryBuilder()
        .insert()
        .values(
          fresh.map((username) => ({
            username,
            result: 'queued' as const,
            checkedAt: now,
            mentionCount: 1,
            source,
          })),
        )
        .orIgnore()
        .execute();
      return fresh.length;
    } catch (error) {
      this.logger.warn(
        `그룹 링크 대기열 저장 실패: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }
}
