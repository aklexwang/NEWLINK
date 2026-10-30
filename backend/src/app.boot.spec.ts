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

import './app.boot.env';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { ChannelOpenDaily } from './analytics/analytics.entities';
import { SearchTermsService } from './analytics/search-terms.service';
import { Channel, ChannelStatus } from './channels/channel.entity';

describe('AppModule 부팅', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('SQLite 메모리 DB로 서버 모듈이 켜진다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    expect(app.getHttpAdapter().getInstance()).toBeDefined();
  }, 30_000);
});

describe('AppModule 부팅 - 검색 금지어·이동 기록', () => {
  const HUMAN_UA =
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  let app: INestApplication | undefined;
  const savedSecret = process.env.ANALYTICS_HASH_SECRET;
  const savedGate = process.env.MINIAPP_ONLY;

  async function bootWith(
    secret: string,
    gate = false,
  ): Promise<INestApplication> {
    process.env.ANALYTICS_HASH_SECRET = secret;
    // 이 테스트들은 검색·이동 기록을 보는 것이라 미니앱 문지기는 끈다(문지기 자체는 아래 따로)
    process.env.MINIAPP_ONLY = gate ? 'true' : 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const created = moduleRef.createNestApplication();
    created.setGlobalPrefix('api');
    created.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await created.init();
    app = created;
    return created;
  }

  async function seedChannel(created: INestApplication): Promise<string> {
    const repo = created.get(DataSource).getRepository(Channel);
    const saved = await repo.save(
      repo.create({
        title: '부팅 테스트 채널',
        link: 'https://t.me/boot_test_channel',
        category: '기타',
        description: '설명',
        status: ChannelStatus.ACTIVE,
      }),
    );
    return saved.id;
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) {
      await app.close();
      app = undefined;
    }
    if (savedSecret === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    else process.env.ANALYTICS_HASH_SECRET = savedSecret;
    if (savedGate === undefined) delete process.env.MINIAPP_ONLY;
    else process.env.MINIAPP_ONLY = savedGate;
  });

  it('키가 있으면 부팅되고 이동 기록 요청은 204 이며 채널별 일별 수가 올라간다', async () => {
    const created = await bootWith('k'.repeat(64));
    const channelId = await seedChannel(created);

    await request(created.getHttpServer())
      .post(`/api/channels/${channelId}/telegram-open`)
      .set('User-Agent', HUMAN_UA)
      .expect(204);
    await request(created.getHttpServer())
      .post(`/api/channels/${channelId}/telegram-open`)
      .set('User-Agent', HUMAN_UA)
      .expect(204); // 같은 사람 1시간 안 재클릭: 204 이지만 세지 않는다

    const rows = await created
      .get(DataSource)
      .getRepository(ChannelOpenDaily)
      .find();
    expect(rows).toHaveLength(1);
    expect(rows[0].openCount).toBe(1);
  }, 30_000);

  it('미니앱 문지기가 켜지면 텔레그램 서명 없는 공개 API 는 403 miniapp_only', async () => {
    const created = await bootWith('k'.repeat(64), true);
    const res = await request(created.getHttpServer())
      .get('/api/channels/search?q=abc')
      .set('User-Agent', HUMAN_UA)
      .expect(403);
    expect(res.body.code).toBe('miniapp_only');
    await request(created.getHttpServer()).get('/api/categories').expect(403);
    // 관리자·내부·로그인 경로는 문지기가 막지 않는다(각자 인증)
    const admin = await request(created.getHttpServer()).get(
      '/api/admin/stats/ops',
    );
    expect(admin.status).not.toBe(403);
  }, 30_000);

  it('키가 없으면 정상 부팅하고 이동 기록만 건너뛰며 경고는 한 번만 남긴다', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const created = await bootWith('');
    const channelId = await seedChannel(created);

    for (let i = 0; i < 3; i += 1) {
      await request(created.getHttpServer())
        .post(`/api/channels/${channelId}/telegram-open`)
        .set('User-Agent', HUMAN_UA)
        .expect(204);
    }
    // 서버는 계속 정상 동작한다
    await request(created.getHttpServer())
      .get('/api/channels/search?q=테스트')
      .expect(200);

    const rows = await created
      .get(DataSource)
      .getRepository(ChannelOpenDaily)
      .find();
    expect(rows).toHaveLength(0);
    const keyWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes('ANALYTICS_HASH_SECRET'),
    );
    expect(keyWarnings).toHaveLength(1);
  }, 30_000);

  it('잘못된 채널 ID 는 400, 없는 채널은 204 로 조용히 넘어간다', async () => {
    const created = await bootWith('k'.repeat(64));
    await request(created.getHttpServer())
      .post('/api/channels/not-a-uuid/telegram-open')
      .set('User-Agent', HUMAN_UA)
      .expect(400);
    await request(created.getHttpServer())
      .post('/api/channels/00000000-0000-4000-8000-000000000000/telegram-open')
      .set('User-Agent', HUMAN_UA)
      .expect(204);
  }, 30_000);

  it('금지어가 들어 있는 검색은 결과 없이 안내 문구를 돌려주고 기록한다', async () => {
    const created = await bootWith('k'.repeat(64));
    await created.get(SearchTermsService).create('block', '마약');

    const blocked = await request(created.getHttpServer())
      .get('/api/channels/search')
      .query({ q: '마.약 판매', record: '1' })
      .set('User-Agent', HUMAN_UA)
      .expect(200);
    expect(blocked.body).toMatchObject({
      items: [],
      total: 0,
      blocked: true,
      message: '해당 검색어는 허용하지 않습니다.',
    });

    const normal = await request(created.getHttpServer())
      .get('/api/channels/search')
      .query({ q: '맛집' })
      .expect(200);
    expect(normal.body.blocked).toBeUndefined();
    expect(Array.isArray(normal.body.items)).toBe(true);

    // 기록은 응답 뒤에 비동기로 저장된다
    await new Promise((resolve) => setTimeout(resolve, 300));
    const stats = await created
      .get(DataSource)
      .query(
        'SELECT search_count AS n, blocked_count AS b FROM search_daily_stats',
      );
    expect(stats).toHaveLength(1);
    expect(Number(stats[0].n)).toBe(1);
    expect(Number(stats[0].b)).toBe(1);
  }, 30_000);
});
