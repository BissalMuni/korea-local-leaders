#!/usr/bin/env python3
"""각 자치구 캡처(home.json)의 메뉴에서 'CI·슬로건/상징물' 전용 페이지 링크를 찾는다.

CI(심볼마크)는 대문이 아니라 '구소개 > 상징물/CI' 전용 다운로드 페이지에 있으므로,
그 페이지 URL 을 골라 code->url 로 crawler/capture/_ci_targets.json 에 저장한다.
capture_ci.mjs 가 이를 읽어 페이지를 캡처한다.

사용: python crawler/capture/find_ci_pages.py
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
CAPTURES = ROOT / "crawler" / "captures"

# 링크 텍스트/‌href 로 CI·상징 페이지를 판별. 점수가 높은 것을 채택.
STRONG_TEXT = ["ci·슬로건", "ci 소개", "ci소개", "상징물", "심볼마크", "ci/bi", "ci·bi", "상징 및 슬로건"]
MED_TEXT = ["상징", "심볼", "엠블", "ci", "bi", "브랜드", "슬로건", "캐릭터"]
HREF_HINT = ["identity", "symbol", "emblem", "sangjing", "/ci", "/bi", "mark", "brand", "slogan"]
# 오탐 배제(문화상징·상징탑 등 엉뚱한 콘텐츠, 시설/행사)
NEG = ["문화", "축제", "탑", "새", "나무", "꽃", "관광", "거리", "음식", "특산"]


def score(text: str, href: str) -> int:
    t = (text or "").strip().lower()
    h = (href or "").lower()
    s = 0
    if any(k in t for k in STRONG_TEXT):
        s += 10
    if any(k in t for k in MED_TEXT):
        s += 4
    if any(k in h for k in HREF_HINT):
        s += 4
    if any(k in t for k in NEG):
        s -= 6
    # 너무 긴 텍스트(기사 등)는 메뉴 아님
    if len(t) > 16:
        s -= 4
    return s


def main() -> int:
    targets: dict[str, str] = {}
    misses: list[str] = []
    codes = sorted(d for d in os.listdir(CAPTURES) if (CAPTURES / d).is_dir() and d.isdigit())
    for code in codes:
        p = CAPTURES / code / "home.json"
        if not p.exists():
            continue
        try:
            snap = json.loads(p.read_text(encoding="utf-8")).get("snapshot", {})
        except (json.JSONDecodeError, OSError):
            continue
        best, best_s = None, 0
        # 메뉴(nav)뿐 아니라 hinted.ci(전체 앵커에서 CI 키워드로 뽑은 링크)도 후보로.
        cands = list(snap.get("menu", [])) + list(snap.get("hinted", {}).get("ci", []))
        for a in cands:
            href = a.get("href", "") or ""
            # 잘못된/빈 링크 배제(javascript, #, /null, http 아님)
            if not href.startswith("http") or "javascript" in href or href.rstrip("/").endswith("null") or href.endswith("#"):
                continue
            sc = score(a.get("text", ""), href)
            if sc > best_s:
                best_s, best = sc, href
        if best and best_s >= 8:
            targets[code] = best
        else:
            misses.append(code)

    out = ROOT / "crawler" / "capture" / "_ci_targets.json"
    out.write_text(json.dumps(targets, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"CI 페이지 링크 발견: {len(targets)}곳 / 전체 {len(codes)}곳")
    print(f"메뉴에서 못 찾음: {len(misses)}곳 -> {misses}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
