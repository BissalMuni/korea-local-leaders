import Link from "next/link";
import type { Metadata } from "next";
import { getGovernors } from "@/lib/data";
import MapClient from "./MapClient";

export const metadata: Metadata = {
  title: "지도 — 로컬시티",
  description: "전국 광역단체장을 정당색 지도와 깃발·사진 마커로 봅니다.",
};

export default function MapPage() {
  const { governors } = getGovernors();

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      {/* 지도 */}
      <MapClient governors={governors} />

      {/* 상단 헤더 (지도 위 오버레이) */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded-xl bg-black/60 px-4 py-2 text-white backdrop-blur">
          <h1 className="text-lg font-bold">전국 광역단체장 지도</h1>
          <p className="text-xs text-white/70">
            정당색 · 깃발 · 당선인 사진 — 지역을 클릭하면 상세보기
          </p>
        </div>
        <Link
          href="/"
          className="pointer-events-auto rounded-xl bg-black/60 px-3 py-2 text-sm text-white backdrop-blur hover:bg-black/80"
        >
          목록 보기 →
        </Link>
      </div>
    </main>
  );
}
