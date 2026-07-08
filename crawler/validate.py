#!/usr/bin/env python3
"""
수집 결과(data/governors.json, data/basic.json) 무결성 검증기.

크롤러가 조용히 깨졌을 때(홈페이지 개편·위키 표 구조 변경 등) 산출물이
앱이 기대하는 스키마/개수를 벗어나는 것을 배포 전에 잡아낸다. 네트워크를
쓰지 않고 이미 저장된 JSON만 검사하므로 빠르고 결정적이다.

검사 항목:
  - 파일 구조: {updatedAt, governors[]}
  - 필수 키 존재(값이 null이어도 키는 있어야 함) — src/lib/types.ts 의 Governor
  - 절대 null이면 안 되는 핵심 필드: code, name, shortName, type, title
  - code 형식(광역 2자리 / 기초 4자리)·전체 유일성
  - 광역 개수(17)와 표준 코드 일치
  - 기초 provinceCode 가 실재 광역을 가리키는지(참조 무결성)·provinceName 일치

성공 시 종료코드 0, 오류가 하나라도 있으면 1. 비어 있는 슬로건/사진 등은
경고로만 보고하고 실패시키지 않는다(점진 보완 대상).

사용:
  python crawler/validate.py
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

ROOT = Path(__file__).resolve().parent.parent
GOVERNORS_FILE = ROOT / "data" / "governors.json"
BASIC_FILE = ROOT / "data" / "basic.json"

# src/lib/types.ts 의 Governor 와 일치해야 하는 키 (값은 null 허용)
COMMON_KEYS = [
    "code", "name", "shortName", "type", "title", "homepage",
    "personName", "party", "termStart", "termEnd",
    "slogan", "vision", "photoUrl", "ci", "pledges", "source",
    "lastCrawledAt", "manualOverride",
]
BASIC_EXTRA_KEYS = ["provinceCode", "provinceName"]
# 시드에서 오는 값이라 절대 비어선 안 되는 필드
REQUIRED_NON_NULL = ["code", "name", "shortName", "type", "title"]

# 광역 17곳 표준 행정코드 (regions.json 과 동일)
EXPECTED_METRO_CODES = {
    "11", "26", "27", "28", "29", "30", "31", "36",
    "41", "43", "44", "46", "47", "48", "50", "51", "52",
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def load(path: Path, rep: Report) -> list[dict]:
    if not path.exists():
        rep.err(f"{path.name}: 파일이 없습니다")
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        rep.err(f"{path.name}: JSON 파싱 실패 ({exc})")
        return []
    if not isinstance(data, dict) or "governors" not in data:
        rep.err(f"{path.name}: 최상위에 governors 배열이 없습니다")
        return []
    if not data.get("updatedAt"):
        rep.warn(f"{path.name}: updatedAt 가 비어 있습니다")
    rows = data["governors"]
    if not isinstance(rows, list):
        rep.err(f"{path.name}: governors 가 배열이 아닙니다")
        return []
    return rows


def check_keys(rows: list[dict], keys: list[str], label: str, rep: Report) -> None:
    for i, row in enumerate(rows):
        rid = row.get("code") or f"#{i}"
        for k in keys:
            if k not in row:
                rep.err(f"{label}[{rid}]: 필수 키 누락 '{k}'")
        for k in REQUIRED_NON_NULL:
            if k in row and (row[k] is None or row[k] == ""):
                rep.err(f"{label}[{rid}]: '{k}' 는 비어 있을 수 없습니다")


def main() -> int:
    rep = Report()

    metro = load(GOVERNORS_FILE, rep)
    basic = load(BASIC_FILE, rep)

    check_keys(metro, COMMON_KEYS, "governors", rep)
    check_keys(basic, COMMON_KEYS + BASIC_EXTRA_KEYS, "basic", rep)

    # 광역 개수·코드
    if len(metro) != 17:
        rep.err(f"광역 개수가 17이 아닙니다: {len(metro)}")
    metro_codes = {r.get("code") for r in metro}
    missing = EXPECTED_METRO_CODES - metro_codes
    extra = metro_codes - EXPECTED_METRO_CODES
    if missing:
        rep.err(f"누락된 광역 코드: {sorted(missing)}")
    if extra:
        rep.err(f"예상에 없는 광역 코드: {sorted(extra)}")
    for r in metro:
        if r.get("type") != "metropolitan":
            rep.err(f"governors[{r.get('code')}]: type 가 metropolitan 이 아님 ({r.get('type')})")

    # 코드 형식·전체 유일성
    seen: dict[str, int] = {}
    for r in metro + basic:
        code = r.get("code")
        if code:
            seen[code] = seen.get(code, 0) + 1
    dups = sorted(c for c, n in seen.items() if n > 1)
    if dups:
        rep.err(f"중복 code: {dups}")
    for r in metro:
        if r.get("code") and len(str(r["code"])) != 2:
            rep.warn(f"광역 code 형식 이상(2자리 아님): {r['code']}")

    # 기초 참조 무결성
    name_by_code = {r.get("code"): r.get("name") for r in metro}
    for r in basic:
        rid = r.get("code")
        if r.get("type") != "basic":
            rep.err(f"basic[{rid}]: type 가 basic 이 아님 ({r.get('type')})")
        pc = r.get("provinceCode")
        if pc not in metro_codes:
            rep.err(f"basic[{rid}]: provinceCode '{pc}' 가 실재 광역이 아님")
        elif r.get("provinceName") and r["provinceName"] != name_by_code.get(pc):
            rep.err(
                f"basic[{rid}]: provinceName '{r.get('provinceName')}' "
                f"가 코드 {pc}({name_by_code.get(pc)})와 불일치"
            )
        if rid and not (len(str(rid)) == 4 and str(rid).startswith(str(pc))):
            rep.warn(f"basic code '{rid}' 형식 이상(광역코드+2자리 일련번호 기대)")

    # 완성도 경고(실패 아님) — 점진 보완 현황 가시화
    def empties(rows: list[dict], field: str) -> int:
        return sum(1 for r in rows if not r.get(field))

    for field in ("slogan", "vision", "photoUrl", "ci", "pledges"):
        n = empties(metro, field)
        if n:
            rep.warn(f"광역 {field} 미수집 {n}/{len(metro)}곳")
    for field in ("slogan", "vision", "photoUrl", "ci", "pledges", "homepage"):
        n = empties(basic, field)
        if n:
            rep.warn(f"기초 {field} 미수집 {n}/{len(basic)}곳")

    # 출력
    print(f"검증 대상: 광역 {len(metro)}곳 · 기초 {len(basic)}곳")
    for w in rep.warnings:
        print(f"  ⚠ {w}")
    for e in rep.errors:
        print(f"  ✗ {e}")

    if rep.errors:
        print(f"\n실패: 오류 {len(rep.errors)}건 (경고 {len(rep.warnings)}건)")
        return 1
    print(f"\n통과: 오류 0건 (경고 {len(rep.warnings)}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
