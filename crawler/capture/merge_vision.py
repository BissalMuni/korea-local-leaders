#!/usr/bin/env python3
"""캡처별 비전 추출 결과(captures/<code>/vision.json)를 basic_vision.json 으로 병합.

각 서브에이전트가 EXTRACT.md 스키마대로 captures/<code>/vision.json 을 쓰면,
이 스크립트가 이를 모아 crawler/basic_vision.json 의 results 로 합친다.
- confidence 가 'low' 인 필드는 오탐 방지를 위해 null 로 떨어뜨린다(공백이 오답보다 낫다).
- results 의 기존 항목 중 manual=true(사람이 큐레이션)는 덮지 않고 보존한다.

사용: python crawler/capture/merge_vision.py
"""
from __future__ import annotations

import json
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
LIST_FILE = ROOT / "crawler" / "capture" / "_extract_list.json"


def keep(value, conf):
    """confidence 가 충분하면 값을, 아니면 None.

    서브에이전트가 confidence 를 문자열(high/med/low) 또는 숫자(0~1)로 쓰므로 둘 다 허용:
    문자열은 high/med 채택, 숫자는 0.5 이상 채택(=med 이상). low/0.5미만/미상은 버린다.
    """
    if value in (None, "", [], {}):
        return None
    if isinstance(conf, str):
        return value if conf.lower() in ("high", "med", "medium") else None
    if isinstance(conf, (int, float)):
        return value if conf >= 0.5 else None
    # confidence 누락 시엔 값이 있으면 채택(오탐보다 공백 원칙은 conf=low 일 때만 적용)
    return value


def main() -> int:
    doc = json.loads(VISION_FILE.read_text(encoding="utf-8"))
    results = doc.setdefault("results", {})
    names = {r["code"]: r["name"] for r in json.loads(LIST_FILE.read_text(encoding="utf-8"))}

    merged = kept = 0
    for code, name in names.items():
        cur = results.get(code)
        if cur and cur.get("manual"):
            kept += 1
            continue
        vpath = CAPTURES / code / "vision.json"
        if not vpath.exists():
            continue
        try:
            v = json.loads(vpath.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  ! {code} vision.json 읽기 실패: {exc}")
            continue
        conf = v.get("confidence") or {}
        slogan = keep(v.get("slogan"), conf.get("slogan"))
        ci = keep(v.get("ci"), conf.get("ci"))
        pledges = keep(v.get("pledges"), conf.get("pledges"))
        photo = keep(v.get("photoUrl"), conf.get("photo"))
        results[code] = {
            "name": name,
            "slogan": slogan,
            "ci": ci,
            "photoUrl": photo,
            "photoSource": v.get("photoSource") if photo else None,
            "pledges": pledges,
            "pledgeSource": v.get("pledgeSource") if pledges else None,
            "confidence": conf,
            "notes": v.get("notes"),
            "verified": True,
        }
        merged += 1

    VISION_FILE.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    # 집계
    n_slogan = sum(1 for r in results.values() if r.get("slogan"))
    n_ci = sum(1 for r in results.values() if r.get("ci"))
    n_photo = sum(1 for r in results.values() if r.get("photoUrl"))
    n_pledge = sum(1 for r in results.values() if r.get("pledges"))
    print(f"병합 {merged}곳 + manual 보존 {kept}곳 → 총 {len(results)}곳")
    print(f"  슬로건 {n_slogan} · CI {n_ci} · 사진 {n_photo} · 공약 {n_pledge}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
