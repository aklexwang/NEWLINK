# 어드민 UI 규칙

회원 화면(`src/pages` 중 admin 제외, `AppLayout` 등)은 이 폴더의 부품을 **가져오지 않습니다.** CSS 변수와 base 스타일은 `.admin-root` 안에서만 씁니다.

## 쓸 부품

`frontend/src/components/admin/ui/` 의 shadcn/ui 공식 설치분만 사용합니다.

- 버튼: `button`
- 입력: `input`, `select`, `checkbox`
- 표시: `badge`, `card`, `table`, `tabs`, `separator`, `skeleton`
- 레이어: `dialog`, `dropdown-menu`, `sheet`, `tooltip`
- 알림: `sonner` (`Toaster`는 `AdminLayout`에만)

클래스 합치기는 `cn` 패키지 또는 `@/components/admin/lib/utils` 의 `cn`을 씁니다.

## 색

- 배경 `bg-background`, 글자 `text-foreground`, 보조 `text-muted-foreground`
- 카드 `bg-card`, 테두리 `border-border`
- 강조 버튼 `variant="default"`, 보조 `secondary` / `outline` / `ghost`
- 위험 `destructive`
- 사이드바는 `bg-sidebar` / `text-sidebar-foreground`
- 어드민 다크는 `.admin-root.dark` 만. `html.dark`(회원 테마)와 섞지 않습니다.

## 간격

- 페이지 안쪽 `p-6`
- 카드 그리드 `gap-3`, 섹션 사이 `mt-8`
- 테이블은 `Table` / `TableHeader` / `TableRow` / `TableCell`
- 숫자 요약은 `Card` + `CardHeader` / `CardTitle` / `CardDescription`

새 화면은 대시보드·수집 운영과 같은 부품을 먼저 쓰고, 회원용 Tailwind 색(`bg-white`, `text-slate-900` 등)은 어드민에 새로 넣지 않습니다.
