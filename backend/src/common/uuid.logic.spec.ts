import { BadRequestException } from '@nestjs/common';
import { isUuid } from './uuid.logic';
import { parseCompareIds } from '../stats/dto/public-stats.dto';

describe('uuid 형식', () => {
  it('uuid 만 통과한다', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('compare ids 가 uuid 가 아니면 400이다', () => {
    expect(() => parseCompareIds('abc,def')).toThrow(BadRequestException);
    expect(
      parseCompareIds(
        '550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001',
      ),
    ).toHaveLength(2);
  });
});
