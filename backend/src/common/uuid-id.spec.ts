import { isUuidId } from './uuid-id';

describe('isUuidId', () => {
  it('randomUUID 는 통과하고 default 같은 문자열은 거절한다', () => {
    expect(isUuidId('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(isUuidId('default')).toBe(false);
    expect(isUuidId('')).toBe(false);
    expect(isUuidId(null)).toBe(false);
  });
});
