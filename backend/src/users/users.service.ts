import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { RegisterUserDto } from './dto/user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  toPublicUser(user: User) {
    return {
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      tonWalletAddress: user.tonWalletAddress,
      isRegistered: user.isRegistered,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
    };
  }

  async loginOrRegisterWithTelegram(telegramUser: TelegramUser): Promise<{
    user: User;
    isNewUser: boolean;
  }> {
    const existing = await this.userRepository.findOne({
      where: { telegramId: telegramUser.id },
    });

    if (existing) {
      existing.firstName = telegramUser.first_name ?? existing.firstName;
      existing.username = telegramUser.username ?? existing.username;
      return {
        user: await this.userRepository.save(existing),
        isNewUser: false,
      };
    }

    const created = this.userRepository.create({
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name ?? null,
      username: telegramUser.username ?? null,
      isRegistered: false,
    });

    return {
      user: await this.userRepository.save(created),
      isNewUser: true,
    };
  }

  async syncFromTelegram(telegramUser: TelegramUser): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { telegramId: telegramUser.id },
    });

    if (!user) {
      user = this.userRepository.create({
        telegramId: telegramUser.id,
        firstName: telegramUser.first_name ?? null,
        username: telegramUser.username ?? null,
        isRegistered: false,
      });
    } else {
      user.firstName = telegramUser.first_name ?? user.firstName;
      user.username = telegramUser.username ?? user.username;
    }

    return this.userRepository.save(user);
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { telegramId } });
  }

  async getMe(telegramUser: TelegramUser): Promise<User> {
    return this.syncFromTelegram(telegramUser);
  }

  async register(telegramUser: TelegramUser, dto: RegisterUserDto): Promise<User> {
    const user = await this.syncFromTelegram(telegramUser);
    user.tonWalletAddress = dto.tonWalletAddress.trim();
    user.isRegistered = true;
    return this.userRepository.save(user);
  }

  async findByTelegramIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.telegram_id IN (:...ids)', { ids })
      .getMany();
  }

  async getReporterOrNull(telegramId: number | null) {
    if (!telegramId) return null;
    const user = await this.findByTelegramId(telegramId);
    if (!user) {
      return {
        telegramId,
        username: null,
        firstName: null,
        tonWalletAddress: null,
        isRegistered: false,
      };
    }
    return {
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      tonWalletAddress: user.tonWalletAddress,
      isRegistered: user.isRegistered,
    };
  }

  async requireRegistered(telegramUser: TelegramUser): Promise<User> {
    const user = await this.getMe(telegramUser);
    if (!user.isRegistered || !user.tonWalletAddress) {
      throw new BadRequestException('Registration with TON wallet is required.');
    }
    return user;
  }

  findAll() {
    return this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}