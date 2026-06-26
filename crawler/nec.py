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
"""

from __future__ import annotations

import os
from xml.etree import ElementTree as ET

import requests

NEC_API = "http://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire"
# 선거종류코드: 1 대통령 / 2 국회의원 / 3 시·도지사(광역단체장) / 4 구·시·군의장(기초단체장) ...
SG_TYPE_METRO_HEAD = "3"

DEFAULT_SG_ID = os.environ.get("NEC_SG_ID", "20260603")   # 제9회 전국동시지방선거
TERM_START = os.environ.get("NEC_TERM_START", "2026-07-01")
TERM_END = os.environ.get("NEC_TERM_END", "2030-06-30")


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
