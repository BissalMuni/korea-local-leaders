// 광역/기초 지자체장 데이터 모델

export type RegionType = "metropolitan" | "basic"; // 광역 | 기초

/** 시·도(광역) 기본 정보 — 거의 변하지 않는 정적 사실 */
export interface RegionSeed {
  /** 행정표준코드 시도 2자리 (예: "11" 서울) */
  code: string;
  /** 정식 명칭 (예: "서울특별시") */
  name: string;
  /** 짧은 명칭 (예: "서울") */
  shortName: string;
  type: RegionType;
  /** 단체장 직함 (예: "시장", "도지사", "구청장", "군수") */
  title: string;
  /** 기초자치단체일 때 상위 광역 코드 (예: 종로구 -> "11") */
  provinceCode?: string;
  /** 기초자치단체일 때 상위 광역 명칭 (예: "서울특별시") */
  provinceName?: string;
  /** 공식 홈페이지 (기초는 비어 있을 수 있음) */
  homepage: string;
  /** 청사 위치 좌표 (지도용, 선택) */
  lat?: number;
  lng?: number;
}

/** 크롤러가 채우는 단체장 정보 + 시드 병합 결과 (UI가 소비) */
export interface Governor extends RegionSeed {
  /** 단체장 성명 */
  personName: string | null;
  /** 소속 정당 */
  party: string | null;
  /** 취임일 (ISO 날짜) */
  termStart: string | null;
  /** 임기 종료 예정일 (ISO 날짜) */
  termEnd: string | null;
  /** 슬로건 / 시정구호 */
  slogan: string | null;
  /** 비전 (한 문장 이상) */
  vision: string | null;
  /** 프로필 사진 URL (기관장 사진) */
  photoUrl: string | null;
  /** 기관 CI/로고 이미지 URL (심볼마크) */
  ci: string | null;
  /** 주요공약 (5대 공약 등). 없으면 null */
  pledges: string[] | null;
  /** 데이터 출처 URL */
  source: string | null;
  /** 마지막 수집 시각 (ISO) */
  lastCrawledAt: string | null;
  /** 수동 보정 여부 — true면 크롤러가 덮어쓰지 않음 */
  manualOverride: boolean;
}
