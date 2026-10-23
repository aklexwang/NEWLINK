import { LinkType } from '../channels/channel.entity';
import {
  decideCollectOverlap,
  FULL_PIPELINE_STEPS,
  isLightCollectTarget,
  lastPostAtFromCollectedPosts,
  LIGHT_PIPELINE_STEPS,
  parseStatsCollectMode,
  STATS_CRON_FULL_UTC,
  STATS_CRON_LIGHT_UTC,
  statsCronModeFromSchedule,
  statsCronWaitMinutes,
} from './stats-collect.logic';

describe('수집 모드 단계', () => {
  it('full 은 기존 파이프라인 전체를 돌린다', () => {
    expect([...FULL_PIPELINE_STEPS]).toEqual([
      'collect',
      'language',
      'metrics',
      'prune',
      'verify',
      'discovery',
      'keyword',
    ]);
    expect(parseStatsCollectMode(undefined)).toBe('full');
    expect(parseStatsCollectMode('FULL')).toBe('full');
  });

  it('light 는 미리보기 수집과 공개 캐시 비우기만 한다', () => {
    expect([...LIGHT_PIPELINE_STEPS]).toEqual([
      'previewCollect',
      'clearPublicCache',
    ]);
    expect(LIGHT_PIPELINE_STEPS).not.toEqual(
      expect.arrayContaining(['discovery', 'keyword', 'verify']),
    );
    expect(parseStatsCollectMode('light')).toBe('light');
  });

  it('light 대상은 공개 채널만이고 그룹·초대방은 뺀다', () => {
    expect(
      isLightCollectTarget({
        linkType: LinkType.CHANNEL,
        username: 'news_kr',
        link: 'https://t.me/news_kr',
      }),
    ).toBe(true);
    expect(
      isLightCollectTarget({
        linkType: LinkType.GROUP,
        username: 'news_kr',
        link: 'https://t.me/news_kr',
      }),
    ).toBe(false);
    expect(
      isLightCollectTarget({
        linkType: LinkType.CHANNEL,
        username: null,
        link: 'https://t.me/+AbCdEf',
      }),
    ).toBe(false);
  });
});

describe('수집 겹침', () => {
  it('다른 run 이 있으면 light 는 건너뛴다', () => {
    expect(
      decideCollectOverlap({ requested: 'light', running: 'full' }),
    ).toEqual({ action: 'skip_conflict' });
    expect(
      decideCollectOverlap({ requested: 'light', running: 'light' }),
    ).toEqual({ action: 'skip_conflict' });
  });

  it('full 은 light 가 끝날 때까지 기다리고, full 끼리는 시작하지 않는다', () => {
    expect(
      decideCollectOverlap({ requested: 'full', running: 'light' }),
    ).toEqual({ action: 'wait_for_light' });
    expect(
      decideCollectOverlap({ requested: 'full', running: 'full' }),
    ).toEqual({ action: 'skip_busy' });
    expect(
      decideCollectOverlap({ requested: 'full', running: null }),
    ).toEqual({ action: 'start' });
  });
});

describe('스케줄 → 모드', () => {
  it('KST 03:05(UTC 18:05) 만 full 이고 나머지 3시간 간격은 light 다', () => {
    expect(
      statsCronModeFromSchedule({
        eventName: 'schedule',
        schedule: STATS_CRON_FULL_UTC,
      }),
    ).toBe('full');
    for (const cron of STATS_CRON_LIGHT_UTC) {
      expect(
        statsCronModeFromSchedule({ eventName: 'schedule', schedule: cron }),
      ).toBe('light');
    }
    expect(statsCronWaitMinutes('full')).toBe(100);
    expect(statsCronWaitMinutes('light')).toBe(30);
  });

  it('수동 실행은 고른 모드를 쓰고 기본은 light 다', () => {
    expect(
      statsCronModeFromSchedule({
        eventName: 'workflow_dispatch',
        dispatchMode: '',
      }),
    ).toBe('light');
    expect(
      statsCronModeFromSchedule({
        eventName: 'workflow_dispatch',
        dispatchMode: 'full',
      }),
    ).toBe('full');
  });
});

describe('피드 마지막 게시', () => {
  it('light 가 넣은 글의 postedAt 최댓값을 쓴다', () => {
    const last = lastPostAtFromCollectedPosts([
      { postedAt: '2026-10-23T03:00:00.000Z' },
      { postedAt: '2026-10-23T05:40:00.000Z' },
      { postedAt: '2026-10-23T04:10:00.000Z' },
    ]);
    expect(last?.toISOString()).toBe('2026-10-23T05:40:00.000Z');
  });
});
