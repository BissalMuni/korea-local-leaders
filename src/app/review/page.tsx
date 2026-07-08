import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { getAllGovernors } from "@/lib/data";
import type { Governor } from "@/lib/types";
import ReviewClient, { type ReviewRow, type FieldKey } from "./ReviewClient";

export const metadata: Metadata = {
  title: "데이터 검수 — 로컬시티",
  description: "광역·기초 단체장 5개 필드를 출처 페이지와 나란히 비교 검수",
};

/** 기초 기관장 사진의 출처(인사말 페이지) 매핑 — crawler/basic_photos.json */
function loadPhotoSources(): Record<string, string> {
  try {
    const file = path.join(process.cwd(), "crawler", "basic_photos.json");
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      photos: Record<string, { source?: string }>;
    };
    const out: Record<string, string> = {};
    for (const [code, p] of Object.entries(data.photos ?? {})) {
      if (p.source) out[code] = p.source;
    }
    return out;
  } catch {
    return {};
  }
}

/** g.source 문자열에서 위키백과 링크만 추출(광역 사진 출처) */
function wikiUrl(source: string | null): string | null {
  if (!source) return null;
  const hit = source
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.includes("wikipedia.org"));
  return hit ?? null;
}

/** 각 필드가 어느 페이지에서 추출됐는지 출처 URL을 계산 */
function buildSources(
  g: Governor,
  photoSrc: Record<string, string>,
): Record<FieldKey, string | null> {
  const home = g.homepage || null;
  return {
    // 홈페이지·슬로건·CI 는 해당 기관 홈페이지에서 수집
    homepage: home,
    slogan: g.slogan ? home : null,
    ci: g.ci ? home : null,
    // 사진: 기초는 인사말 페이지, 광역은 위키백과
    photoUrl: g.photoUrl
      ? g.type === "basic"
        ? photoSrc[g.code] ?? home
        : wikiUrl(g.source) ?? home
      : null,
    // 공약: 선관위 API — 페이지 없음
    pledges: null,
  };
}

export default function ReviewPage() {
  const { governors, updatedAt } = getAllGovernors();
  const photoSrc = loadPhotoSources();

  const rows: ReviewRow[] = governors.map((g) => ({
    code: g.code,
    name: g.name,
    type: g.type,
    title: g.title,
    provinceCode: g.provinceCode ?? null,
    provinceName: g.provinceName ?? null,
    personName: g.personName,
    party: g.party,
    manualOverride: g.manualOverride,
    values: {
      homepage: g.homepage || null,
      photoUrl: g.photoUrl,
      slogan: g.slogan,
      ci: g.ci,
      pledges: g.pledges,
    },
    sources: buildSources(g, photoSrc),
  }));

  return <ReviewClient rows={rows} updatedAt={updatedAt} />;
}
