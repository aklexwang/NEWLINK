import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, sessions, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';

/**
 * 홍보 전용 텔레그램 계정(4번).
 *
 * 수집 계정 풀과 완전히 분리한다: 환경변수 이름이 TELEGRAM_PROMO_SESSION 이라
 * 수집 풀(TELEGRAM_SESSION, TELEGRAM_SESSION_2..)에 절대 섞이지 않는다.
 * 이 계정이 정지돼도 수집은 영향 없다. 반대로 수집 계정은 여기서 절대 쓰지 않는다.
 *
 * 하는 일: 들어가 있는 그룹 목록 읽기, 그룹 소개글 읽기, 글 올리기, 공개 홍보방 천천히 가입하기.
 */
export type PromoPeer = {
  peerType: 'channel' | 'chat';
  peerId: string;
  accessHash: string | null;
};

export type PromoGroupInfo = PromoPeer & {
  title: string;
  username: string | null;
  memberCount: number | null;
};

const CONNECT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

@Injectable()
export class PromoTelegramService implements OnModuleDestroy {
  private readonly logger = new Logger(PromoTelegramService.name);
  private client: TelegramClient | null = null;
  private connecting: Promise<TelegramClient> | null = null;
  private clientSession: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private session(): string {
    return (this.config.get<string>('TELEGRAM_PROMO_SESSION') ?? '').trim();
  }

  /** 홍보 계정이 연결돼 있는지(환경변수만 확인) */
  isConfigured(): boolean {
    return this.session().length > 20;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.disconnect().catch(() => undefined);
  }

  private async getClient(): Promise<TelegramClient> {
    const session = this.session();
    if (!session)
      throw new Error('홍보 계정(TELEGRAM_PROMO_SESSION)이 없습니다.');
    if (this.client && this.clientSession === session) return this.client;
    if (this.connecting) return this.connecting;
    const apiId = Number(this.config.get<string>('TELEGRAM_API_ID') ?? '');
    const apiHash = (this.config.get<string>('TELEGRAM_API_HASH') ?? '').trim();
    if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
      throw new Error('TELEGRAM_API_ID / TELEGRAM_API_HASH 가 없습니다.');
    }
    this.connecting = (async () => {
      await this.client?.disconnect().catch(() => undefined);
      const client = new TelegramClient(
        new sessions.StringSession(session),
        apiId,
        apiHash,
        { connectionRetries: 2 },
      );
      // 텔레그램이 "기다려라"를 보내면 라이브러리가 몰래 기다렸다 다시 보내지 않게(바로 오류로 받아 멈춘다)
      client.floodSleepThreshold = 0;
      await withTimeout(
        client.connect(),
        CONNECT_TIMEOUT_MS,
        'timeout:connect',
      );
      this.client = client;
      this.clientSession = session;
      return client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /** 홍보 계정 정보(이름·아이디·프리미엄) */
  async me(): Promise<{
    name: string;
    username: string | null;
    premium: boolean;
  }> {
    const client = await this.getClient();
    const me = await withTimeout(client.getMe(), CALL_TIMEOUT_MS, 'timeout:me');
    return {
      name:
        [me.firstName, me.lastName].filter(Boolean).join(' ') || '(이름 없음)',
      username: me.username ?? null,
      premium: me.premium === true,
    };
  }

  /** 홍보 계정이 들어가 있는 그룹 목록(채널·개인 대화 제외) */
  async listGroups(): Promise<PromoGroupInfo[]> {
    const client = await this.getClient();
    const dialogs = await withTimeout(
      client.getDialogs({ limit: 500 }),
      CALL_TIMEOUT_MS,
      'timeout:dialogs',
    );
    const out: PromoGroupInfo[] = [];
    for (const d of dialogs) {
      const e = d.entity;
      if (e instanceof Api.Channel) {
        if (!e.megagroup || e.left) continue; // 방송 채널은 글을 못 쓰니 제외
        out.push({
          peerType: 'channel',
          peerId: e.id.toString(),
          accessHash: e.accessHash?.toString() ?? null,
          title: (e.title ?? '').slice(0, 200),
          username: e.username ?? null,
          memberCount:
            typeof e.participantsCount === 'number'
              ? e.participantsCount
              : null,
        });
      } else if (e instanceof Api.Chat) {
        if (e.left || e.deactivated || e.migratedTo) continue;
        out.push({
          peerType: 'chat',
          peerId: e.id.toString(),
          accessHash: null,
          title: (e.title ?? '').slice(0, 200),
          username: null,
          memberCount:
            typeof e.participantsCount === 'number'
              ? e.participantsCount
              : null,
        });
      }
    }
    return out;
  }

  private inputPeer(peer: PromoPeer): Api.TypeInputPeer {
    if (peer.peerType === 'chat') {
      return new Api.InputPeerChat({ chatId: BigInt(peer.peerId) as never });
    }
    return new Api.InputPeerChannel({
      channelId: BigInt(peer.peerId) as never,
      accessHash: BigInt(peer.accessHash ?? '0') as never,
    });
  }

  /**
   * 공개 그룹(@아이디) 가입. 그룹이 아니면(방송 채널) 'not a group' 으로 거절한다.
   * 승인제 방이면 텔레그램이 INVITE_REQUEST_SENT 오류를 준다(가입 신청은 된 것).
   */
  async joinPublicGroup(username: string): Promise<{ title: string }> {
    const client = await this.getClient();
    const resolved = await withTimeout(
      client.invoke(new Api.contacts.ResolveUsername({ username })),
      CALL_TIMEOUT_MS,
      'timeout:resolve',
    );
    const chat = resolved.chats.find(
      (c): c is Api.Channel => c instanceof Api.Channel,
    );
    if (!chat) throw new Error('not a group');
    if (!chat.megagroup) throw new Error('not a group (broadcast channel)');
    await withTimeout(
      client.invoke(
        new Api.channels.JoinChannel({
          channel: new Api.InputChannel({
            channelId: chat.id,
            accessHash: chat.accessHash ?? (BigInt(0) as never),
          }),
        }),
      ),
      CALL_TIMEOUT_MS,
      'timeout:join',
    );
    return { title: chat.title ?? username };
  }

  /** 그룹 소개글(규칙 읽기용) */
  async getAbout(peer: PromoPeer): Promise<string | null> {
    const client = await this.getClient();
    if (peer.peerType === 'chat') {
      const full = await withTimeout(
        client.invoke(
          new Api.messages.GetFullChat({
            chatId: BigInt(peer.peerId) as never,
          }),
        ),
        CALL_TIMEOUT_MS,
        'timeout:full',
      );
      return (full.fullChat as { about?: string }).about ?? null;
    }
    const full = await withTimeout(
      client.invoke(
        new Api.channels.GetFullChannel({
          channel: new Api.InputChannel({
            channelId: BigInt(peer.peerId) as never,
            accessHash: BigInt(peer.accessHash ?? '0') as never,
          }),
        }),
      ),
      CALL_TIMEOUT_MS,
      'timeout:full',
    );
    return (full.fullChat as { about?: string }).about ?? null;
  }

  /** 글 올리기(이미지가 있으면 사진 + 설명글). 서식 해석은 끈다(링크 속 _ 가 기울임으로 바뀌지 않게) */
  async sendPost(
    peer: PromoPeer,
    text: string,
    image: { data: Buffer; mime: string } | null,
  ): Promise<void> {
    const client = await this.getClient();
    const entity = this.inputPeer(peer);
    if (image) {
      const ext = image.mime.includes('png') ? 'png' : 'jpg';
      const file = new CustomFile(
        `telllink.${ext}`,
        image.data.length,
        '',
        image.data,
      );
      await withTimeout(
        client.sendFile(entity, {
          file,
          caption: text,
          parseMode: false,
          forceDocument: false,
        }),
        CALL_TIMEOUT_MS,
        'timeout:send',
      );
      return;
    }
    await withTimeout(
      client.sendMessage(entity, {
        message: text,
        parseMode: false,
        linkPreview: true,
      }),
      CALL_TIMEOUT_MS,
      'timeout:send',
    );
  }
}
