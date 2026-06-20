export interface CategoryItem {
  id: string;
  name: string;
  emoji: string;
  iconUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}