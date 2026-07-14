# 비전 추출 규격 (캡처 → 목표 자료)

각 자치구의 캡처본을 **Claude 비전**이 읽고 목표 자료를 구조화 JSON 으로 뽑는 단계.
정적 HTML 파싱이 구조 편차로 못 잡는 값을 "화면을 보고" 채운다.

## 입력 (crawler/captures/<code>/)

- `home.jpg` — 홈페이지 전체 화면
- `greeting.jpg` — 기관장 인사말/구청장실 페이지 (있을 때)
- `pledge.jpg` — 공약/비전 페이지 (있을 때)
- `home.json` — DOM 스냅샷. 화면엔 이미지가 보여도 **URL 은 여기에만** 있으므로,
  CI·사진의 정확한 URL 은 아래 배열에서 고른다:
  - `snapshot.ciImages[]` : 헤더 로고 후보 `{src, alt, w, h}`
  - `snapshot.contentImages[]` : 본문 큰 이미지 후보(초상 포함) `{src, alt, w, h, top}`
  - `greetingSnapshot.contentImages[]` / `pledgeSnapshot.contentImages[]` : 하위 페이지 이미지 후보
  - `greetingUrl` / `pledgeUrl` : 실제로 캡처한 하위 페이지 URL

## 출력 스키마 (code 하나당)

```json
{
  "slogan": "모든 순간 우리 곁에 중구",   // 기관 슬로건/구정구호. 기관명·메뉴가 아니라 캐치프레이즈. 없으면 null
  "ci": "https://.../logo.png",            // 헤더 심볼마크(로고) 절대 URL. ciImages 에서 선택. 없으면 null
  "photoUrl": "https://.../mayor.png",      // 기관장 초상 사진 절대 URL. contentImages 에서 선택. 없으면 null
  "photoSource": "https://.../chief/",      // 그 사진이 있던 페이지 URL(greetingUrl/pledgeUrl/homepage)
  "pledges": ["공약1", "공약2", "..."],     // 주요공약/핵심가치(3~7개). 없으면 null
  "pledgeSource": "https://.../vision",     // 공약을 읽은 페이지 URL
  "confidence": { "slogan": "high|med|low", "ci": "...", "photo": "...", "pledges": "..." },
  "notes": "판단 근거·불확실 지점 한 줄"
}
```

## 판단 규칙

1. **slogan**: 화면 상단·비전 페이지의 큰 캐치프레이즈. "○○구청", "○○시" 같은 기관명이나
   메뉴 나열은 슬로건이 아니다(null). 지어내지 말 것.
2. **ci**: 헤더 좌상단 로고. `ciImages` 중 alt/파일명이 로고·심볼이고 크기가 로고다운
   것을 고른다. 배너·아이콘·검색버튼은 배제.
3. **photoUrl**: 인물 초상(정장·상반신). 홈/인사말/공약 화면에서 기관장 사진을 확인하고,
   `contentImages`(해당 페이지) 중 사람 사진으로 보이는 URL(초상다운 비율·alt 에 기관장/
   시장/군수/구청장, 파일명 mayor/visual/greeting 등)을 고른다. 로고·삽화·풍경은 배제.
   확신이 없으면 null(오탐보다 공백).
4. **pledges**: 공약/비전 페이지의 핵심가치·공약 문구를 3~7개로. 게시물 목록·뉴스는 아님.
5. 모든 URL 은 절대경로. 스냅샷 배열에 없으면 임의로 만들지 말고 null.

## 산출

수집 결과는 `crawler/basic_vision.json` 의 `results[code]` 에 병합하며,
육안검증을 거친 항목만 `"verified": true` 로 표시한다(크롤러는 verified 만 채택).
