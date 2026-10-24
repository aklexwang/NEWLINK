jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: () => ({
      module: class ScheduleRootMock {},
    }),
  },
  Cron: () => () => undefined,
}));

import { AdminInspectService } from './admin-inspect.service';

describe('AdminInspectService 부팅', () => {
  it('status=running 인 job 을 interrupted 로 바꾼다', async () => {
    const jobRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'job-running', status: 'running', finishedAt: null },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminInspectService(
      {} as never,
      {} as never,
      {} as never,
      jobRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.onModuleInit();

    expect(jobRepository.update).toHaveBeenCalledWith(
      'job-running',
      expect.objectContaining({
        status: 'interrupted',
        endedReason: 'interrupted',
      }),
    );
  });
});
