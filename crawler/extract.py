#!/usr/bin/env python3
"""
지자체 홈페이지에서 공통으로 재사용하는 추출 헬퍼.

crawl.py(광역)와 enrich_basic.py(기초)가 함께 쓴다. 홈페이지는 구조가 제각각이라
모두 best-effort 이며, 못 찾으면 None 을 돌려준다(값을 지어내지 않는다).
"""

from __future__ import annotations

import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}
TIMEOUT = 15

# 슬로건/비전이 담긴 영역을 가리키는 키워드
SLOGAN_KEYWORDS = ["슬로건", "시정구호", "군정구호", "구정구호", "도정구호",
                   "시정방침", "도정방침", "비전", "캐치프레이즈"]
# CI(심볼마크·로고) 이미지로 볼 만한 힌트 (src/alt/class/id 에서 탐색)
CI_HINTS = ["logo", "ci", "symbol", "심볼", "로고", "brand", "bi", "emblem"]
# CI 로 오인하기 쉬운 것(배너·배경·아이콘 등) 배제
CI_NEGATIVE = ["banner", "bg", "background", "icon", "sns", "footer", "btn", "button"]


def fetch(url: str) -> BeautifulSoup | None:
    """URL 을 받아 BeautifulSoup 로 파싱. 실패하면 None."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        if resp.encoding is None or resp.encoding.lower() == "iso-8859-1":
            resp.encoding = resp.apparent_encoding
        return BeautifulSoup(resp.text, "lxml")
    except Exception as exc:  # noqa: BLE001 - 네트워크 실패는 항목 스킵
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
    parts = re.split(r"\s*[|\-–]\s*", text)
    parts = [p for p in parts if p and not p.endswith(("시", "도", "군", "구"))][:1] or [text]
    head = parts[0].strip()
    return head if 4 <= len(head) <= 80 else text


def meta_content(soup: BeautifulSoup, *names: str) -> str | None:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find(
            "meta", attrs={"name": name}
        )
        if tag and tag.get("content"):
            return clean(tag["content"])
    return None


def extract_meta(soup: BeautifulSoup) -> dict:
    """메타태그(og/description)에서 슬로건·비전 후보를 뽑는다."""
    title_tag = soup.find("title")
    return {
        "og_title": meta_content(soup, "og:title"),
        "description": meta_content(soup, "og:description", "description"),
        "title": clean(title_tag.get_text()) if title_tag else None,
        "og_image": meta_content(soup, "og:image"),
    }


def find_slogan_by_keyword(soup: BeautifulSoup) -> str | None:
    """페이지 본문에서 슬로건 키워드 근처 텍스트를 탐색한다."""
    for kw in SLOGAN_KEYWORDS:
        node = soup.find(string=re.compile(kw))
        if not node:
            continue
        parent = node.parent
        candidate = clean(parent.get_text(" ")) if parent else None
        if candidate and 4 <= len(candidate) <= 80:
            return candidate
    return None


# 슬로건이 아니라 사이트 크롬(메뉴·타이틀·기관명)임을 드러내는 토큰.
# 하나라도 포함되면 슬로건 후보에서 버린다(잘못된 슬로건 방지).
SLOGAN_NOISE = [
    "홈페이지", "대표", "포털", "스마트포털", "심벌", "캐릭터", "브랜드", "로고",
    "인사말", "바로가기", "메뉴", "청 ", "시청", "구청", "군청", "도청",
    "광역시", "특별시", "특별자치", "인사/", "/대표", "::", "[", "]", "#", ">",
    # 공지·메뉴·안내문 제목이 og:title 로 노출되는 경우를 걸러낸다
    "공모", "안내", "웹진", "방송", "중장기", "재정비", "시책", "방침", "및",
    "명단", "참가", "출범", "설정", "계획", "확정", "선정", "알림", "공고", "업무",
]


def is_slogan_noise(text: str) -> bool:
    """사이트명·메뉴·기관명 등 슬로건이 아닌 텍스트면 True."""
    if any(tok in text for tok in SLOGAN_NOISE):
        return True
    # 메뉴 나열(슬래시/가운뎃점으로 이은 짧은 단어들)
    if ("/" in text or "·" in text) and len(text) <= 30:
        return True
    return False


def is_institution_name(text: str | None) -> bool:
    """'종로구청', '수원시청', '경상남도' 처럼 슬로건이 아닌 기관·지명이면 True.

    og:title 이 슬로건 없이 사이트명만 담은 경우를 걸러낸다(잘못된 슬로건 방지).
    """
    if not text:
        return True
    t = re.sub(r"\s+", "", text)
    # 지명 + 선택적 (특별시|광역시|…) + 선택적 '청' 으로만 이루어졌으면 기관명
    return bool(re.fullmatch(
        r".{1,6}?(특별자치시|특별자치도|특별시|광역시|자치시|자치도|시|도|군|구)?청?", t
    )) and len(t) <= 8


def extract_slogan(soup: BeautifulSoup, reject_names: set[str] | None = None) -> str | None:
    """슬로건 후보: og:title 이 가장 깨끗한 경우가 많고, 없으면 키워드 영역.

    기관명(구청/시청/군청·지명)만 담긴 값은 슬로건이 아니므로 버린다. reject_names
    에 넘긴 문자열(기관명 변형)과 일치하는 후보도 배제한다.
    """
    reject = {re.sub(r"\s+", "", n) for n in (reject_names or set())}

    def ok(cand: str | None) -> str | None:
        cand = clean_slogan(cand)
        if not cand:
            return None
        squeezed = re.sub(r"\s+", "", cand)
        if squeezed in reject or is_institution_name(cand) or is_slogan_noise(cand):
            return None
        return cand

    meta = extract_meta(soup)
    # 키워드 근처 본문은 메뉴·안내문 등 노이즈가 많아 og:title 만 슬로건으로 채택한다.
    return ok(meta.get("og_title"))


def _img_attrs_text(img) -> str:
    """<img> 의 src/alt/class/id 를 소문자 한 문자열로 합쳐 힌트 매칭에 사용."""
    cls = " ".join(img.get("class", [])) if isinstance(img.get("class"), list) else (img.get("class") or "")
    return " ".join([
        img.get("src", ""), img.get("alt", ""), cls, img.get("id", ""),
    ]).lower()


def extract_ci(soup: BeautifulSoup, base_url: str) -> str | None:
    """기관 CI/로고 이미지의 절대 URL을 best-effort 로 추출.

    우선순위: 헤더 영역의 로고성 <img> → 문서 전체에서 로고 힌트 <img> → og:image.
    배너·배경·아이콘·푸터로 보이는 것은 배제한다.
    """
    header = soup.find("header") or soup.find(attrs={"id": re.compile("header", re.I)}) \
        or soup.find(attrs={"class": re.compile("header", re.I)})

    def pick_from(scope) -> str | None:
        if scope is None:
            return None
        for img in scope.find_all("img"):
            text = _img_attrs_text(img)
            src = img.get("src") or img.get("data-src")
            if not src:
                continue
            if any(neg in text for neg in CI_NEGATIVE):
                continue
            if any(hint in text for hint in CI_HINTS):
                return urljoin(base_url, src)
        return None

    # 1) 헤더 안의 로고
    ci = pick_from(header)
    if ci:
        return ci
    # 2) 헤더의 첫 링크된 이미지 (통상 홈 로고)
    if header is not None:
        first = header.find("img")
        if first and (first.get("src") or first.get("data-src")):
            text = _img_attrs_text(first)
            if not any(neg in text for neg in CI_NEGATIVE):
                return urljoin(base_url, first.get("src") or first.get("data-src"))
    # 3) 문서 전체 로고 힌트
    ci = pick_from(soup)
    if ci:
        return ci
    # 4) 최후: og:image
    og = meta_content(soup, "og:image")
    return urljoin(base_url, og) if og else None


# 기관장 인사말 페이지로 보이는 링크의 힌트 (href/텍스트)
GREETING_HINTS = ["인사말", "greeting", "인사", "군수실", "시장실", "구청장실",
                  "군수", "시장", "구청장", "도지사", "ceo", "mayor", "governor"]
# 초상 사진 <img> 임을 강하게 시사하는 힌트 (alt/src). 이 중 하나가 있어야 채택.
PORTRAIT_HINTS = ["mayor", "군수", "시장", "구청장", "도지사", "governor",
                  "portrait", "인사말", "greeting"]
# 초상으로 오인하기 쉬운 것 배제(장식·버튼·팝업·샘플 등)
PORTRAIT_NEGATIVE = ["logo", "로고", "ci", "symbol", "심볼", "banner", "icon",
                     "sns", "footer", "btn", "button", "map", "지도", "sign",
                     "서명", "close", "닫기", "tit", "title", "obj", "promise",
                     "공약", "pop", "sample", "guide", "notice", "arrow", "tab",
                     "bg", "blank", "spacer", "bullet", "quote", "ico",
                     "slogan", "슬로건", "temp", "vision", "비전"]


def _find_greeting_links(soup: BeautifulSoup, base_url: str) -> list[str]:
    """홈페이지에서 인사말 페이지 후보 URL들을 힌트로 추린다(상위 몇 개)."""
    found: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href or href.startswith(("#", "javascript", "mailto")):
            continue
        text = (a.get_text(" ") or "").strip().lower()
        h = href.lower()
        if any(hint in text or hint in h for hint in GREETING_HINTS):
            url = urljoin(base_url, href)
            if url not in found:
                found.append(url)
    return found[:6]


def _looks_like_photo(url: str) -> bool:
    """URL을 받아 실제 사진(image, svg 아님, 최소 크기)인지 확인. 오탐 방지용."""
    if url.lower().split("?")[0].endswith((".svg", ".gif")):
        return False
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        ctype = resp.headers.get("content-type", "").lower()
        if not ctype.startswith("image/") or "svg" in ctype:
            return False
        return len(resp.content) >= 15_000  # 아이콘·장식(수 KB) 배제
    except Exception:  # noqa: BLE001
        return False


def _pick_portrait(soup: BeautifulSoup, base_url: str) -> str | None:
    """인사말 페이지에서 초상 사진 <img> 절대 URL을 고른다.

    강한 초상 힌트(mayor/군수/시장/구청장…)가 있고 장식·버튼·팝업이 아니며,
    실제 이미지(svg 아님·최소 15KB)인 것만 채택한다. 못 찾으면 None(오탐보다 공백)."""
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        text = _img_attrs_text(img)
        if any(neg in text for neg in PORTRAIT_NEGATIVE):
            continue
        if any(hint in text for hint in PORTRAIT_HINTS):
            url = urljoin(base_url, src)
            if _looks_like_photo(url):
                return url
    return None


def extract_head_photo(homepage: str) -> tuple[str | None, str | None]:
    """기관 홈페이지에서 기관장 인사말 페이지를 찾아 초상 사진 URL을 추출.

    (photo_url, source_page) 를 돌려주고, 못 찾으면 (None, None). 페이지 구조가
    제각각이라 best-effort 이며 오탐 가능. 값이 없으면 지어내지 않는다.
    """
    home = fetch(homepage)
    if home is None:
        return None, None
    for link in _find_greeting_links(home, homepage):
        page = fetch(link)
        if page is None:
            continue
        photo = _pick_portrait(page, link)
        if photo:
            return photo, link
    return None, None
