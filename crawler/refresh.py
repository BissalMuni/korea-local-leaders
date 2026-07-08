#!/usr/bin/env python3
"""
수집 파이프라인 오케스트레이터 — 한 번의 명령으로 전체 데이터를 갱신·검증한다.

개별 스크립트(crawl.py / crawl_basic.py / prep_geojson.py)를 올바른 순서로
실행하고, 마지막에 validate.py 로 산출물을 검증한다. 어느 단계가 실패하면
즉시 중단하고 0이 아닌 종료코드를 반환하므로 CI/자동화에 그대로 쓸 수 있다.

기본 동작: 광역 + 기초 수집 후 검증. (경계 GeoJSON은 거의 바뀌지 않고 7MB+를
내려받으므로 명시적으로 --geo 를 줄 때만 실행)

사용:
  python crawler/refresh.py               # 광역 + 기초 + 검증
  python crawler/refresh.py --metro       # 광역만 + 검증
  python crawler/refresh.py --basic       # 기초만 + 검증
  python crawler/refresh.py --geo         # 위 기본 + 경계 GeoJSON 전처리
  python crawler/refresh.py --no-validate # 검증 생략
  python crawler/refresh.py --metro 11 41 # 특정 광역 코드만(서울·경기)

환경변수 NEC_SERVICE_KEY 가 있으면 crawl.py 가 선관위 당선인 API를 사용한다.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
PY = sys.executable  # 현재 인터프리터(venv 포함)를 그대로 사용


def run(script: str, *script_args: str) -> None:
    """crawler/<script> 를 실행하고 실패하면 예외로 파이프라인을 중단."""
    cmd = [PY, str(HERE / script), *script_args]
    print(f"\n=== ▶ {script} {' '.join(script_args)}".rstrip() + " ===")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise SystemExit(f"중단: {script} 가 코드 {result.returncode} 로 실패했습니다")


def main(argv: list[str]) -> int:
    args = argv[1:]

    # 플래그와 (광역) 코드 인자 분리
    flags = {a for a in args if a.startswith("--")}
    codes = [a for a in args if not a.startswith("--")]

    known = {"--metro", "--basic", "--geo", "--no-validate"}
    unknown = flags - known
    if unknown:
        print(f"알 수 없는 옵션: {sorted(unknown)}")
        print(__doc__)
        return 2

    # 대상 선택: --metro/--basic 중 아무것도 없으면 둘 다
    do_metro = "--metro" in flags or not (flags & {"--metro", "--basic"})
    do_basic = "--basic" in flags or not (flags & {"--metro", "--basic"})
    do_geo = "--geo" in flags
    do_validate = "--no-validate" not in flags

    if codes and not do_metro:
        print("경고: 코드 인자는 광역(crawl.py)에만 적용됩니다 — --metro 없이 무시됨")

    steps: list[str] = []
    if do_metro:
        steps.append("광역")
    if do_basic:
        steps.append("기초")
        steps.append("기초 보강")
    if do_geo:
        steps.append("경계")
    if do_validate:
        steps.append("검증")
    print(f"파이프라인: {' → '.join(steps)}")

    if do_metro:
        run("crawl.py", *codes)
    if do_basic:
        run("crawl_basic.py")
        # 홈페이지에서 슬로건·CI 추출 + 선관위 공약 매칭 (best-effort)
        run("enrich_basic.py")
    if do_geo:
        run("prep_geojson.py")
    if do_validate:
        run("validate.py")

    print("\n✓ 파이프라인 완료")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
