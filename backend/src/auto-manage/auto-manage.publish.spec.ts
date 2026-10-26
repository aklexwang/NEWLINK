jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: () => ({ module: class ScheduleRootMock {} }) },
  Cron: () => () => undefined,
}));

import { ChannelStatus, LinkType } from '../channels/channel.entity';
import { AutoManageService } from './auto-manage.service';
import { ImportCandidateStatus } from './channel-import-candidate.entity';

function build(
  match: { kind: string; channel: { id: string; status: string } } | null,
) {
  const service = Object.create(
    AutoManageService.prototype,
  ) as AutoManageService;
  const candidate = {
    id: 'cand-1',
    status: ImportCandidateStatus.PENDING,
    link: 'https://t.me/news_kr',
    title: '뉴스',
    category: '뉴스',
    linkType: LinkType.CHANNEL,
    publishedChannelId: null as string | null,
  };
  const channelsService = {
    findDuplicate: jest.fn().mockResolvedValue(match),
    approve: jest.fn(async (id: string) => ({
      id,
      status: ChannelStatus.ACTIVE,
    })),
    createByAdmin: jest.fn(async () => ({
      id: 'created',
      status: ChannelStatus.ACTIVE,
    })),
  };
  const candidateRepository = {
    find: jest.fn().mockResolvedValue([candidate]),
    save: jest.fn(async (row: unknown) => row),
  };
  const target = service as unknown as Record<string, unknown>;
  target.channelsService = channelsService;
  target.candidateRepository = candidateRepository;
  return { service, candidate, channelsService };
}

describe('AutoManageService.publish 중복 판단', () => {
  it('거절된 행은 approve 로 되살리지 않고 실패로 알린다', async () => {
    const { service, candidate, channelsService } = build({
      kind: 'rejected',
      channel: { id: 'old', status: ChannelStatus.REJECTED },
    });
    const results = await service.publish([candidate.id]);
    expect(channelsService.approve).not.toHaveBeenCalled();
    expect(channelsService.createByAdmin).not.toHaveBeenCalled();
    expect(results[0].ok).toBe(false);
    expect(results[0].message).toContain('거절');
    expect(candidate.status).toBe(ImportCandidateStatus.PENDING);
  });

  it('승인 대기 행은 승인하고, 이미 ACTIVE 면 그 행에 연결만 한다', async () => {
    const pending = build({
      kind: 'pending',
      channel: { id: 'p1', status: ChannelStatus.PENDING },
    });
    const pendingResult = await pending.service.publish([pending.candidate.id]);
    expect(pending.channelsService.approve).toHaveBeenCalledWith('p1');
    expect(pendingResult[0].ok).toBe(true);

    const active = build({
      kind: 'active',
      channel: { id: 'a1', status: ChannelStatus.ACTIVE },
    });
    const activeResult = await active.service.publish([active.candidate.id]);
    expect(active.channelsService.approve).not.toHaveBeenCalled();
    expect(active.candidate.publishedChannelId).toBe('a1');
    expect(activeResult[0].ok).toBe(true);
  });

  it('같은 링크가 없으면 새로 만든다', async () => {
    const { service, candidate, channelsService } = build(null);
    const results = await service.publish([candidate.id]);
    expect(channelsService.createByAdmin).toHaveBeenCalledTimes(1);
    expect(results[0].ok).toBe(true);
  });
});
