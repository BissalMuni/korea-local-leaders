# 로컬시티 (LocalCity)

전국 광역·기초 자치단체장의 **이름·소속 정당·슬로건·비전**을 한곳에서 조회하는 반응형 웹.
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

슬로건·CI(심볼마크)는 각 지자체 **공식 홈페이지**에서 best-effort(og 메타·헤더 로고·키워드)로
수집합니다. **주요공약**은 선관위 후보자 공약 OpenAPI로 지역명 매칭해 채웁니다(키·데이터가
있을 때만, 없으면 `null`). **기관장 사진**은 광역은 위키백과, 기초는 각 인사말 페이지에서
자동추출 후 **육안검증**한 것만 `crawler/basic_photos.json` 에 큐레이션되어 있습니다(자동추출은
초상 외 이미지가 절반가량 섞여, 검증 통과분만 채택 — 나머지는 점진 보완 대상).

### 기초 홈페이지 전수 조사

기초 227곳의 공식 홈페이지는 `crawler/basic_homepages.json` 에 **code→URL** 로 큐레이션되어
있습니다(전수 검색 + HTTP 접속 검증 완료). `crawl_basic.py` 가 이 파일을 읽어 각 기초의
`homepage` 를 채우고, `enrich_basic.py` 가 그 홈페이지에서 슬로건·CI 를 추출합니다. 도메인이
바뀌면 이 파일만 갱신하면 됩니다.

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
| `NEC_PLEDGE_API` | 후보자 공약 API 엔드포인트 | 코드 내 기본값 |

> ⚠️ 당선인 API와 마찬가지로 공약 API의 제9회 데이터도 이관(~2개월) 전까지는 비어 있을 수
> 있습니다. 그 전까지 `pledges` 는 `null` 이며, 키가 설정되고 데이터가 등재되면 자동 전환됩니다.
> 공약 API의 엔드포인트·필드명은 data.go.kr 문서 확정 전 추정치이므로, 값이 안 채워지면
> `NEC_PLEDGE_API` 와 `crawler/nec.py` 의 `PLEDGE_*_KEYS` 를 실제 응답에 맞춰 조정하세요.

```bash
# PowerShell
$env:NEC_SERVICE_KEY = "발급받은키"; python crawler/crawl.py
```

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 (16개 시·도 페이지 SSG)
```

## 데이터 수집(크롤링)

```bash
pip install -r crawler/requirements.txt
```

### 한 번에 갱신 (권장)

`crawler/refresh.py` 가 개별 스크립트를 올바른 순서로 실행하고 마지막에 검증까지
수행합니다. 어느 단계든 실패하면 즉시 중단하고 0이 아닌 종료코드를 반환하므로
CI/자동화에 그대로 쓸 수 있습니다.

```bash
python crawler/refresh.py            # 광역 + 기초 수집 후 검증
python crawler/refresh.py --metro    # 광역만 + 검증
python crawler/refresh.py --basic    # 기초만 + 검증
python crawler/refresh.py --geo      # 위 기본 + 경계 GeoJSON 전처리(7MB+ 다운로드)
python crawler/refresh.py --metro 11 41   # 특정 광역 코드만(서울·경기)
```

### 개별 스크립트

```bash
python crawler/crawl.py            # 광역 16곳 -> data/governors.json (슬로건·CI·공약 포함)
python crawler/crawl.py 11 41      # 특정 코드만 (예: 서울·경기)
python crawler/crawl_basic.py      # 기초 227곳 -> data/basic.json (홈페이지 포함)
python crawler/enrich_basic.py     # 기초 홈페이지에서 슬로건·CI 추출 + 공약 매칭
python crawler/enrich_basic.py 4101 4102   # 특정 code만 보강
```

광역 결과는 `data/governors.json` 에 저장되며, 기존 결과를 유지한 채 대상만 갱신합니다.
기초는 위키백과 「제9회 전국동시지방선거 기초자치단체장」(단일 페이지)에서
시장·군수·구청장 당선자·정당을 수집해 `data/basic.json` 에 저장합니다.

### 검증

```bash
python crawler/validate.py       # 산출물 무결성 검사 (네트워크 불필요)
```

광역 16곳·기초 227곳 개수, 필수 필드 존재, code 유일성, 기초→광역 참조 무결성을
검사합니다. 오류가 있으면 종료코드 1. 비어 있는 슬로건/사진 등 점진 보완 대상은
경고로만 보고하고 실패시키지 않습니다.

> ⚠️ 2026-07-01 **전남광주통합특별시** 출범(광주광역시+전라남도 통합)으로 광역이 16곳이 되었고,
> 옛 광주(29)·전남(46) 소속 기초 27곳은 통합시(코드 29) 아래로 재지정되었습니다(기초 코드 29xx·46xx는
> 보존). 인천 자치구 신설 등 2026년 개편이
> 반영되어 있어, 공개된 2018년판 시군구 경계 GeoJSON과 어긋납니다. 따라서 **기초는
> 목록 데이터만** 제공하고, **지도는 광역 16곳**으로 운영합니다.

## 수동 보정

`data/overrides.json` 의 `overrides` 에 시·도 코드별로 값을 넣습니다:

```json
{
  "overrides": {
    "11": {
      "slogan": "다시 뛰는 서울",
      "vision": "시민이 행복한 글로벌 도시",
      "ci": "https://www.seoul.go.kr/.../ci.png",
      "pledges": ["공약 1", "공약 2", "공약 3"],
      "termStart": "2026-07-01",
      "termEnd": "2030-06-30"
    }
  }
}
```

## 범위

**광역 16곳**(시·도지사)과 **기초 227곳**(시장·군수·구청장)을 수집합니다. 각 기관에서
이름·정당·**공식 홈페이지**·슬로건·**CI(심볼마크)**·**주요공약**·기관장 사진을 대상으로 합니다.

- **광역**: 슬로건·비전·사진·좌표·CI 까지 채워져 목록·상세·지도에 모두 노출.
- **기초**: 이름·정당·홈페이지·슬로건·CI 수집(전수 홈페이지 확보 완료). 사진·공약은
  선관위 데이터 등재·점진 보완 대상.

> 홈페이지 구조가 제각각이라 슬로건·CI 는 못 찾으면 `null` 로 두며(날조하지 않음),
> `overrides.json` 으로 보정합니다.
