import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';

/** 알림을 받을 관리자 텔레그램 아이디 (이 사람이 알림 봇에 /start 를 누르면 채팅 번호를 기억한다) */
const ALERT_TARGET_USERNAME = 'kplay33';
const CHAT_KEY = 'alert.chatId';
/** 신규 방문·가입 알림은 모아서 2분에 한 번 (몰려도 메시지 폭탄이 안 되게) */
const FLUSH_MS = 2 * 60_000;

type Person = { id: number; firstName: string | null; username: string | null };

function who(p: Person): string {
  const name = (p.firstName ?? '').trim();
  if (p.username) return `${name ? `${name} ` : ''}@${p.username}`;
  return name ? `${name} (ID ${p.id})` : `ID ${p.id}`;
}

/**
 * 관리자 알림 전용 봇 (ALERT_BOT_TOKEN).
 * ⛔ TellLink 제품 봇(TELEGRAM_BOT_TOKEN)은 절대 쓰지 않는다. 같은 토큰이면 아예 보내지 않는다.
 * 받는 사람은 @Kplay33 한 명뿐: 그 계정이 알림 봇에 [시작]을 누르면 채팅 번호를 찾아 저장한다.
 * 저장된 채팅도 @Kplay33 의 1:1 채팅인지 확인한 뒤에만 보낸다. 다른 사람·그룹·채널로는 절대 안 보낸다.
 * 보내는 내용은 회원 알림(신규 방문·가입·하루 요약)뿐.
 */
@Injectable()
export class AlertBotService implements OnModuleDestroy {
  private readonly logger = new Logger(AlertBotService.name);
  private chatId: string | null = null;
  private newVisitors: Person[] = [];
  private signups: Person[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private token(): string | null {
    const token = (this.config.get<string>('ALERT_BOT_TOKEN') ?? '').trim();
    if (!token) return null;
    const product = (
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? ''
    ).trim();
    if (product && token === product) return null; // 제품 봇으로는 절대 안 보낸다
    return token;
  }

  isConfigured(): boolean {
    return this.token() != null;
  }

  private async api<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    const token = this.token();
    if (!token) return null;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (!json?.ok) throw new Error(json?.description ?? `HTTP ${res.status}`);
    return json.result ?? null;
  }

  /** 받는 사람 채팅 번호: 저장된 값 → 없으면 봇에 온 /start 에서 @Kplay33 을 찾는다 */
  private async resolveChatId(): Promise<string | null> {
    if (this.chatId) return this.chatId;
    // 저장된 채팅도 정말 @Kplay33 인지 텔레그램에 다시 물어보고 나서만 쓴다(서버 켤 때 한 번)
    const saved = await this.settings.findOne({ where: { key: CHAT_KEY } });
    if (saved?.value && (await this.isTargetChat(saved.value))) {
      return (this.chatId = saved.value);
    }
    const updates = await this.api<
      Array<{
        message?: { chat?: { id: number; type: string; username?: string } };
      }>
    >('getUpdates', { limit: 100, allowed_updates: ['message'] });
    const hit = (updates ?? []).find(
      (u) =>
        u.message?.chat?.type === 'private' &&
        (u.message.chat.username ?? '').toLowerCase() === ALERT_TARGET_USERNAME,
    );
    if (!hit?.message?.chat) return null;
    this.chatId = String(hit.message.chat.id);
    await this.settings.save({ key: CHAT_KEY, value: this.chatId });
    return this.chatId;
  }

  /** 이 채팅이 @Kplay33 의 1:1 채팅인지 */
  private async isTargetChat(chatId: string): Promise<boolean> {
    try {
      const chat = await this.api<{ type?: string; username?: string }>(
        'getChat',
        { chat_id: chatId },
      );
      return (
        chat?.type === 'private' &&
        (chat.username ?? '').toLowerCase() === ALERT_TARGET_USERNAME
      );
    } catch {
      return false;
    }
  }

  /** 지금 바로 보내기 (실패해도 서비스에는 영향 없음) */
  async send(text: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const chatId = await this.resolveChatId();
      if (!chatId) {
        this.logger.warn(
          '알림 봇: @Kplay33 가 아직 봇에 [시작]을 안 눌렀어요.',
        );
        return false;
      }
      await this.api('sendMessage', {
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `알림 봇 전송 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  noteNewVisitor(p: Person) {
    if (!this.isConfigured()) return;
    this.newVisitors.push(p);
    this.schedule();
  }

  noteSignup(p: Person) {
    if (!this.isConfigured()) return;
    this.signups.push(p);
    this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_MS);
  }

  private async flush() {
    const visitors = this.newVisitors.splice(0);
    const signups = this.signups.splice(0);
    const lines: string[] = [];
    if (signups.length) {
      lines.push(`✅ 새 가입 ${signups.length}명`);
      for (const p of signups.slice(0, 15)) lines.push(`  · ${who(p)}`);
      if (signups.length > 15) lines.push(`  · 외 ${signups.length - 15}명`);
    }
    if (visitors.length) {
      if (lines.length) lines.push('');
      lines.push(`🆕 신규 방문자 ${visitors.length}명`);
      for (const p of visitors.slice(0, 15)) lines.push(`  · ${who(p)}`);
      if (visitors.length > 15) lines.push(`  · 외 ${visitors.length - 15}명`);
    }
    if (lines.length) await this.send(`TellLink 알림\n\n${lines.join('\n')}`);
  }
}
