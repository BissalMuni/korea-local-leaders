#!/usr/bin/env python3
"""
전국 광역자치단체 단체장 비전·슬로건 크롤러.

흐름:
  1. crawler/regions.json 의 17개 시·도 시드를 읽는다.
  2. 각 시·도 공식 홈페이지를 받아 슬로건/비전 후보 텍스트를 추출한다.
     (홈페이지마다 구조가 달라 메타태그·키워드 기반의 best-effort 추출)
  3. data/overrides.json 의 수동 보정 값을 최우선으로 병합한다.
  4. 결과를 data/governors.json 에 저장한다. (Next.js 앱이 이 파일을 소비)

홈페이지 개편으로 추출이 깨질 수 있으므로, 실패한 항목은 필드를 null로 두고
overrides.json 에 직접 입력해 보정한다. 기존 값은 함부로 덮어쓰지 않는다.

사용법:
  python crawler/crawl.py            # 전체 수집
  python crawler/crawl.py 11 41      # 특정 code만 수집
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# Windows 콘솔(cp949)에서도 한글/기호 출력이 깨지거나 멈추지 않도록 UTF-8로 강제
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
REGIONS_FILE = ROOT / "crawler" / "regions.json"
OVERRIDES_FILE = ROOT / "data" / "overrides.json"
OUTPUT_FILE = ROOT / "data" / "governors.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}
TIMEOUT = 15

WIKI_API = "https://ko.wikipedia.org/w/api.php"
# 정보상자에서 단체장 이름이 들어있는 파라미터 후보
WIKI_HEAD_KEYS = ["단체장", "시장", "도지사", "지사"]
WIKI_DELAY = 1.0  # 위키 API 호출 간 최소 간격(초) — 429 방지

# 슬로건/비전이 담긴 영역을 가리키는 키워드
SLOGAN_KEYWORDS = ["슬로건", "시정구호", "도정구호", "시정방침", "도정방침", "비전", "캐치프레이즈"]


# 단체장 정보 필드 (시드 외에 채워지는 값들)
GOVERNOR_FIELDS = [
    "personName", "party", "termStart", "termEnd",
    "slogan", "vision", "photoUrl", "source", "lastCrawledAt",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def fetch(url: str) -> BeautifulSoup | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        # 인코딩 자동 보정
        if resp.encoding is None or resp.encoding.lower() == "iso-8859-1":
            resp.encoding = resp.apparent_encoding
        return BeautifulSoup(resp.text, "lxml")
    except Exception as exc:  # noqa: BLE001 - 네트워크 실패는 항목 스킵으로 처리
        print(f"    ! 요청 실패: {url} ({exc})")
        return None


def clean(text: str | None) -> str | None:
    if not text:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def clean_slogan(text: str | None) -> str | None:
    """슬로건에서 사이트명 꼬리(' | 서울특별시', ' - 경기도' 등)를 제거."""
    text = clean(text)
    if not text:
        return None
    # 구분자 기준으로 가장 의미있는 앞부분만 사용
    parts = re.split(r"\s*[|\-–]\s*", text)
    parts = [p for p in parts if p and not p.endswith(("시", "도", "군", "구"))][:1] or [text]
    head = parts[0].strip()
    return head if 4 <= len(head) <= 80 else text


def extract_meta(soup: BeautifulSoup) -> dict:
    """메타태그(og/description)에서 슬로건 후보를 뽑는다."""
    out: dict[str, str | None] = {}

    def meta(*names: str) -> str | None:
        for name in names:
            tag = soup.find("meta", attrs={"property": name}) or soup.find(
                "meta", attrs={"name": name}
            )
            if tag and tag.get("content"):
                return clean(tag["content"])
        return None

    out["og_title"] = meta("og:title")
    out["description"] = meta("og:description", "description")
    title_tag = soup.find("title")
    out["title"] = clean(title_tag.get_text()) if title_tag else None
    return out


def find_slogan_by_keyword(soup: BeautifulSoup) -> str | None:
    """페이지 본문에서 슬로건 키워드 근처 텍스트를 탐색한다."""
    for kw in SLOGAN_KEYWORDS:
        node = soup.find(string=re.compile(kw))
        if not node:
            continue
        # 키워드가 포함된 요소 자체 또는 인접 텍스트
        parent = node.parent
        candidate = clean(parent.get_text(" ")) if parent else None
        if candidate and 4 <= len(candidate) <= 80:
            return candidate
    return None


def wiki_links(value: str) -> list[str]:
    """위키텍스트에서 [[문서|표시]] 형태의 링크 대상만 추출."""
    return [m.group(1).strip() for m in re.finditer(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", value)]


def strip_disambig(name: str | None) -> str | None:
    """위키 문서명 동음이의 꼬리표 제거: '박형준 (1960년)' -> '박형준'."""
    if not name:
        return None
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip() or None


def fetch_wiki_infobox(title: str, retries: int = 2) -> dict[str, str]:
    """위키백과 문서의 정보상자 파라미터를 {이름: 값} 딕셔너리로 반환.

    429(Too Many Requests) 발생 시 점증 대기 후 재시도한다.
    """
    params = {
        "action": "query", "prop": "revisions", "rvprop": "content",
        "rvslots": "main", "format": "json", "titles": title,
    }
    for attempt in range(retries + 1):
        time.sleep(WIKI_DELAY)
        try:
            resp = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 429:
                wait = WIKI_DELAY * (attempt + 2)
                print(f"    . 위키 429 — {wait:.0f}s 대기 후 재시도 ({title})")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            pages = resp.json()["query"]["pages"]
            text = list(pages.values())[0]["revisions"][0]["slots"]["main"]["*"]
            break
        except Exception as exc:  # noqa: BLE001
            if attempt == retries:
                print(f"    ! 위키 요청 실패: {title} ({exc})")
                return {}
    else:
        print(f"    ! 위키 요청 실패(429 반복): {title}")
        return {}

    params: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"^\s*\|\s*([^=|]+?)\s*=\s*(.*)$", line)
        if m:
            params[m.group(1).strip()] = m.group(2).strip()
    return params


def extract_head_from_wiki(region: dict) -> dict:
    """위키백과에서 단체장 이름·정당을 추출. (이름/정당의 신뢰 가능한 단일 소스)"""
    out = {"personName": None, "party": None, "wikiSource": None}
    params = fetch_wiki_infobox(region["name"])
    if not params:
        return out

    for key in WIKI_HEAD_KEYS:
        if key not in params:
            continue
        value = params[key]
        links = wiki_links(value)
        if not links:
            # 링크 없이 평문 이름인 경우
            plain = clean(re.sub(r"<ref.*?</ref>|<ref[^>]*/>", "", value, flags=re.S))
            if plain and 2 <= len(plain) <= 4:
                out["personName"] = plain
        else:
            out["personName"] = strip_disambig(links[0])
            # 같은 줄에 정당 링크가 함께 있으면 두 번째 링크가 정당
            if len(links) >= 2:
                out["party"] = links[1]
        # 별도 '<직함> 정당' 파라미터 우선
        party_param = params.get(f"{key} 정당")
        if party_param:
            plinks = wiki_links(party_param)
            out["party"] = plinks[0] if plinks else clean(party_param)
        if out["personName"]:
            out["wikiSource"] = f"https://ko.wikipedia.org/wiki/{region['name']}"
            break
    return out


def crawl_region(region: dict) -> dict:
    """한 시·도의 홈페이지에서 단체장 정보를 best-effort 수집."""
    result = {f: None for f in GOVERNOR_FIELDS}
    homepage = region["homepage"]
    paths = region.get("paths") or ["/"]

    # 1) 위키백과에서 이름·정당 (신뢰 가능한 단일 소스)
    head = extract_head_from_wiki(region)
    result["personName"] = head["personName"]
    result["party"] = head["party"]

    # 2) 홈페이지에서 슬로건·비전 (best-effort)
    for path in paths:
        url = urljoin(homepage, path)
        soup = fetch(url)
        if soup is None:
            continue

        meta = extract_meta(soup)
        # 슬로건은 og:title 가 가장 깨끗한 경우가 많고, 없으면 키워드 영역으로 폴백
        slogan = clean_slogan(meta.get("og_title")) or clean_slogan(find_slogan_by_keyword(soup))
        vision = meta.get("description")

        if slogan and not result["slogan"]:
            result["slogan"] = slogan
        if vision and not result["vision"]:
            result["vision"] = vision

        # 이름/정당/임기는 시·도 홈페이지에서 신뢰성 있게 추출되지 않으므로
        # 크롤러가 채우지 않는다(틀린 값 방지). overrides.json 으로 보정한다.

        if not result["source"]:
            result["source"] = url

        if result["slogan"] and result["vision"]:
            break

    # 출처: 홈페이지 + 위키 링크 병기
    if head.get("wikiSource"):
        result["source"] = "; ".join(
            s for s in (result["source"], head["wikiSource"]) if s
        )

    result["lastCrawledAt"] = now_iso()
    return result


def merge(seed: dict, crawled: dict, override: dict | None) -> dict:
    """시드 + 크롤링 + 수동보정 병합. override가 가장 우선."""
    row = dict(seed)
    row.update(crawled)
    row["manualOverride"] = False
    if override:
        for key, value in override.items():
            if value is not None and value != "":
                row[key] = value
        row["manualOverride"] = True
    return row


def main(argv: list[str]) -> int:
    regions = load_json(REGIONS_FILE)["regions"]
    overrides = load_json(OVERRIDES_FILE).get("overrides", {})

    only = set(argv[1:])  # 특정 code만 지정한 경우
    targets = [r for r in regions if not only or r["code"] in only]

    print(f"수집 대상 {len(targets)}개 시·도")
    rows: list[dict] = []

    # 기존 결과를 유지하며 대상만 갱신 (부분 수집 지원)
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        for r in load_json(OUTPUT_FILE).get("governors", []):
            existing[r["code"]] = r

    for region in regions:
        code = region["code"]
        seed = {k: region[k] for k in (
            "code", "name", "shortName", "type", "title", "homepage", "lat", "lng"
        ) if k in region}

        if region in targets:
            print(f"  - [{code}] {region['name']} 수집 중...")
            crawled = crawl_region(region)
        else:
            # 대상 외: 기존 크롤링 값 보존
            prev = existing.get(code, {})
            crawled = {f: prev.get(f) for f in GOVERNOR_FIELDS}

        row = merge(seed, crawled, overrides.get(code))
        rows.append(row)
        status = row["slogan"] or "(슬로건 미수집 — overrides.json 보정 권장)"
        print(f"      -> {row.get('personName') or '?'} / {status}")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"updatedAt": now_iso(), "governors": rows}
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {OUTPUT_FILE.relative_to(ROOT)} ({len(rows)}개)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
