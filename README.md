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

## 데이터 출처

- **이름·소속 정당**: 위키백과 각 시·도 문서의 정보상자 (신뢰 가능한 단일 소스)
- **슬로건·비전**: 각 지자체 공식 홈페이지 (best-effort, og 메타·키워드 기반)
- **수동 보정**: `data/overrides.json` 의 값이 크롤링 결과보다 항상 우선

> 홈페이지는 구조가 제각각이라 슬로건 추출이 빗나갈 수 있습니다. 부정확하거나
> 비어 있는 값은 `overrides.json` 에 직접 넣어 보정합니다. 임기 등 확인되지
> 않은 값은 날조하지 않고 비워 둡니다(`null`).

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
