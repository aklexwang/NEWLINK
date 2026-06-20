import type { LinkType } from '../../types/channel';
import { linkTypeLabel } from '../../utils/linkType';

interface LinkTypeToggleProps {
  value: LinkType;
  onChange: (type: LinkType) => void;
}

export function LinkTypeToggle({ value, onChange }: LinkTypeToggleProps) {
  return (
    <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
      {(['channel', 'group'] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
            value === type ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-black/10'
          }`}
        >
          {linkTypeLabel(type)}
        </button>
      ))}
    </div>
  );
}
