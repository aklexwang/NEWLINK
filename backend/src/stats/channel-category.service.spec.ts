import { ChannelStatus, LinkType } from '../channels/channel.entity';
import { ChannelCategoryService } from './channel-category.service';

describe('ChannelCategoryService', () => {
  it('category_locked 이면 글을 읽지도 분류하지도 않는다', async () => {
    const postRepository = { find: jest.fn() };
    const categoryAi = {
      defaultCategoryNames: jest.fn(),
      classify: jest.fn(),
    };
    const service = new ChannelCategoryService(
      {} as never,
      postRepository as never,
      {} as never,
      categoryAi as never,
    );
    const locked = {
      categoryLocked: true,
      category: '분류대기',
      linkType: LinkType.CHANNEL,
      id: '1',
      status: ChannelStatus.ACTIVE,
    };
    const result = await service.classifyOne(locked as never);
    expect(result).toBe(locked);
    expect(postRepository.find).not.toHaveBeenCalled();
    expect(categoryAi.classify).not.toHaveBeenCalled();
  });
});
