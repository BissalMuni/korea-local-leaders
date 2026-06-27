"use client";

import dynamic from "next/dynamic";
import type { Governor } from "@/lib/types";

// deck.gl / maplibre 는 브라우저 전용이라 SSR 비활성화
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
      지도를 불러오는 중…
    </div>
  ),
});

export default function MapClient({ governors }: { governors: Governor[] }) {
  return <MapView governors={governors} />;
}
