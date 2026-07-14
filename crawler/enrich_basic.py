#!/usr/bin/env python3
"""
기초자치단체(basic.json) 보강 — 홈페이지에서 슬로건·CI 추출 + 선관위 공약 매칭.

crawl_basic.py 가 위키에서 이름·정당과 (basic_homepages.json 기반) 홈페이지까지
채운 뒤 실행한다. 이 스크립트는:
  1. 각 기초의 공식 홈페이지를 받아 슬로건·CI(심볼마크)를 best-effort 추출한다.
  2. NEC_SERVICE_KEY 가 있으면 선관위 후보자 공약 API(구·시·군의장)로 주요공약을
     지역명(선거구=시군구명) 기준으로 매칭해 채운다. 없으면 pledges 는 null 유지.

홈페이지 구조가 제각각이라 추출은 best-effort 이며, 실패한 값은 기존 값 보존 또는
null 로 둔다(지어내지 않는다). 부정확한 값은 overrides 로 보정한다.

사용:
  python crawler/enrich_basic.py           # 전체 227곳 보강
  python crawler/enrich_basic.py 4101 4102 # 특정 code만
  python crawler/enrich_basic.py --no-ci   # 홈페이지 추출 생략(공약만)
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import nec
from extract import extract_ci, extract_slogan, fetch

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
BASIC_FILE = ROOT / "data" / "basic.json"
FETCH_DELAY = 0.4  # 홈페이지 연속 요청 간 최소 간격(초)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main(argv: list[str]) -> int:
    args = argv[1:]
    do_ci = "--no-ci" not in args
    only = {a for a in args if not a.startswith("--")}

    data = json.loads(BASIC_FILE.read_text(encoding="utf-8"))
    rows: list[dict] = data["governors"]

    # 선관위 공약(기초단체장=sgType 4). 지역키는 선거구명(=시군구명) 공백제거.
    nec_key = os.environ.get("NEC_SERVICE_KEY")
    pledges_map: dict[str, list[str]] = {}
    if nec_key:
        print("선관위 기초단체장 공약 API 조회 중...")
        pledges_map = nec.fetch_pledges(nec_key, nec.SG_TYPE_BASIC_HEAD)
    else:
        print("(NEC_SERVICE_KEY 미설정 — 공약은 null 유지)")

    targets = [g for g in rows if not only or g["code"] in only]
    print(f"보강 대상 {len(targets)}곳 (홈페이지 추출: {'예' if do_ci else '아니오'})")

    ci_hit = slogan_hit = pledge_hit = 0
    for g in targets:
        code, name, hp = g["code"], g["name"], g.get("homepage")

        # 1) 공약: 지역명(시군구명) 매칭 (비전 추출로 이미 채워졌으면 보존)
        p = pledges_map.get(name.replace(" ", ""))
        if p and not g.get("pledges"):
            g["pledges"] = p
            pledge_hit += 1

        # 2) 홈페이지에서 슬로건·CI
        if do_ci and hp:
            soup = fetch(hp)
            if soup is not None:
                slogan = extract_slogan(soup, reject_names={name, name + "청"})
                ci = extract_ci(soup, hp)
                if slogan and not g.get("slogan"):
                    g["slogan"] = slogan
                    slogan_hit += 1
                if ci and not g.get("ci"):
                    g["ci"] = ci
                    ci_hit += 1
                if not g.get("source"):
                    g["source"] = hp
            time.sleep(FETCH_DELAY)

        g["lastCrawledAt"] = now_iso()
        mark = []
        if g.get("slogan"):
            mark.append("슬로건")
        if g.get("ci"):
            mark.append("CI")
        if g.get("pledges"):
            mark.append(f"공약{len(g['pledges'])}")
        print(f"  [{code}] {name}: {', '.join(mark) or '(보강 없음)'}")

    data["updatedAt"] = now_iso()
    BASIC_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"\n저장: {BASIC_FILE.relative_to(ROOT)} — "
        f"슬로건 +{slogan_hit}, CI +{ci_hit}, 공약 +{pledge_hit}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
