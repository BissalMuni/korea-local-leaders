#!/usr/bin/env python3
"""
시·도 경계 GeoJSON 전처리.

원본: southkorea/southkorea-maps (KOSTAT 2018) — 약 7.5MB, KOSTAT 코드 사용.
처리:
  1) 이름 기준으로 우리 행정표준코드(regions.json과 동일)를 properties.code 에 주입
  2) 좌표를 소수 3자리(~110m)로 반올림 + 연속 중복점 제거로 용량 대폭 축소
  3) public/geo/provinces.geojson 으로 저장 (웹에서 fetch)

사용:
  python crawler/prep_geojson.py                # 원본을 자동 다운로드 후 처리
  python crawler/prep_geojson.py ._provinces_raw.json   # 로컬 원본 파일 사용
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SRC_URL = (
    "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/"
    "kostat/2018/json/skorea-provinces-2018-geo.json"
)
OUT_FILE = ROOT / "public" / "geo" / "provinces.geojson"
PRECISION = 3  # 소수점 자리수

# 원본 시·도 명칭 -> 우리 행정표준코드 (regions.json 과 일치)
NAME_TO_CODE = {
    "서울특별시": "11", "부산광역시": "26", "대구광역시": "27", "인천광역시": "28",
    "광주광역시": "29", "대전광역시": "30", "울산광역시": "31", "세종특별자치시": "36",
    "경기도": "41", "강원도": "51", "충청북도": "43", "충청남도": "44",
    "전라북도": "52", "전라남도": "46", "경상북도": "47", "경상남도": "48",
    "제주특별자치도": "50",
}
# 현재 정식 명칭(특별자치도 반영)
CANONICAL_NAME = {
    "강원도": "강원특별자치도",
    "전라북도": "전북특별자치도",
}


def round_ring(ring: list) -> list:
    """좌표 반올림 + 연속 중복점 제거."""
    out: list = []
    for x, y in ring:
        p = [round(x, PRECISION), round(y, PRECISION)]
        if not out or out[-1] != p:
            out.append(p)
    # 폴리곤 링은 첫=끝이어야 함
    if len(out) >= 1 and out[0] != out[-1]:
        out.append(out[0])
    return out


def simplify_geometry(geom: dict) -> dict:
    t = geom["type"]
    coords = geom["coordinates"]
    if t == "Polygon":
        new = [round_ring(r) for r in coords]
        new = [r for r in new if len(r) >= 4]
    elif t == "MultiPolygon":
        new = []
        for poly in coords:
            rings = [round_ring(r) for r in poly]
            rings = [r for r in rings if len(r) >= 4]
            if rings:
                new.append(rings)
    else:
        new = coords
    return {"type": t, "coordinates": new}


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        raw = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    else:
        print(f"원본 다운로드: {SRC_URL}")
        raw = requests.get(SRC_URL, timeout=60).json()

    features = []
    for f in raw["features"]:
        name = f["properties"]["name"]
        code = NAME_TO_CODE.get(name)
        if not code:
            print(f"  ! 코드 매핑 없음, 건너뜀: {name}")
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "code": code,
                "name": CANONICAL_NAME.get(name, name),
            },
            "geometry": simplify_geometry(f["geometry"]),
        })

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    out = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size_kb = OUT_FILE.stat().st_size / 1024
    print(f"저장 완료: {OUT_FILE.relative_to(ROOT)} "
          f"({len(features)}개 시·도, {size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
