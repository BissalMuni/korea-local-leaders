/** 정당별 배지 색상 (Tailwind 클래스). 미등록 정당은 회색 기본값. */
const PARTY_STYLES: Record<string, string> = {
  더불어민주당: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  국민의힘: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  조국혁신당: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  개혁신당: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  진보당: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  무소속: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  권한대행: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const DEFAULT_STYLE =
  "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";

export function partyBadgeClass(party: string | null): string {
  if (!party) return DEFAULT_STYLE;
  return PARTY_STYLES[party] ?? DEFAULT_STYLE;
}
