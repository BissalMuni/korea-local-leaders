"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeckGL, GeoJsonLayer, IconLayer } from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Governor } from "@/lib/types";
import { partyColorRGB, partyColorCss, partyFlagDataUri } from "@/lib/parties";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const INITIAL_VIEW_STATE = {
  longitude: 127.8,
  latitude: 36.2,
  zoom: 6.1,
  pitch: 50,
  bearing: -12,
  maxZoom: 12,
  minZoom: 4.5,
};

const BLOCK_HEIGHT = 22000; // 행정구역 돌출 높이(m)
const MARKER_Z = 26000; // 마커가 블록 위에 뜨도록

type RegionProps = { code: string; name: string };

/** deck.gl 피킹 객체에서 시·도 코드 추출 (지역 피처/마커 공용) */
function codeOf(object: unknown): string | undefined {
  if (!object || typeof object !== "object") return undefined;
  const o = object as { properties?: RegionProps; code?: string };
  return o.properties?.code ?? o.code;
}

export default function MapView({ governors }: { governors: Governor[] }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const byCode = useMemo(
    () => Object.fromEntries(governors.map((g) => [g.code, g])),
    [governors],
  );

  const goTo = (code?: string) => {
    if (code) router.push(`/region/${code}`);
  };

  const layers = [
    // 1) 행정구역 입체 돌출 — 정당색
    new GeoJsonLayer({
      id: "regions",
      data: "/geo/provinces.geojson",
      extruded: true,
      getElevation: BLOCK_HEIGHT,
      getFillColor: (f: { properties: RegionProps }) => {
        const code = f.properties.code;
        const g = byCode[code];
        const [r, gr, b] = partyColorRGB(g?.party ?? null);
        const dim = hovered && hovered !== code ? 130 : 205;
        return [r, gr, b, dim];
      },
      getLineColor: [255, 255, 255, 50],
      lineWidthMinPixels: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      updateTriggers: { getFillColor: [hovered] },
      onClick: (info) => goTo(codeOf(info.object)),
      onHover: (info) => setHovered(codeOf(info.object) ?? null),
    }),

    // 2) 당선인 사진 빌보드 (블록 위에 부유)
    new IconLayer<Governor>({
      id: "photos",
      data: governors.filter((g) => g.photoUrl),
      getPosition: (g: Governor) => [g.lng ?? 0, g.lat ?? 0, MARKER_Z],
      getIcon: (g: Governor) => ({
        url: g.photoUrl as string,
        width: 128,
        height: 128,
        anchorY: 128,
      }),
      getSize: 52,
      sizeUnits: "pixels",
      billboard: true,
      pickable: true,
      onClick: (info) => goTo(codeOf(info.object)),
    }),

    // 3) 정당 깃발 (사진 우상단)
    new IconLayer<Governor>({
      id: "flags",
      data: governors,
      getPosition: (g: Governor) => [g.lng ?? 0, g.lat ?? 0, MARKER_Z],
      getIcon: (g: Governor) => ({
        url: partyFlagDataUri(g.party),
        width: 64,
        height: 80,
        anchorX: 0,
        anchorY: 80,
      }),
      getSize: 38,
      getPixelOffset: [22, -30],
      sizeUnits: "pixels",
      billboard: true,
      pickable: true,
      onClick: (info) => goTo(codeOf(info.object)),
    }),
  ];

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      getTooltip={({ object }) => {
        const code = codeOf(object);
        if (!code) return null;
        const g = byCode[code];
        if (!g) return null;
        return {
          html: `<div style="font-weight:700">${g.name}</div>
            <div>${g.personName ?? "정보 준비 중"} ${g.title} · ${g.party ?? "정당 미상"}</div>
            ${g.slogan ? `<div style="opacity:.8;margin-top:2px">“${g.slogan}”</div>` : ""}
            <div style="opacity:.6;margin-top:2px;font-size:11px">클릭하면 상세보기</div>`,
          style: {
            background: "rgba(17,24,39,.95)",
            color: "#fff",
            fontSize: "12px",
            padding: "8px 10px",
            borderRadius: "8px",
            maxWidth: "220px",
          },
        };
      }}
      style={{ position: "absolute", width: "100%", height: "100%" }}
    >
      <Map mapStyle={BASEMAP} />
      <Legend governors={governors} />
    </DeckGL>
  );
}

function Legend({ governors }: { governors: Governor[] }) {
  const parties = useMemo(() => {
    const set = new Set<string>();
    governors.forEach((g) => g.party && set.add(g.party));
    return [...set];
  }, [governors]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-xl bg-black/60 p-3 text-xs text-white backdrop-blur">
      <div className="mb-1.5 font-semibold">정당</div>
      <ul className="space-y-1">
        {parties.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: partyColorCss(p) }}
            />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
