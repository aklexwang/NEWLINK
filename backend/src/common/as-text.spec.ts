import { asText } from './as-text';

describe('asText', () => {
  it('기본 값은 String 과 같다', () => {
    expect(asText('a')).toBe('a');
    expect(asText(12)).toBe('12');
    expect(asText(12n)).toBe('12');
    expect(asText(true)).toBe('true');
    expect(asText(null)).toBe('');
    expect(asText(undefined)).toBe('');
  });
  it('자기 toString 이 있는 객체(BigInteger 등)는 그 값', () => {
    expect(asText({ toString: () => '1234567890123' })).toBe('1234567890123');
    expect(asText(new Error('x'))).toBe('Error: x');
  });
  it('평범한 객체는 빈 글자', () => {
    expect(asText({ a: 1 })).toBe('');
  });
});
