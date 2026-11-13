import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 재발 방지 가드.
 * MTProto 호출은 반드시 MtprotoCollectorService.call() 한 곳을 지나야 한다.
 * (허용 메서드 검사·호출 간격·FloodWait·계정 선택/고정·하루 한도가 전부 거기 있다)
 * gramJS 의 편의 함수(getMe·getEntity 등)를 직접 부르면 이 안전장치를 다 건너뛴다.
 */
describe('MTProto 호출 단일 통로', () => {
  const src = readFileSync(
    join(__dirname, 'mtproto-collector.service.ts'),
    'utf8',
  );

  it('client.invoke 는 call() 안에 한 번만 있다', () => {
    const count = (src.match(/\.invoke\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('외부 진입점은 모두 줄(exclusive)을 거친다 — 동시 실행 금지', () => {
    const entries = [
      'collectAndSave',
      'collectInviteAndSave',
      'requestJoinForChannel',
      'inspectPublicUsername',
      'searchPublicByKeyword',
      'testPublicUsername',
    ];
    for (const m of entries) {
      expect(src).toContain(`this.exclusive(() => this.${m}Inner(`);
      expect(src).toMatch(new RegExp(`private async ${m}Inner\\(`));
    }
    // 새 public async 진입점이 줄 없이 추가되지 않았는지(onModuleInit·prepare 는 MTProto 호출 없음)
    const publicAsync = [...src.matchAll(/^ {2}async (\w+)\(/gm)].map(
      (m) => m[1],
    );
    expect(publicAsync.sort()).toEqual(['onModuleInit', 'prepareForCollectRun']);
  });

  it('gramJS 편의 함수를 직접 부르지 않는다(call 우회 금지)', () => {
    const bypass = src.match(
      /\.(getMe|getEntity|getInputEntity|getMessages|getDialogs|getParticipants|sendMessage|sendFile|iterMessages|iterDialogs|iterParticipants)\(/g,
    );
    expect(bypass).toBeNull();
  });
});

/**
 * 재발 방지 가드: 제품 봇(TellLink)으로 관리자 알림을 보내지 않는다(운영자 요청).
 */
describe('관리자 알림은 제품 봇으로 보내지 않는다', () => {
  it('TelegramAdminNotifyService 에 sendMessage 호출이 없다', () => {
    const src = readFileSync(
      join(__dirname, '..', 'common', 'telegram-admin-notify.service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/fetch\(|\/sendMessage/);
  });
});
