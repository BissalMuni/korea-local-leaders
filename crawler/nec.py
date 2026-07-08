"""
중앙선거관리위원회 '당선인 정보' OpenAPI 어댑터.

공공데이터포털: https://www.data.go.kr/data/15000864/openapi.do
엔드포인트: http://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire

현황(2026-06 기준):
  - 이 API의 전국동시지방선거 데이터는 제8회(2022)까지 제공된다.
  - 제9회(2026-06-03) 당선인은 선거 후 검증·이관(~2개월) 뒤 등재되므로,
    그 전까지는 빈 결과가 정상이며 크롤러는 위키백과로 폴백한다.
  - 데이터가 올라오면 NEC_SG_ID 만 맞으면(기본 20260603) 자동으로 공식 당선자로 전환된다.

사용:
  서비스키를 환경변수 NEC_SERVICE_KEY 에 넣으면 crawl.py 가 자동으로 사용한다.
  (data.go.kr 회원가입 → 활용신청 → 일반 인증키(Decoding) 발급 필요)

환경변수:
  NEC_SERVICE_KEY  공공데이터포털 일반 인증키 (필수)
  NEC_SG_ID        선거ID. 기본 20260603 (제9회 지방선거)
  NEC_TERM_START   당선자 임기 시작. 기본 2026-07-01
  NEC_TERM_END     당선자 임기 종료. 기본 2030-06-30
  NEC_PLEDGE_API   후보자 공약 API 엔드포인트 (기본 아래 CANDIDATE_PLEDGE_API).
                   data.go.kr 문서와 필드명이 다르면 이 값으로 교체 가능.
"""

from __future__ import annotations

import os
import re
from xml.etree import ElementTree as ET

import requests

NEC_API = "http://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire"
# 후보자 선거공약(5대공약) 정보. 키·9회 데이터 등재 후에만 값이 채워진다.
# data.go.kr "중앙선거관리위원회_후보자 선거공약정보" 계열. 문서상 필드명이 다르면
# NEC_PLEDGE_API 로 엔드포인트를 교체하고, 아래 PLEDGE_*_KEYS 후보를 조정한다.
CANDIDATE_PLEDGE_API = os.environ.get(
    "NEC_PLEDGE_API",
    "http://apis.data.go.kr/9760000/ElecPrmsInfoInqireService/getCandPrmsInfoInqire",
)
# 선거종류코드: 1 대통령 / 2 국회의원 / 3 시·도지사(광역단체장) / 4 구·시·군의장(기초단체장) ...
SG_TYPE_METRO_HEAD = "3"
SG_TYPE_BASIC_HEAD = "4"

DEFAULT_SG_ID = os.environ.get("NEC_SG_ID", "20260603")   # 제9회 전국동시지방선거
TERM_START = os.environ.get("NEC_TERM_START", "2026-07-01")
TERM_END = os.environ.get("NEC_TERM_END", "2030-06-30")

# 공약 항목의 제목/순서/당선인 식별 필드명 후보 (API 변형 대비)
PLEDGE_TITLE_KEYS = ("prmsTitle", "prmmTitle", "title", "prmsRealmName")
PLEDGE_ORDER_KEYS = ("prmsOrd", "prmsSeq", "seq", "prmsCnt")
PLEDGE_NAME_KEYS = ("name", "huboName", "krName")
PLEDGE_SD_KEYS = ("sdName", "sido")
PLEDGE_WIW_KEYS = ("wiwName", "sggName", "gusigunName", "wiwname")


def _item_to_dict(item: ET.Element) -> dict[str, str]:
    """<item> 하위 태그를 {태그명: 텍스트} 로 평탄화."""
    return {
        child.tag.strip(): (child.text or "").strip()
        for child in item
        if child.text and child.text.strip()
    }


def _pick(d: dict[str, str], *keys: str) -> str | None:
    """후보 태그명 중 먼저 값이 있는 것을 반환 (API 필드명 변형 대비)."""
    for key in keys:
        if d.get(key):
            return d[key]
    return None


def fetch_metro_winners(
    service_key: str | None,
    sg_id: str = DEFAULT_SG_ID,
    timeout: int = 15,
) -> dict[str, dict]:
    """시·도지사 당선인 전체를 {시도명: {personName, party, voteRate}} 로 반환.

    키가 없거나, 해당 선거 데이터가 아직 없거나, 오류면 빈 dict 를 돌려준다
    (크롤러는 이 경우 위키백과로 폴백한다).
    """
    if not service_key:
        return {}

    params = {
        "serviceKey": service_key,
        "pageNo": "1",
        "numOfRows": "100",
        "sgId": sg_id,
        "sgTypecode": SG_TYPE_METRO_HEAD,
    }
    try:
        resp = requests.get(NEC_API, params=params, timeout=timeout)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as exc:  # noqa: BLE001
        print(f"    ! 선관위 API 요청 실패: {exc}")
        return {}

    # 응답 코드 확인 (00 / INFO-00 이 정상)
    result_code = root.findtext(".//resultCode") or root.findtext(".//cmmMsgHeader/returnReasonCode")
    if result_code not in (None, "00", "INFO-00"):
        msg = root.findtext(".//resultMsg") or root.findtext(".//cmmMsgHeader/returnAuthMsg")
        print(f"    ! 선관위 API 응답코드 {result_code}: {msg}")
        return {}

    winners: dict[str, dict] = {}
    for item in root.iter("item"):
        d = _item_to_dict(item)
        sd = _pick(d, "sdName")
        name = _pick(d, "name", "huboName")
        if not sd or not name:
            continue
        winners[sd] = {
            "personName": name,
            "party": _pick(d, "jdName", "partyName"),
            "voteRate": _pick(d, "dukyul", "dueyul", "rate"),
        }

    if winners:
        print(f"    . 선관위 당선인 {len(winners)}명 수신 (sgId={sg_id})")
    else:
        print(f"    . 선관위 당선인 데이터 없음 (sgId={sg_id}) — 위키백과로 폴백")
    return winners


def _norm(name: str | None) -> str:
    """지역명 매칭용 정규화: 공백 제거."""
    return (name or "").replace(" ", "")


def fetch_pledges(
    service_key: str | None,
    sg_typecode: str = SG_TYPE_METRO_HEAD,
    sg_id: str = DEFAULT_SG_ID,
    timeout: int = 15,
) -> dict[str, list[str]]:
    """후보자 5대공약을 {지역키: [공약제목...]} 로 반환.

    지역키는 광역(sgTypecode=3)은 시·도명(sdName), 기초(=4)는 선거구명(wiwName)을
    공백 제거해 사용한다. 키·9회 데이터가 아직 없거나 오류면 빈 dict 를 돌려주고
    (크롤러는 공약을 null 로 둔다), 데이터가 등재되면 자동으로 채워진다.

    ⚠️ 엔드포인트/필드명은 data.go.kr 문서 확정 전까지 추정치다. 값이 안 채워지면
    NEC_PLEDGE_API 와 PLEDGE_*_KEYS 를 실제 응답에 맞춰 조정한다.
    """
    if not service_key:
        return {}

    # 당선인만 대상으로 좁힐 수 없어(공약 API는 전 후보 제공) 순서·중복을 그대로 모은 뒤
    # 지역키별로 prmsOrd 순 상위 5개만 취한다. 당선/낙선 구분은 크롤러가 당선인명과
    # 대조해 거른다(여기서는 지역 단위로 반환하고 caller가 이름으로 최종 확정).
    by_region: dict[str, list[tuple[int, str, str]]] = {}
    page = 1
    while page <= 20:  # 안전 상한 (기초 전국도 수백 페이지를 넘지 않음)
        params = {
            "serviceKey": service_key,
            "pageNo": str(page),
            "numOfRows": "100",
            "sgId": sg_id,
            "sgTypecode": sg_typecode,
        }
        try:
            resp = requests.get(CANDIDATE_PLEDGE_API, params=params, timeout=timeout)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
        except Exception as exc:  # noqa: BLE001
            if page == 1:
                print(f"    ! 선관위 공약 API 요청 실패: {exc}")
            break

        result_code = root.findtext(".//resultCode") or root.findtext(
            ".//cmmMsgHeader/returnReasonCode"
        )
        if result_code not in (None, "00", "INFO-00"):
            if page == 1:
                msg = root.findtext(".//resultMsg") or root.findtext(
                    ".//cmmMsgHeader/returnAuthMsg"
                )
                print(f"    ! 선관위 공약 API 응답코드 {result_code}: {msg}")
            break

        items = list(root.iter("item"))
        if not items:
            break

        for item in items:
            d = _item_to_dict(item)
            title = _pick(d, *PLEDGE_TITLE_KEYS)
            if not title:
                continue
            if sg_typecode == SG_TYPE_METRO_HEAD:
                region = _pick(d, *PLEDGE_SD_KEYS)
            else:
                region = _pick(d, *PLEDGE_WIW_KEYS) or _pick(d, *PLEDGE_SD_KEYS)
            if not region:
                continue
            order_raw = _pick(d, *PLEDGE_ORDER_KEYS) or "999"
            try:
                order = int(re.sub(r"\D", "", order_raw) or "999")
            except ValueError:
                order = 999
            name = _pick(d, *PLEDGE_NAME_KEYS) or ""
            by_region.setdefault(_norm(region), []).append((order, title.strip(), name))

        total = root.findtext(".//totalCount")
        if total and page * 100 >= int(total):
            break
        page += 1

    # 지역별 prmsOrd 순 정렬 후 상위 5개 제목만
    out: dict[str, list[str]] = {}
    for region, entries in by_region.items():
        entries.sort(key=lambda e: e[0])
        seen: set[str] = set()
        titles: list[str] = []
        for _order, title, _name in entries:
            if title not in seen:
                seen.add(title)
                titles.append(title)
            if len(titles) >= 5:
                break
        out[region] = titles

    if out:
        print(f"    . 선관위 공약 {len(out)}개 지역 수신 (sgType={sg_typecode})")
    else:
        print(f"    . 선관위 공약 데이터 없음 (sgType={sg_typecode}) — 공약 null 유지")
    return out
