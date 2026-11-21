/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));
import { parseSessionList } from '../stats/mtproto-pool.logic';
import { PromoService } from './promo.service';

/** 아주 단순한 메모리 저장소(쓰는 메서드만) */
function repo(rows: any[] = []) {
  const matches = (r: any, where: any) =>
    !where ||
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && '_type' in v) {
        if (v._type === 'moreThanOrEqual') return r[k] >= v._value;
        if (v._type === 'in') return v._value.includes(r[k]);
      }
      return r[k] === v;
    });
  return {
    rows,
    find: jest.fn(async (o?: any) => {
      let out = rows.filter((r) => matches(r, o?.where));
      if (o?.order?.postedAt === 'DESC')
        out = [...out].sort((a, b) => b.postedAt - a.postedAt);
      return out;
    }),
    findOne: jest.fn(async (o?: any) => {
      let out = rows.filter((r) => matches(r, o?.where));
      if (o?.order?.postedAt === 'DESC')
        out = [...out].sort((a, b) => b.postedAt - a.postedAt);
      return out[0] ?? null;
    }),
    findOneBy: jest.fn(
      async (w: any) => rows.find((r) => matches(r, w)) ?? null,
    ),
    findBy: jest.fn(async (w: any) => rows.filter((r) => matches(r, w))),
    count: jest.fn(
      async (o?: any) => rows.filter((r) => matches(r, o?.where)).length,
    ),
    create: jest.fn((x: any) => ({ ...x })),
    insert: jest.fn(async (x: any) => void rows.push({ ...x })),
    save: jest.fn(async (x: any) => {
      const list = Array.isArray(x) ? x : [x];
      for (const item of list) {
        const key = item.id ?? item.key;
        const i = rows.findIndex((r) => (r.id ?? r.key) === key);
        if (i >= 0) rows[i] = { ...rows[i], ...item };
        else rows.push({ ...item });
      }
      return x;
    }),
    delete: jest.fn(async () => undefined),
  };
}

function setup(sendImpl: () => Promise<void>) {
  const targets = repo([
    {
      id: 't1',
      peerType: 'channel',
      peerId: '1',
      accessHash: '9',
      title: '홍보방A',
      enabled: true,
      status: 'ok',
      dailyLimit: 1,
      minGapMinutes: 180,
      lastPostedAt: null,
      nextAllowedAt: null,
      textOnly: false,
      lastCreativeId: null,
    },
  ]);
  const creatives = repo([
    {
      id: 'c1',
      text: '홍보 글입니다 https://t.me/telllink_bot',
      imageUrl: null,
      enabled: true,
      sentCount: 0,
      lastSentAt: null,
    },
  ]);
  const logs = repo([]);
  const settings = repo([{ key: 'promo.enabled', value: '1' }]);
  const telegram = {
    isConfigured: () => true,
    sendPost: jest.fn(sendImpl),
    me: jest.fn(),
  };
  const svc = new PromoService(
    targets as any,
    creatives as any,
    logs as any,
    settings as any,
    repo() as any,
    repo() as any,
    telegram as any,
    { read: jest.fn() } as any,
    { summarizeKorean: jest.fn() } as any,
  );
  return { svc, targets, logs, settings, telegram };
}

describe('PromoService.sendNext (방별 한도·텔레그램 경고 지키기)', () => {
  it('보내고 나면 같은 방은 하루 횟수 때문에 다시 안 보냄', async () => {
    const { svc, telegram } = setup(async () => undefined);
    expect((await svc.sendNext('manual')).sent).toBe(true);
    const second = await svc.sendNext('manual');
    expect(second.sent).toBe(false);
    expect(telegram.sendPost).toHaveBeenCalledTimes(1);
  });

  it('텔레그램 "쉬어라"(FLOOD_WAIT) → 전체 멈춤', async () => {
    const { svc, settings } = setup(async () => {
      throw new Error('FLOOD_WAIT_3600');
    });
    const r = await svc.sendNext('manual');
    expect(r.sent).toBe(false);
    const paused = settings.rows.find(
      (x: any) => x.key === 'promo.pausedUntil',
    );
    expect(new Date(paused.value).getTime()).toBeGreaterThan(
      Date.now() + 3600_000,
    );
    expect((await svc.sendNext('manual')).reason).toMatch(/멈춤/);
  });

  it('계정 스팸 제한(PEER_FLOOD) → 하루 멈춤', async () => {
    const { svc, settings } = setup(async () => {
      throw new Error('400: PEER_FLOOD');
    });
    await svc.sendNext('manual');
    const paused = settings.rows.find(
      (x: any) => x.key === 'promo.pausedUntil',
    );
    expect(new Date(paused.value).getTime()).toBeGreaterThan(
      Date.now() + 23 * 3600_000,
    );
  });

  it('강퇴·글쓰기 막힘 → 그 방만 끔', async () => {
    const { svc, targets } = setup(async () => {
      throw new Error('403: CHAT_WRITE_FORBIDDEN');
    });
    await svc.sendNext('manual');
    expect(targets.rows[0]).toMatchObject({
      status: 'room_blocked',
      enabled: false,
    });
  });

  it('자동은 꺼져 있으면 안 보냄', async () => {
    const { svc, settings, telegram } = setup(async () => undefined);
    settings.rows[0].value = '0';
    expect((await svc.sendNext('auto')).sent).toBe(false);
    expect(telegram.sendPost).not.toHaveBeenCalled();
  });
});

describe('홍보 계정은 수집 계정 풀과 분리', () => {
  it('TELEGRAM_PROMO_SESSION 은 수집 풀에 들어가지 않는다', () => {
    const list = parseSessionList({
      TELEGRAM_SESSION: 'aaa',
      TELEGRAM_SESSION_2: 'bbb',
      TELEGRAM_PROMO_SESSION: 'promo',
    } as any);
    expect(list).not.toContain('promo');
  });
});
