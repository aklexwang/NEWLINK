import {
  buildTemplateCopies,
  parseAiCopies,
  PROMO_TEXT_MAX,
} from './promo-copy.logic';

describe('promo-copy.logic', () => {
  const input = {
    rooms: 5763,
    categories: 30,
    link: 'https://t.me/telllink_bot',
  };
  it('기본 문구 여러 버전, 모두 링크 포함, 서로 다름', () => {
    const list = buildTemplateCopies(input);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(new Set(list).size).toBe(list.length);
    for (const t of list) expect(t).toContain(input.link);
    expect(list[0]).toContain('5,700개+');
  });
  it('AI 답 나누기 · 링크 붙이기 · 번호 지우기', () => {
    const raw =
      '1. 첫 번째 홍보 글입니다 텔레그램 방 찾기 쉬워요\n---\n**두 번째** 글이에요 https://t.me/telllink_bot 여기서 보세요\n---\n짧음';
    const out = parseAiCopies(raw, input.link);
    expect(out).toHaveLength(2);
    expect(out[0].startsWith('첫 번째')).toBe(true);
    expect(out[0]).toContain(input.link);
    expect(out[1]).not.toContain('**');
  });
  it('너무 긴 글은 자름', () => {
    const out = parseAiCopies('가'.repeat(2000), input.link);
    expect(out[0].length).toBeLessThanOrEqual(PROMO_TEXT_MAX);
  });
  it('빈 답', () => {
    expect(parseAiCopies(null, input.link)).toEqual([]);
  });
});
