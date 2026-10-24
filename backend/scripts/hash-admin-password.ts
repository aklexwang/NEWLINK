/**
 * 관리자 비밀번호 bcrypt 해시만 출력한다.
 * 평문 비밀번호는 저장하지 않는다.
 *
 *   npm run admin:hash-password
 */
import { hash } from 'bcrypt';

const ROUNDS = 12;

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('터미널에서 실행해 주세요.'));
      return;
    }

    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    let settled = false;

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string) => {
      for (const key of chunk) {
        if (settled) return;
        if (key === '\u0003') {
          cleanup();
          process.stderr.write('\n');
          process.exit(130);
        }
        if (key === '\r' || key === '\n') {
          settled = true;
          cleanup();
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (key === '\u007f' || key === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (key < ' ') continue;
        value += key;
      }
    };

    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const first = await askHidden('비밀번호: ');
  const second = await askHidden('비밀번호 확인: ');

  if (!first) {
    process.stderr.write('비밀번호를 입력해 주세요.\n');
    process.exitCode = 1;
    return;
  }
  if (first !== second) {
    process.stderr.write('비밀번호가 일치하지 않습니다.\n');
    process.exitCode = 1;
    return;
  }

  const digest = await hash(first, ROUNDS);
  process.stdout.write(`${digest}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : '비밀번호 해시를 만들지 못했습니다.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
