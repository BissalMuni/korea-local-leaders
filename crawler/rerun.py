#!/usr/bin/env python3
"""
검수에서 👎(싫어요) 표시한 항목만 다시 수집한다.

입력: /review 페이지의 "👎 내보내기"로 받은 review_dislikes.json
      형식 {"count": N, "items": [{code,name,type,title,field,value,source}, ...]}

동작(필드별):
  - 광역(metropolitan) 항목      -> crawl.py <codes> 재실행(홈페이지 재수집: 슬로건·CI·공약)
  - 기초 slogan/ci               -> 해당 code의 그 필드를 basic.json에서 비운 뒤
                                    enrich_basic.py <codes> 재실행(홈페이지에서 재추출)
  - 기초 photoUrl                -> 인사말 페이지에서 후보를 다시 뽑아 _rerun_photos.json 저장
                                    (사람이 다시 육안검증 후 basic_photos.json 갱신)
  - 기초/광역 homepage           -> 자동교정 불가. basic_homepages.json 수동 수정 대상으로 목록만 출력
  - pledges                      -> 선관위 API 재조회 대상(키 필요). 코드만 출력

기본은 드라이런(계획만 출력). 실제 실행은 --run.

사용:
  python crawler/rerun.py review_dislikes.json          # 계획만
  python crawler/rerun.py review_dislikes.json --run     # 재수집 실행
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
PY = sys.executable
BASIC_FILE = ROOT / "data" / "basic.json"


def run(script: str, *args: str) -> None:
    cmd = [PY, str(HERE / script), *args]
    print(f"\n=== ▶ {script} {' '.join(args)} ===")
    r = subprocess.run(cmd)
    if r.returncode != 0:
        raise SystemExit(f"중단: {script} 실패(코드 {r.returncode})")


def clear_basic_fields(pairs: list[tuple[str, str]]) -> None:
    """basic.json에서 (code, field)들의 값을 None으로 비워 재추출을 유도."""
    data = json.loads(BASIC_FILE.read_text(encoding="utf-8"))
    by_code = {g["code"]: g for g in data["governors"]}
    changed = 0
    for code, fld in pairs:
        g = by_code.get(code)
        if g and g.get(fld) is not None:
            g[fld] = None
            changed += 1
    if changed:
        BASIC_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"  basic.json 필드 {changed}개 비움(재추출 대상)")


def rerun_photos(codes: list[str]) -> None:
    """기초 사진을 인사말 페이지에서 다시 추출해 검증용 후보 파일로 저장."""
    sys.path.insert(0, str(HERE))
    from extract import extract_head_photo  # 지연 임포트(네트워크 의존)

    data = json.loads(BASIC_FILE.read_text(encoding="utf-8"))
    by_code = {g["code"]: g for g in data["governors"]}
    out = []
    for code in codes:
        g = by_code.get(code)
        if not g or not g.get("homepage"):
            continue
        photo, src = extract_head_photo(g["homepage"])
        out.append({"code": code, "name": g["name"], "photo": photo, "src": src})
        print(f"    [{code}] {g['name']} -> {'후보 있음' if photo else '없음'}")
    dst = HERE / "_rerun_photos.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  사진 후보 저장: {dst.name} (육안검증 후 basic_photos.json 갱신)")


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    do_run = "--run" in argv
    if not args:
        print(__doc__)
        return 2

    path = Path(args[0])
    if not path.exists():
        print(f"파일 없음: {path}")
        return 2
    items = json.loads(path.read_text(encoding="utf-8")).get("items", [])
    if not items:
        print("👎 항목이 없습니다.")
        return 0

    # 분류
    metro_codes: set[str] = set()
    basic_field: dict[str, set[str]] = defaultdict(set)  # field -> codes
    homepage_fix: list[tuple[str, str]] = []
    pledge_codes: set[str] = set()

    for it in items:
        code, fld, typ = it["code"], it["field"], it.get("type")
        if fld == "homepage":
            homepage_fix.append((code, it.get("name", "")))
        elif fld == "pledges":
            pledge_codes.add(code)
        elif typ == "metropolitan":
            metro_codes.add(code)
        else:  # 기초 slogan/ci/photoUrl
            basic_field[fld].add(code)

    print(f"👎 {len(items)}건 분석:")
    print(f"  광역 재수집: {sorted(metro_codes) or '없음'}")
    print(f"  기초 슬로건: {sorted(basic_field.get('slogan', set())) or '없음'}")
    print(f"  기초 CI    : {sorted(basic_field.get('ci', set())) or '없음'}")
    print(f"  기초 사진  : {sorted(basic_field.get('photoUrl', set())) or '없음'}")
    if homepage_fix:
        print("  홈페이지 수동수정 필요(basic_homepages.json):")
        for code, name in homepage_fix:
            print(f"    - {code} {name}")
    if pledge_codes:
        print(f"  공약 재조회(선관위 키 필요): {sorted(pledge_codes)}")

    if not do_run:
        print("\n(드라이런) 실제 재수집하려면 --run 을 붙이세요.")
        return 0

    # 실행
    if metro_codes:
        run("crawl.py", *sorted(metro_codes))

    slogan_ci_codes = basic_field.get("slogan", set()) | basic_field.get("ci", set())
    if slogan_ci_codes:
        pairs = [(c, "slogan") for c in basic_field.get("slogan", set())]
        pairs += [(c, "ci") for c in basic_field.get("ci", set())]
        clear_basic_fields(pairs)
        run("enrich_basic.py", *sorted(slogan_ci_codes))

    if basic_field.get("photoUrl"):
        print("\n=== ▶ 기초 사진 재추출 ===")
        rerun_photos(sorted(basic_field["photoUrl"]))

    print("\n✓ 재수집 완료. (사진은 _rerun_photos.json 육안검증 필요, "
          "홈페이지·공약은 위 안내 참고)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
