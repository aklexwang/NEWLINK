import { apiClient } from './client';

export type RewardPolicy = {
  rewardsEnabled: boolean;
  requireWallet: boolean;
};

export async function getRewardPolicy(): Promise<RewardPolicy> {
  const { data } = await apiClient.get<RewardPolicy>('/rewards/policy');
  return data;
}
