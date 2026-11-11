import { DataSource, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import {
  COLLECT_QUEUE_COLUMNS,
  COLLECT_QUEUE_LIMIT_DEFAULT,
  collectQueueLimit,
  selectDueChannels,
} from './collect-queue.query';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-26T12:00:00Z');

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe('수집 큐 뽑기 (selectDueChannels)', () => {
  let dataSource: DataSource;
  let repo: Repository<Channel>;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Channel],
      synchronize: true,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(Channel);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function add(id: string, extra: Partial<Channel> = {}): Promise<void> {
    await repo.insert({
      id,
      title: `제목 ${id}`,
      link: `https://t.me/${id}`,
      username: id,
      category: '기타',
      description: '소개글',
      status: ChannelStatus.ACTIVE,
      linkType: LinkType.CHANNEL,
      ...extra,
    });
  }

  async function ids(options: Parameters<typeof selectDueChannels>[1] = {}) {
    const rows = await selectDueChannels(repo, { now: NOW, ...options });
    return rows.map((row) => row.id);
  }

  it('NULL 이거나 예정 시각이 지난 것만 뽑고, 아직 안 된 것은 뺀다', async () => {
    await add('never');
    await add('past', { nextCollectAt: ago(HOUR) });
    await add('now', { nextCollectAt: NOW });
    await add('future', { nextCollectAt: new Date(NOW.getTime() + HOUR) });

    expect((await ids()).sort()).toEqual(['never', 'now', 'past']);
  });

  it('NULL 먼저, 그다음 예정 시각이 가장 빠른(오래 밀린) 순서', async () => {
    await add('late', { nextCollectAt: ago(1 * HOUR) });
    await add('early', { nextCollectAt: ago(10 * HOUR) });
    await add('mid', { nextCollectAt: ago(5 * HOUR) });
    await add('never-b', { lastCollectedAt: ago(2 * DAY) });
    await add('never-a'); // 한 번도 수집 안 한 채널이 가장 먼저

    expect(await ids()).toEqual(['never-a', 'never-b', 'early', 'mid', 'late']);
  });

  it('full: 미읽음 비공개·미리보기막힌 방을 맨 앞에, 그 안에서 회원 많은 순', async () => {
    // 일반 채널(우선군 밖)
    await add('plain', { nextCollectAt: ago(10 * HOUR) });
    // 미리보기 막힌 공개 채널 (access hash 없음) — 작은 방
    await add('blocked-small', {
      collectError: 'preview:disabled',
      memberCount: 1000,
    });
    // 비공개 방 (access hash 없음) — 큰 방
    await add('invite-big', {
      collectStatus: 'invite_only',
      link: 'https://t.me/+bigroom',
      memberCount: 90000,
    });
    // 비공개 방 — 중간
    await add('invite-mid', {
      collectStatus: 'invite_only',
      link: 'https://t.me/+midroom',
      memberCount: 5000,
    });

    // 우선군(invite-big → invite-mid → blocked-small, 회원 많은 순) 먼저, 그다음 일반
    expect(await ids()).toEqual([
      'invite-big',
      'invite-mid',
      'blocked-small',
      'plain',
    ]);
  });

  it('이미 가입/엿보기 끝난(access hash 있는) 비공개 방은 우선군에서 빠진다', async () => {
    await add('already', {
      collectStatus: 'invite_only',
      link: 'https://t.me/+already',
      memberCount: 99999,
      telegramAccessHash: '12345',
      nextCollectAt: ago(1 * HOUR),
    });
    await add('unread', {
      collectStatus: 'invite_only',
      link: 'https://t.me/+unread',
      memberCount: 100,
    });
    // 미읽음(작아도) 먼저, 이미 읽은 큰 방은 일반 순서로
    expect(await ids()).toEqual(['unread', 'already']);
  });

  it('LIMIT 만큼만 뽑는다 (가장 밀린 것부터)', async () => {
    await add('a', { nextCollectAt: ago(3 * HOUR) });
    await add('b', { nextCollectAt: ago(2 * HOUR) });
    await add('c', { nextCollectAt: ago(1 * HOUR) });

    expect(await ids({ limit: 2 })).toEqual(['a', 'b']);
  });

  it('공개(active) 채널만 뽑고 병합(merged)은 제외한다', async () => {
    await add('ok');
    await add('pending', { status: ChannelStatus.PENDING });
    await add('rejected', { status: ChannelStatus.REJECTED });
    await add('merged', { collectStatus: 'merged' });
    await add('gone', { collectStatus: 'gone' });
    await add('failed', { collectStatus: 'failed' });

    expect((await ids()).sort()).toEqual(['failed', 'gone', 'ok']);
  });

  it('만료된 초대 링크는 마지막 확인 뒤 7일 동안 제외한다', async () => {
    await add('recent', {
      collectStatus: 'invite_expired',
      lastCollectedAt: ago(3 * DAY),
    });
    await add('old', {
      collectStatus: 'invite_expired',
      lastCollectedAt: ago(8 * DAY),
    });
    await add('unknown', { collectStatus: 'invite_expired' });

    expect((await ids()).sort()).toEqual(['old', 'unknown']);
  });

  it('light 는 채널만, 초대 링크는 제외한다 (full 은 그룹·초대 포함 전체)', async () => {
    await add('chan');
    await add('grp', { linkType: LinkType.GROUP });
    await add('invite', {
      link: 'https://t.me/+AbCdEf123',
      username: null,
    });
    await add('joinchat', {
      link: 'https://t.me/joinchat/AAAA',
      username: null,
    });

    expect(await ids({ light: true })).toEqual(['chan']);
    expect((await ids()).sort()).toEqual(['chan', 'grp', 'invite', 'joinchat']);
  });

  it('필요한 칸만 읽는다 (소개글·제목은 읽지 않는다)', async () => {
    await add('a');
    const [row] = await selectDueChannels(repo, { now: NOW });
    const loaded = Object.entries(row)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .sort();
    // nextCollectAt 은 NULL 값으로 읽힌다 (undefined 가 아님)
    expect(loaded).toEqual([...COLLECT_QUEUE_COLUMNS].sort());
    expect(row.description).toBeUndefined();
    expect(row.title).toBeUndefined();
  });

  it('LIMIT 기본값과 환경값 해석', () => {
    expect(collectQueueLimit(undefined)).toBe(COLLECT_QUEUE_LIMIT_DEFAULT);
    expect(collectQueueLimit('abc')).toBe(COLLECT_QUEUE_LIMIT_DEFAULT);
    expect(collectQueueLimit('0')).toBe(COLLECT_QUEUE_LIMIT_DEFAULT);
    expect(collectQueueLimit('250')).toBe(250);
  });
});
