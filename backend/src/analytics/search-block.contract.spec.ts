import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 계약 테스트: 회원이 쓰는 컨트롤러가 검색어(q / keyword / search / query)를 받으면
 * 반드시 금지어 판정(searchTerms.check)을 거쳐야 한다.
 * 새 검색 API 를 만들고 판정을 빼먹으면 이 테스트가 실패한다.
 */
const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(SRC);
const isAdminFile = (file: string) =>
  /(^|[\\/])admin[^\\/]*$/.test(file) || /[\\/]admin[\\/]/.test(file);

const SEARCH_PARAM =
  /@Query\(\s*['"](q|keyword|keywords|search|query)['"]\s*\)/;
const SEARCH_DTO_FIELD = /^\s*(q|keyword|keywords|search|query)\??\s*[:=]/m;

describe('회원 검색 API 의 금지어 판정', () => {
  const controllers = files.filter(
    (file) => file.endsWith('.controller.ts') && !isAdminFile(file),
  );
  const dtos = files.filter(
    (file) =>
      /\.dto\.ts$/.test(file) &&
      !isAdminFile(file) &&
      !/[\\/](auth|payments)[\\/]/.test(file),
  );

  it('검색어를 직접 받는 회원 컨트롤러는 searchTerms.check 를 호출한다', () => {
    const offenders = controllers
      .filter((file) => SEARCH_PARAM.test(readFileSync(file, 'utf8')))
      .filter((file) => !/searchTerms\.check\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('검색어 필드가 있는 회원용 DTO 를 쓰는 컨트롤러는 searchTerms.check 를 호출한다', () => {
    const searchDtoClasses: string[] = [];
    for (const file of dtos) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(
        /export class (\w+)\s*\{([\s\S]*?)\n\}/g,
      )) {
        if (SEARCH_DTO_FIELD.test(match[2])) searchDtoClasses.push(match[1]);
      }
    }
    expect(searchDtoClasses).toContain('SearchChannelDto');

    const offenders = controllers
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return (
          searchDtoClasses.some((name) =>
            new RegExp(`@Query\\(\\)\\s+\\w+\\s*:\\s*${name}\\b`).test(text),
          ) && !/searchTerms\.check\(/.test(text)
        );
      })
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('GET /channels/search 컨트롤러가 검사 대상에 들어 있다', () => {
    const channelsController = controllers.find((file) =>
      file.endsWith(join('channels', 'channels.controller.ts')),
    );
    expect(channelsController).toBeDefined();
    expect(readFileSync(channelsController as string, 'utf8')).toMatch(
      /searchTerms\.check\(dto\.q\)/,
    );
  });
});
