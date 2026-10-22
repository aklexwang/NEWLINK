/**
 * 공개 채널 수집용 일반 계정 로그인.
 * 확인 코드와 세션 문자열은 화면에 출력하지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Api, password as telegramPassword, sessions, TelegramClient } from 'telegram';
import * as qrcodeTerminal from 'qrcode-terminal';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(BACKEND_ROOT, '.env');

function loadEnvFile(filePath: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function upsertEnvLine(filePath: string, key: string, value: string): void {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const escaped = /[\s#]/.test(value)
    ? `"${value.replace(/"/g, '\\"')}"`
    : value;
  const nextLine = `${key}=${escaped}`;
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`) || line.trim().startsWith(`${key} =`)) {
      found = true;
      return nextLine;
    }
    return line;
  });
  if (!found) {
    if (updated.length > 0 && updated[updated.length - 1] !== '') {
      updated.push('');
    }
    updated.push(nextLine);
  }
  const body = updated.join('\n');
  fs.writeFileSync(filePath, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
}

async function readMasked(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const previousRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    if (!stdin.readable) stdin.resume();
    let value = '';
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      if (s === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        reject(new Error('SIGINT'));
        return;
      }
      if (s === '\r' || s === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (s === '\u007f' || s === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (s < ' ') return;
      value += s;
      process.stdout.write('*'.repeat([...s].length));
    };
    function cleanup() {
      stdin.off('data', onData);
      if (stdin.setRawMode) stdin.setRawMode(Boolean(previousRaw));
    }
    stdin.on('data', onData);
  });
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `****${last4}`;
}

function telegramErrorName(error: unknown): string {
  if (error && typeof error === 'object') {
    const rec = error as { errorMessage?: unknown; message?: unknown };
    if (typeof rec.errorMessage === 'string' && rec.errorMessage.trim()) {
      return rec.errorMessage.trim();
    }
    if (typeof rec.message === 'string') {
      const match = rec.message.match(/\b([A-Z][A-Z0-9_]{3,})\b/);
      if (match) return match[1];
    }
  }
  const text = error instanceof Error ? error.message : String(error ?? '');
  const match = text.match(/\b([A-Z][A-Z0-9_]{3,})\b/);
  return match?.[1] ?? 'UNKNOWN_ERROR';
}

function describeCodeType(type: { className?: string } | null | undefined): string {
  const name = type?.className ?? '';
  if (name.includes('App')) return '앱';
  if (name.includes('Fragment')) return 'Fragment';
  if (name.includes('SetUpEmail')) return '이메일 설정 필요';
  if (name.includes('Email')) return '이메일';
  if (name.includes('Firebase')) return 'Firebase SMS';
  if (name.includes('SmsWord')) return 'SMS(단어)';
  if (name.includes('SmsPhrase')) return 'SMS(구문)';
  if (name.includes('FlashCall')) return '전화(플래시)';
  if (name.includes('MissedCall')) return '전화(부재중)';
  if (name.includes('Call')) return '전화';
  if (name.includes('Sms')) return 'SMS';
  return name ? name.replace(/^auth\.(Sent)?CodeType/, '') : '없음';
}

type SentCodeInfo = {
  className?: string;
  type?: { className?: string };
  nextType?: { className?: string };
  timeout?: number;
  phoneCodeHash?: string;
};

function printSentCodeInfo(sent: SentCodeInfo): void {
  const current = describeCodeType(sent.type ?? sent);
  const next = sent.nextType
    ? describeCodeType(sent.nextType)
    : '없음';
  const timeout =
    typeof sent.timeout === 'number' && sent.timeout > 0
      ? `${sent.timeout}초 후`
      : '지금';
  console.log(`전송 방식: ${current}`);
  console.log(`다음 전송 방식: ${next}`);
  console.log(`재요청 가능 시간: ${timeout}`);
}

async function sendLoginCode(
  client: TelegramClient,
  apiId: number,
  apiHash: string,
  phone: string,
): Promise<SentCodeInfo> {
  const result = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    }),
  );
  return result as SentCodeInfo;
}

async function resendLoginCode(
  client: TelegramClient,
  phone: string,
  phoneCodeHash: string,
): Promise<SentCodeInfo> {
  const result = await client.invoke(
    new Api.auth.ResendCode({
      phoneNumber: phone,
      phoneCodeHash,
    }),
  );
  return result as SentCodeInfo;
}

function qrLoginUrl(token: Buffer): string {
  const encoded = token.toString('base64url');
  return `tg://login?token=${encoded}`;
}

function drawLoginQr(token: Buffer): void {
  console.clear();
  console.log('텔레그램 앱 → 설정 → 기기 → 데스크톱 기기 연결 로 스캔하세요');
  console.log('QR은 약 30초마다 새로 그립니다.');
  qrcodeTerminal.generate(qrLoginUrl(token), { small: true });
}

function saveSession(client: TelegramClient): void {
  const session = client.session.save() as unknown as string;
  if (!session || typeof session !== 'string') {
    console.error('SESSION_EMPTY');
    process.exit(1);
  }
  upsertEnvLine(ENV_PATH, 'TELEGRAM_SESSION', session.replace(/\s+/g, ''));
  console.log('저장 완료');
}

async function runQrLogin(
  client: TelegramClient,
  apiId: number,
  apiHash: string,
  rl: readline.Interface,
): Promise<void> {
  await client.connect();
  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token }) => {
        drawLoginQr(token);
      },
      password: async (hint) => {
        const label = hint?.trim()
          ? `2단계 비밀번호(${hint}): `
          : '2단계 비밀번호: ';
        const pwd = (await readMasked(label)).trim();
        if (!pwd) throw new Error('SESSION_PASSWORD_NEEDED');
        return pwd;
      },
      onError: (error) => {
        console.error(telegramErrorName(error));
        return true;
      },
    },
  );
  saveSession(client);
}

async function run(): Promise<void> {
  const env = loadEnvFile(ENV_PATH);
  const apiIdRaw = (env.TELEGRAM_API_ID ?? '').trim();
  const apiHash = (env.TELEGRAM_API_HASH ?? '').trim();
  const phone = (env.TELEGRAM_COLLECTOR_PHONE ?? '').trim();
  const useQr = process.argv.includes('--qr');
  if (!/^\d+$/.test(apiIdRaw) || !apiHash) {
    console.error('TELEGRAM_API_ID, TELEGRAM_API_HASH 가 필요합니다.');
    process.exit(1);
  }

  const apiId = Number(apiIdRaw);
  if (!useQr) {
    if (!phone.startsWith('+')) {
      console.error('TELEGRAM_COLLECTOR_PHONE 은 + 로 시작해야 합니다.');
      process.exit(1);
    }
    console.log(`번호: ${maskPhone(phone)}`);
  }

  const rl = readline.createInterface({ input, output });
  const client = new TelegramClient(
    new sessions.StringSession(''),
    apiId,
    apiHash,
    { connectionRetries: 5 },
  );

  try {
    if (useQr) {
      await runQrLogin(client, apiId, apiHash, rl);
      return;
    }

    await client.connect();

    let sent: SentCodeInfo;
    try {
      sent = await sendLoginCode(client, apiId, apiHash, phone);
    } catch (error) {
      console.error(telegramErrorName(error));
      process.exit(1);
      return;
    }
    printSentCodeInfo(sent);
    let phoneCodeHash = sent.phoneCodeHash ?? '';
    if (!phoneCodeHash) {
      console.error('PHONE_CODE_HASH_EMPTY');
      process.exit(1);
    }

    let signedIn = false;
    while (!signedIn) {
      const typed = (
        await readMasked('확인 코드 (다른 방식으로 받으려면 r): ')
      ).trim();
      if (typed.toLowerCase() === 'r') {
        try {
          sent = await resendLoginCode(client, phone, phoneCodeHash);
          if (sent.phoneCodeHash) phoneCodeHash = sent.phoneCodeHash;
          printSentCodeInfo(sent);
        } catch (error) {
          console.error(telegramErrorName(error));
        }
        continue;
      }
      if (!typed) continue;

      try {
        const result = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash,
            phoneCode: typed,
          }),
        );
        if (result instanceof Api.auth.AuthorizationSignUpRequired) {
          console.error('SIGN_UP_REQUIRED');
          process.exit(1);
        }
        signedIn = true;
      } catch (error) {
        const name = telegramErrorName(error);
        if (name === 'SESSION_PASSWORD_NEEDED') {
          const pwd = (await readMasked('2단계 비밀번호(없으면 엔터): ')).trim();
          if (!pwd) {
            console.error('SESSION_PASSWORD_NEEDED');
            process.exit(1);
          }
          try {
            const pwdInfo = await client.invoke(new Api.account.GetPassword());
            await client.invoke(
              new Api.auth.CheckPassword({
                password: await telegramPassword.computeCheck(
                  pwdInfo as never,
                  pwd,
                ),
              }),
            );
            signedIn = true;
          } catch (pwdError) {
            console.error(telegramErrorName(pwdError));
            process.exit(1);
          }
          continue;
        }
        console.error(name);
      }
    }

    saveSession(client);
  } catch (error) {
    console.error(telegramErrorName(error));
    process.exit(1);
  } finally {
    rl.close();
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

run().catch((error) => {
  console.error(telegramErrorName(error));
  process.exit(1);
});
