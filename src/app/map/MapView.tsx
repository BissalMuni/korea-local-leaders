"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeckGL, GeoJsonLayer, IconLayer, ScatterplotLayer } from "deck.gl";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Governor } from "@/lib/types";
import { partyColorRGB, partyColorCss, partyFlagDataUri } from "@/lib/parties";

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// 평면(2D) 뷰 — 기울기/회전 없음
const INITIAL_VIEW_STATE = {
  longitude: 127.9,
  latitude: 36.3,
  zoom: 6.3,
  pitch: 0,
  bearing: 0,
  maxZoom: 11,
  minZoom: 5,
};

type RegionProps = { code: string; name: string };

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
  const withCoords = useMemo(
    () => governors.filter((g) => g.lat != null && g.lng != null),
    [governors],
  );

  const goTo = (code?: string) => {
    if (code) router.push(`/region/${code}`);
  };

  const layers = [
    // 1) 행정구역 평면 채움 — 정당색
    new GeoJsonLayer({
      id: "regions",
      data: "/geo/provinces.geojson",
      extruded: false,
      stroked: true,
      filled: true,
      getFillColor: (f: { properties: RegionProps }) => {
        const code = f.properties.code;
        const g = byCode[code];
        const [r, gg, b] = partyColorRGB(g?.party ?? null);
        const a = hovered === code ? 210 : hovered ? 90 : 150;
        return [r, gg, b, a];
      },
      getLineColor: [255, 255, 255, 200],
      lineWidthMinPixels: 1.2,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 40],
      updateTriggers: { getFillColor: [hovered] },
      onClick: (info) => goTo(codeOf(info.object)),
      onHover: (info) => setHovered(codeOf(info.object) ?? null),
    }),

    // 2) 사진 뒤 정당색 원형 테두리(링)
    new ScatterplotLayer<Governor>({
      id: "rings",
      data: withCoords,
      getPosition: (g: Governor) => [g.lng as number, g.lat as number],
      getRadius: 28,
      radiusUnits: "pixels",
      getFillColor: (g: Governor) => {
        const [r, gg, b] = partyColorRGB(g.party);
        return [r, gg, b, 255];
      },
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 2,
      pickable: true,
      onClick: (info) => goTo(codeOf(info.object)),
    }),

    // 3) 당선인 사진(원형 링 위에)
    new IconLayer<Governor>({
      id: "photos",
      data: withCoords.filter((g) => g.photoUrl),
      getPosition: (g: Governor) => [g.lng as number, g.lat as number],
      getIcon: (g: Governor) => ({
        url: g.photoUrl as string,
        width: 128,
        height: 128,
        anchorX: 64,
        anchorY: 64,
        mask: false,
      }),
      getSize: 36,
      sizeUnits: "pixels",
      billboard: false,
      pickable: true,
      onClick: (info) => goTo(codeOf(info.object)),
    }),

    // 4) 정당 깃발 (사진 위쪽에 작게)
    new IconLayer<Governor>({
      id: "flags",
      data: withCoords,
      getPosition: (g: Governor) => [g.lng as number, g.lat as number],
      getIcon: (g: Governor) => ({
        url: partyFlagDataUri(g.party),
        width: 64,
        height: 80,
        anchorX: 8,
        anchorY: 80,
      }),
      getSize: 30,
      getPixelOffset: [0, -26],
      sizeUnits: "pixels",
      billboard: false,
      pickable: true,
      onClick: (info) => goTo(codeOf(info.object)),
    }),
  ];

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={{ dragRotate: false, touchRotate: false }}
      layers={layers}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
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
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-xl bg-white/85 p-3 text-xs text-gray-800 shadow-md backdrop-blur dark:bg-black/70 dark:text-white">
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
