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

/** AI정책 개별 사업의 분류 축 (강남구 케이스에서 도출) */
export type AiProgramCategory =
  | "인재양성" // 교육·아카데미 (예: 청년 AI 아카데미)
  | "실증" // 리빙랩·오픈이노베이션 실증 (예: AI가 삶이 되는 지능형 도시)
  | "행정혁신" // 민원·행정 내부 AI 도입
  | "인프라" // GPU·데이터센터·플랫폼 구축
  | "산업창업" // 기업지원·창업·투자
  | "거버넌스" // 조례·전략·전담조직
  | "기타";

/** 지자체 AI정책의 개별 사업 */
export interface AiProgram {
  /** 사업명 */
  name: string;
  /** 분류 */
  category: AiProgramCategory;
  /** 한두 문장 설명. 없으면 null */
  description?: string | null;
  /** 규모 (예: "8개 기업", "30명", "예산 5억"). 없으면 null */
  scale?: string | null;
  /** 추진 기간/시기 (예: "2026-07 ~ 2026-09", "2026-06~"). 없으면 null */
  period?: string | null;
  /** 진행 상태 */
  status?: "계획" | "추진중" | "완료" | null;
  /** 근거 출처 URL. 없으면 null */
  source?: string | null;
}

/** 지자체 AI정책 묶음 — Governor에 선택적으로 붙는 차원 */
export interface AiPolicy {
  /** 비전/캐치프레이즈 한 줄 (예: "강남, AI가 삶이 되는 지능형 도시") */
  summary: string | null;
  /** 개별 사업 목록. 없으면 null */
  programs: AiProgram[] | null;
  /** 전담 조직/부서 (예: "스마트도시과"). 미확인이면 null — 날조 금지 */
  department: string | null;
  /** 대표 출처 URL */
  source: string | null;
  /** 마지막 갱신 시각 (ISO). 없으면 null */
  updatedAt: string | null;
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
  /** 지자체 AI정책 (선택). 미수집 지자체는 생략 또는 null */
  aiPolicy?: AiPolicy | null;
  /** 데이터 출처 URL */
  source: string | null;
  /** 마지막 수집 시각 (ISO) */
  lastCrawledAt: string | null;
  /** 수동 보정 여부 — true면 크롤러가 덮어쓰지 않음 */
  manualOverride: boolean;
}
