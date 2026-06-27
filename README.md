# 로컬시티 (LocalCity)

전국 광역자치단체장의 **이름·소속 정당·슬로건·비전**을 한곳에서 조회하는 반응형 웹.
새 단체장 취임과 각 지자체 홈페이지 개편에 맞춰 데이터를 갱신합니다.

## 구성

| 영역 | 기술 |
| --- | --- |
| 웹 (프론트+백) | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 |
| 데이터 수집 | Python 3.11 크롤러 (requests · BeautifulSoup) |
| 배포 | Vercel |

데이터 흐름: **Python 크롤러 → `data/governors.json` → Next.js가 정적 생성(SSG)으로 렌더링**

## 데이터 출처 (우선순위)

이름·정당은 아래 순서로 채워집니다. 위가 우선합니다.

1. **`data/overrides.json` (수동 보정)** — 항상 최우선
2. **선관위 당선인 OpenAPI** — `NEC_SERVICE_KEY` 가 설정되고 해당 선거 데이터가 있을 때. 공식 당선 정보(성명·정당)와 임기를 채움
3. **위키백과** 각 시·도 문서 정보상자 — 위 둘이 없을 때의 폴백

슬로건·비전은 각 지자체 **공식 홈페이지**에서 best-effort(og 메타·키워드)로 수집합니다.

> ⚠️ 선관위 당선인 API의 전국동시지방선거 데이터는 **제8회(2022)까지** 제공되며,
> **제9회(2026-06-03)** 당선인은 선거 후 검증·이관(~2개월) 뒤 등재됩니다. 그 전까지는
> 위키백과로 폴백하는 것이 정상입니다. 데이터가 올라오면 키만 설정돼 있으면 자동
> 전환됩니다.
>
> 홈페이지는 구조가 제각각이라 슬로건 추출이 빗나갈 수 있습니다. 부정확하거나
> 비어 있는 값은 `overrides.json` 에 직접 넣어 보정합니다. 임기 등 확인되지 않은
> 값은 날조하지 않고 비워 둡니다(`null`).

### 선관위 OpenAPI 설정 (선택)

[공공데이터포털](https://www.data.go.kr/data/15000864/openapi.do)에서 회원가입 →
활용신청 → 일반 인증키(Decoding)를 발급받아 환경변수로 넣습니다.

| 환경변수 | 설명 | 기본값 |
| --- | --- | --- |
| `NEC_SERVICE_KEY` | 공공데이터포털 일반 인증키 (필수) | — |
| `NEC_SG_ID` | 선거ID | `20260603` (제9회 지선) |
| `NEC_TERM_START` | 당선자 임기 시작 | `2026-07-01` |
| `NEC_TERM_END` | 당선자 임기 종료 | `2030-06-30` |

```bash
# PowerShell
$env:NEC_SERVICE_KEY = "발급받은키"; python crawler/crawl.py
```

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 (17개 시·도 페이지 SSG)
```

## 데이터 수집(크롤링)

```bash
pip install -r crawler/requirements.txt
python crawler/crawl.py          # 전체 17곳 수집
python crawler/crawl.py 11 41    # 특정 코드만 (예: 서울·경기)
```

결과는 `data/governors.json` 에 저장되며, 기존 결과를 유지한 채 대상만 갱신합니다.

### 기초자치단체장 수집

```bash
python crawler/crawl_basic.py    # 기초 227곳 -> data/basic.json
```

위키백과 「제9회 전국동시지방선거 기초자치단체장」(단일 페이지)에서 시장·군수·구청장
당선자·정당을 수집합니다.

> ⚠️ 2026년 행정구역 개편(전남·광주 통합 "전남광주통합특별시", 인천 자치구 신설)이
> 반영되어 있어, 공개된 2018년판 시군구 경계 GeoJSON과 어긋납니다. 따라서 **기초는
> 목록 데이터만** 제공하고, **3D 지도는 경계가 확실한 광역 17곳**으로 운영합니다.

## 수동 보정

`data/overrides.json` 의 `overrides` 에 시·도 코드별로 값을 넣습니다:

```json
{
  "overrides": {
    "11": {
      "slogan": "다시 뛰는 서울",
      "vision": "시민이 행복한 글로벌 도시",
      "termStart": "2026-07-01",
      "termEnd": "2030-06-30"
    }
  }
}
```

## 범위

현재 MVP는 **광역 17곳**(시·도지사). 이후 기초 226곳으로 확장 예정.
