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

/** 정당별 상징색 (RGB). deck.gl 레이어·깃발·범례에서 공용으로 사용. */
const PARTY_RGB: Record<string, [number, number, number]> = {
  더불어민주당: [0, 80, 175],
  국민의힘: [230, 30, 43],
  조국혁신당: [0, 115, 207],
  개혁신당: [255, 114, 16],
  진보당: [214, 0, 28],
  무소속: [120, 120, 120],
  권한대행: [217, 119, 6],
};
const DEFAULT_RGB: [number, number, number] = [148, 163, 184];

export function partyColorRGB(party: string | null): [number, number, number] {
  if (!party) return DEFAULT_RGB;
  return PARTY_RGB[party] ?? DEFAULT_RGB;
}

export function partyColorCss(party: string | null): string {
  const [r, g, b] = partyColorRGB(party);
  return `rgb(${r}, ${g}, ${b})`;
}

/** 정당색 깃발(폴+펜넌트) SVG 를 data-URI 로 생성. deck.gl IconLayer 아이콘용. */
export function partyFlagDataUri(party: string | null): string {
  const [r, g, b] = partyColorRGB(party);
  const fill = `rgb(${r},${g},${b})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80">
    <rect x="6" y="4" width="4" height="72" rx="2" fill="#cbd5e1"/>
    <path d="M10 6 H56 L46 20 L56 34 H10 Z" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
