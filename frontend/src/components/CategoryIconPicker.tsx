import { useRef, useState } from 'react';
import { uploadCategoryIcon } from '../api/admin';
import { resolveMediaUrl } from '../utils/mediaUrl';

const PRESET_EMOJIS = [
  '📁', '📰', '👥', '🛒', '📚', '🎬', '🎮', '💰', '💳', '🔎',
  '🎵', '⚽', '🍔', '✈️', '💼', '🏥', '🔧', '📱', '🎨', '🌟',
];

interface CategoryIconPickerProps {
  emoji: string;
  iconUrl?: string | null;
  onEmojiChange: (emoji: string) => void;
  onIconUrlChange: (iconUrl: string | null) => void;
}

export function CategoryIconPicker({
  emoji,
  iconUrl,
  onEmojiChange,
  onIconUrlChange,
}: CategoryIconPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const url = await uploadCategoryIcon(file);
      onIconUrlChange(url);
    } catch {
      setError('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-tg-secondary text-3xl">
          {iconUrl ? (
            <img src={resolveMediaUrl(iconUrl)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{emoji || '📁'}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-xl bg-tg-button px-4 py-2 text-sm font-medium text-tg-button-text disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '이미지 업로드'}
          </button>
          {iconUrl && (
            <button
              type="button"
              onClick={() => onIconUrlChange(null)}
              className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-black/5"
            >
              이미지 제거
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-tg-hint">이모지 선택</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_EMOJIS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onEmojiChange(item);
                onIconUrlChange(null);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                !iconUrl && emoji === item ? 'bg-tg-open-bg ring-2 ring-tg-link/40' : 'bg-tg-bg ring-1 ring-black/5'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}