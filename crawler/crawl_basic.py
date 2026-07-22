#!/usr/bin/env python3
"""
기초자치단체장(시장·군수·구청장) 데이터 수집.

소스: 위키백과 "제9회 전국동시지방선거 기초자치단체장" (2026 당선자, 단일 페이지)
산출물: data/basic.json (앱 목록이 소비)

배경(2026 개편): 전남·광주가 "전남광주통합특별시"로 통합되어 한 섹션에 묶여 있고,
인천에 자치구(제물포구·영종구·검단구 등)가 신설됨. 공개 시군구 경계 GeoJSON은
2018년판뿐이라 2026 경계를 못 그리므로, 기초는 '목록 데이터'만 수집한다(지도는 광역 유지).

광역 판별: 각 행의 직책 링크 대상 접두어("광주 동구청장" → 광주)를 우선 사용하고,
없으면 섹션 헤더로 폴백한다. 통합시 섹션 기본값은 전남(46), "광주 " 접두어는 29.

표 구조(행마다 셀 한 줄): [0]직책 [1]정당색(빈칸) [2]정당 [3]당선인 [4]득표수 ...

사용:
  python crawler/crawl_basic.py
"""

from __future__ import annotations

import re
import sys
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
OUT_DATA = ROOT / "data" / "basic.json"
HOMEPAGES_FILE = ROOT / "crawler" / "basic_homepages.json"
PHOTOS_FILE = ROOT / "crawler" / "basic_photos.json"
VISION_FILE = ROOT / "crawler" / "basic_vision.json"
AI_POLICY_FILE = ROOT / "crawler" / "basic_ai_policy.json"
WIKI_API = "https://ko.wikipedia.org/w/api.php"
WIKI_PAGE = "제9회 전국동시지방선거 기초자치단체장"
HEADERS = {"User-Agent": "korea-local-leaders/0.1 (data prep)"}
TERM_START, TERM_END = "2026-07-01", "2030-06-30"

# 우리 광역 코드 -> 정식 명칭 (코드 생성/그룹핑용. 29·46은 내부적으로 유지해
# 기존 기초 코드 29xx/46xx 를 보존하되, 출력 소속은 UNIFY 로 통합시로 합친다)
CODE_TO_PROV = {
    "11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시",
    "29": "광주광역시", "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시",
    "41": "경기도", "51": "강원특별자치도", "43": "충청북도", "44": "충청남도",
    "52": "전북특별자치도", "46": "전라남도", "47": "경상북도", "48": "경상남도",
    "50": "제주특별자치도",
}
# 2026-07-01 전남광주통합특별시 출범: 옛 광주(29)·전남(46) 소속 기초를 통합시(29)로.
# 코드 접두어(29xx/46xx)는 보존하고 provinceCode/Name만 통합값으로 emit.
UNIFY = {
    "29": ("29", "전남광주통합특별시"),
    "46": ("29", "전남광주통합특별시"),
}
# 섹션 헤더 명칭 -> 광역 코드 (통합시 기본값은 전남 46)
SECTION_TO_CODE = {
    "서울특별시": "11", "부산광역시": "26", "대구광역시": "27", "인천광역시": "28",
    "광주광역시": "29", "대전광역시": "30", "울산광역시": "31",
    "경기도": "41", "강원특별자치도": "51", "강원도": "51",
    "충청북도": "43", "충청남도": "44", "전북특별자치도": "52", "전라북도": "52",
    "전라남도": "46", "경상북도": "47", "경상남도": "48", "제주특별자치도": "50",
    # 2026 통합시: 구청장→광주(29), 시장/군수→전남(46) 으로 flush에서 분기
    "전남광주통합특별시": "MERGE",
}
# 직책 링크 대상 접두어(짧은 광역명) -> 코드
SHORT_PROV_TO_CODE = {
    "서울": "11", "부산": "26", "대구": "27", "인천": "28", "광주": "29",
    "대전": "30", "울산": "31", "세종": "36", "경기": "41", "강원": "51",
    "충북": "43", "충남": "44", "전북": "52", "전남": "46", "경북": "47",
    "경남": "48", "제주": "50",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_office(cell: str) -> tuple[str | None, str | None]:
    """직책 셀 -> (표시명, 링크대상). 예: '! [[광주 동구청장|동구청장]]' -> ('동구청장','광주 동구청장')."""
    s = cell.strip().lstrip("!|").strip()
    m = re.search(r"\[\[([^\]]+)\]\]", s)
    if m:
        inner = m.group(1)
        return inner.split("|")[-1].strip(), inner.split("|")[0].strip()
    return (s or None), (s or None)


def cell_text(cell: str) -> str | None:
    """일반 셀(정당·당선인) 표시 텍스트. 링크 없으면 평문(템플릿·태그 제거)."""
    s = cell.strip().lstrip("!|").strip()
    m = re.search(r"\[\[([^\]]+)\]\]", s)
    if m:
        return m.group(1).split("|")[-1].strip() or None
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"'{2,}", "", s)
    return s.split("|")[-1].strip() or None


def office_to_municipality(office: str) -> tuple[str, str] | None:
    """직책 표시명 -> (시군구명, 직함). 예: 종로구청장 -> (종로구, 구청장)."""
    if office.endswith("구청장"):
        return office[:-2], "구청장"
    if office.endswith("군수"):
        return office[:-1], "군수"
    if office.endswith("시장"):
        return office[:-1], "시장"
    return None


def fetch_records() -> list[dict]:
    r = requests.get(WIKI_API, params={
        "action": "query", "prop": "revisions", "rvprop": "content",
        "rvslots": "main", "titles": WIKI_PAGE, "format": "json",
    }, headers=HEADERS, timeout=30)
    r.raise_for_status()
    txt = list(r.json()["query"]["pages"].values())[0]["revisions"][0]["slots"]["main"]["*"]

    records: list[dict] = []
    section_code: str | None = None
    in_table = False
    row: list[str] = []

    def flush():
        if not row:
            return
        cells = [l for l in row if l.strip().startswith(("!", "|"))]
        if len(cells) < 4:
            return
        disp, target = parse_office(cells[0])
        if not disp:
            return
        muni = office_to_municipality(disp)
        if not muni:
            return
        name = cell_text(cells[3])
        if not name:
            return
        party = cell_text(cells[2])
        # 광역 판별: 통합시 분기 → 직책 접두어 → 섹션 폴백
        prov = section_code
        if section_code == "MERGE":
            # 전남에는 자치구가 없으므로 구청장은 광주, 시·군은 전남
            prov = "29" if muni[1] == "구청장" else "46"
        prefix = (target or "").split(" ")[0]
        if prefix in SHORT_PROV_TO_CODE:
            prov = SHORT_PROV_TO_CODE[prefix]
        if not prov or prov == "MERGE":
            return
        records.append({
            "provCode": prov, "municipality": muni[0], "title": muni[1],
            "name": name, "party": party,
        })

    for line in txt.splitlines():
        h = re.match(r"^=+\s*(.+?)\s*=+$", line.strip())
        if h:
            c = SECTION_TO_CODE.get(h.group(1))
            if c:
                section_code = c
            continue
        s = line.strip()
        if s.startswith("{|"):
            in_table, row = True, []
        elif s.startswith("|}"):
            flush()
            in_table, row = False, []
        elif in_table and s.startswith("|-"):
            flush()
            row = []
        elif in_table:
            row.append(line)
    return records


def load_homepages() -> dict[str, str]:
    """crawler/basic_homepages.json 의 code -> homepage 매핑을 읽는다(없으면 빈 dict)."""
    if not HOMEPAGES_FILE.exists():
        print("  (basic_homepages.json 없음 — homepage 는 빈 값으로 둠)")
        return {}
    data = json.loads(HOMEPAGES_FILE.read_text(encoding="utf-8"))
    return {
        code: h.get("homepage", "")
        for code, h in data.get("homepages", {}).items()
        if h.get("homepage")
    }


def load_photos() -> dict[str, str]:
    """crawler/basic_photos.json 의 code -> 기관장 사진 URL(육안검증 완료) 매핑."""
    if not PHOTOS_FILE.exists():
        return {}
    data = json.loads(PHOTOS_FILE.read_text(encoding="utf-8"))
    return {
        code: p.get("photoUrl", "")
        for code, p in data.get("photos", {}).items()
        if p.get("photoUrl")
    }


def load_vision() -> dict[str, dict]:
    """crawler/basic_vision.json 의 code -> {slogan,ci,photoUrl,pledges} (육안검증 완료).

    캡처+비전 추출로 얻은 값. verified=true 인 항목만 채택한다(오탐 방지).
    """
    if not VISION_FILE.exists():
        return {}
    data = json.loads(VISION_FILE.read_text(encoding="utf-8"))
    return {
        code: v
        for code, v in data.get("results", {}).items()
        if v.get("verified")
    }


def load_ai_policy() -> dict[str, dict]:
    """crawler/basic_ai_policy.json 의 code -> AiPolicy (수동 큐레이션) 매핑.

    확인된 값만 큐레이션되어 있으며, 미수집 지자체는 키가 없어 aiPolicy 는 null 로 둔다.
    """
    if not AI_POLICY_FILE.exists():
        return {}
    data = json.loads(AI_POLICY_FILE.read_text(encoding="utf-8"))
    return {code: p for code, p in data.get("policies", {}).items() if p}


def main() -> int:
    print("위키 9회 기초단체장 파싱 중...")
    records = fetch_records()
    print(f"  당선자 {len(records)}명 파싱")
    homepages = load_homepages()
    photos = load_photos()
    vision = load_vision()
    ai_policy = load_ai_policy()
    print(f"  홈페이지 매핑 {len(homepages)}곳 · 기관장 사진 {len(photos)}곳 · 비전추출 {len(vision)}곳 · AI정책 {len(ai_policy)}곳 로드")

    # 광역별로 묶어 정렬 후 코드 부여 (광역코드 + 2자리 일련번호)
    rows: list[dict] = []
    seq: dict[str, int] = {}
    for prov in CODE_TO_PROV:  # 광역 코드 순서대로
        group = [r for r in records if r["provCode"] == prov]
        for r in group:
            seq[prov] = seq.get(prov, 0) + 1
            code = f"{prov}{seq[prov]:02d}"
            pcode, pname = UNIFY.get(prov, (prov, CODE_TO_PROV[prov]))
            # 비전 추출값(육안검증)을 우선 채우고, 사진은 vision → basic_photos 순으로.
            v = vision.get(code, {})
            rows.append({
                "code": code, "name": r["municipality"], "shortName": r["municipality"],
                "type": "basic", "title": r["title"],
                "provinceCode": pcode, "provinceName": pname,
                "homepage": homepages.get(code, ""), "personName": r["name"], "party": r["party"],
                "termStart": TERM_START, "termEnd": TERM_END,
                "slogan": v.get("slogan") or None, "vision": None,
                "photoUrl": v.get("photoUrl") or photos.get(code) or None,
                "ci": v.get("ci") or None, "pledges": v.get("pledges") or None,
                "aiPolicy": ai_policy.get(code) or None,
                "source": f"https://ko.wikipedia.org/wiki/{WIKI_PAGE}",
                "lastCrawledAt": now_iso(), "manualOverride": False,
            })

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(
        json.dumps({"updatedAt": now_iso(), "governors": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 광역별 집계 출력
    from collections import Counter
    cnt = Counter(r["provinceName"] for r in rows)
    print(f"\n저장: {OUT_DATA.relative_to(ROOT)} ({len(rows)}개)")
    for prov in CODE_TO_PROV.values():
        if cnt.get(prov):
            print(f"  {prov}: {cnt[prov]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
