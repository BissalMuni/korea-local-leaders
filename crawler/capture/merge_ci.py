#!/usr/bin/env python3
"""비전 검증된 CI(captures/<code>/ci_verified.json)를 basic_vision.json 으로 병합.

capture_ci.mjs 가 CI·슬로건 페이지를 떠서 ci.json(CI 후보)을 만들고, 서브에이전트가
ci.jpg 를 눈으로 확인해 ci_verified.json 에 확정 CI URL(+ 슬로건)을 쓰면, 이 스크립트가
basic_vision.json 의 results[code] 에 ci(비어 있을 때) 및 slogan(비어 있을 때)을 채운다.
manual=true 항목은 건드리지 않는다.

ci_verified.json 스키마: {"ci": <url|null>, "ciDownload": <url|null>, "slogan": <str|null>, "confidence": "high|med|low", "notes": <str>}

사용: python crawler/capture/merge_ci.py
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
VISION_FILE = ROOT / "crawler" / "basic_vision.json"


def main() -> int:
    doc = json.loads(VISION_FILE.read_text(encoding="utf-8"))
    results = doc.setdefault("results", {})
    ci_added = slogan_added = 0
    for code in sorted(d for d in os.listdir(CAPTURES) if (CAPTURES / d).is_dir() and d.isdigit()):
        vp = CAPTURES / code / "ci_verified.json"
        if not vp.exists():
            continue
        try:
            v = json.loads(vp.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if (v.get("confidence") or "").lower() not in ("high", "med"):
            continue
        cur = results.get(code)
        if not cur:
            cur = results[code] = {"name": v.get("name"), "verified": True}
        if cur.get("manual"):
            continue
        # CI·슬로건 전용 페이지의 공식 심볼마크가 홈 헤더 로고보다 정확하므로,
        # high 신뢰도면 덮어쓰고, med 이하는 비어 있을 때만 채운다.
        conf = (v.get("confidence") or "").lower()
        if v.get("ci") and (conf == "high" or not cur.get("ci")):
            if not cur.get("ci"):
                ci_added += 1
            cur["ci"] = v["ci"]
            if v.get("ciDownload"):
                cur["ciDownload"] = v["ciDownload"]
        if v.get("slogan") and not cur.get("slogan"):
            cur["slogan"] = v["slogan"]
            slogan_added += 1
        cur.setdefault("ciSource", v.get("url"))

    VISION_FILE.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    total_ci = sum(1 for r in results.values() if r.get("ci"))
    print(f"CI +{ci_added}, 슬로건 +{slogan_added} 병합 → 전체 CI 보유 {total_ci}곳")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
