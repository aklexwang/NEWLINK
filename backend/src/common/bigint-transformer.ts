/** Postgres bigint는 드라이버가 string으로 줄 수 있어 number로 맞춥니다. */
export const bigintNumberTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  },
};

export const bigintNumberRequiredTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  },
};
