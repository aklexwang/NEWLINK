import { validateSync } from 'class-validator';
import { LinkType } from '../channel.entity';
import { CreateChannelDto } from './channel.dto';

function dto(link: string): CreateChannelDto {
  const row = new CreateChannelDto();
  row.title = '제목';
  row.link = link;
  row.linkType = LinkType.CHANNEL;
  row.category = '뉴스';
  row.description = '설명';
  return row;
}

describe('CreateChannelDto.link', () => {
  it('t.me / telegram.me 만 통과한다', () => {
    expect(validateSync(dto('https://t.me/NewsKorea'))).toHaveLength(0);
    expect(validateSync(dto('https://telegram.me/NewsKorea'))).toHaveLength(0);
    expect(validateSync(dto('https://evilt.me/x')).length).toBeGreaterThan(0);
    expect(validateSync(dto('https://example.com/foo')).length).toBeGreaterThan(
      0,
    );
  });
});
