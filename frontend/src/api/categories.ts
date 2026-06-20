import { apiClient } from './client';
import type { CategoryItem } from '../types/categoryItem';

export async function getCategories(): Promise<CategoryItem[]> {
  const { data } = await apiClient.get<CategoryItem[]>('/categories');
  return data;
}