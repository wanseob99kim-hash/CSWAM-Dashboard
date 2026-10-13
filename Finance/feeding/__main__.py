"""Monthly dashboard feeding.

    python -m feeding            # check Raw data only (no files written)
    python -m feeding --write    # write dashboard_data.xlsx
    python -m feeding --upload   # write + upload to the dashboard
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import OUTPUT_NAME, collect, write_workbook
from .upload import SECRET_ENV, has_secret, upload

BASE_DIR = Path(__file__).resolve().parent.parent


def report(res) -> str:
    lines = ["== 입력 파일 =="]
    lines += [f"  {k}: {v}" for k, v in res.sources.items()]
    lines += [
        "== 결과 ==",
        f"  FS: {len(res.fs_rows)}개월 ({res.fs_months[0]} ~ {res.fs_months[-1]})" if res.fs_rows else "  FS: 0개월",
        f"  Vendor: {max(len(res.vendor_table) - 1, 0)}행",
        f"  Project: {len(res.project_rows)}행, {len({r['Month'] for r in res.project_rows})}개월",
        f"  Forecast: {'OK' if res.forecast_block else '없음'}",
    ]
    if res.warnings:
        lines.append("== 경고 ==")
        lines += [f"  ! {w}" for w in res.warnings]
    if res.errors:
        lines.append("== 오류 (업로드 불가) ==")
        lines += [f"  X {e}" for e in res.errors]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="feeding", description="Raw data -> dashboard_data.xlsx")
    parser.add_argument("--write", action="store_true", help=f"write {OUTPUT_NAME}")
    parser.add_argument("--upload", action="store_true", help="write and upload to the dashboard")
    parser.add_argument("--base", type=Path, default=BASE_DIR, help="dashboard folder")
    args = parser.parse_args(argv)

    res = collect(args.base)
    print(report(res))
    if res.errors:
        return 1
    if not (args.write or args.upload):
        print("\n(점검만 함 — 파일 생성은 --write, 업로드는 --upload)")
        return 0

    if args.upload and not has_secret():
        print(f"환경변수 {SECRET_ENV} 가 없음 — setx {SECRET_ENV} \"<업로드 키>\" 후 터미널 재시작 (파일 안 만듦)",
              file=sys.stderr)
        return 2
    try:
        out = write_workbook(res, args.base)
    except OSError as exc:
        print(f"{OUTPUT_NAME} 저장 실패 — Excel에서 열려 있으면 닫고 다시 실행 ({exc})", file=sys.stderr)
        return 2
    print(f"\n{out} 생성 완료")
    if args.upload:
        try:
            print(upload(out, OUTPUT_NAME))
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
