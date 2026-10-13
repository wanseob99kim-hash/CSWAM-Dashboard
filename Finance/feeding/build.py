"""Assemble dashboard_data.xlsx from Raw data and run sanity checks."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import openpyxl

from .closing import FS_COLUMNS, build_fs_rows
from .forecast import read_forecast_block, version_of
from .projects import PROJECT_COLUMNS, build_project_rows
from .sources import data_dir, list_xlsx, month_from_name
from .vendor import latest_vendor_file, max_posting_date, read_vendor_table

OUTPUT_NAME = "dashboard_data.xlsx"
HISTORY_DIR = "_history"
COGS_TOLERANCE = 0.10  # Material+Labor+Overhead vs COGS (Scrap/Adj rows make up the rest)


@dataclass
class FeedResult:
    fs_rows: list[dict] = field(default_factory=list)
    vendor_table: list[list] = field(default_factory=list)
    project_rows: list[dict] = field(default_factory=list)
    forecast_block: list[list] = field(default_factory=list)
    sources: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def fs_months(self) -> list[str]:
        return [r["Month"] for r in self.fs_rows]


def collect(base: Path) -> FeedResult:
    res = FeedResult()
    _collect_fs(base, res)
    _collect_vendor(base, res)
    _collect_projects(base, res)
    _collect_forecast(base, res)
    _check(res)
    return res


def _collect_fs(base: Path, res: FeedResult) -> None:
    folder = data_dir(base, "Financials")
    if folder is None:
        res.errors.append("Closing Package 폴더(Raw data/Financials)에 파일 없음")
        return
    res.fs_rows, warns = build_fs_rows(folder)
    res.warnings += warns
    files = list_xlsx(folder)
    res.sources["Financials"] = f"{folder} ({len(files)} files, 최신 {files[-1].name})"
    latest_pkg = month_from_name(files[-1].name)
    if res.fs_months and latest_pkg and res.fs_months[-1] != latest_pkg:
        res.warnings.append(
            f"최신 Closing Pkg는 {latest_pkg}인데 FS 마지막 월은 {res.fs_months[-1]} (해당 월 Sales 비어있음?)")


def _collect_vendor(base: Path, res: FeedResult) -> None:
    vendor_dir = data_dir(base, "Vendor")
    path = latest_vendor_file(vendor_dir, base / "vendor.xlsx")
    if path is None:
        res.errors.append("Vendor 파일 없음 (Raw data/Vendor 또는 vendor.xlsx)")
        return
    try:
        res.vendor_table = read_vendor_table(path)
    except ValueError as exc:
        res.errors.append(str(exc))
        return
    res.sources["Vendor"] = str(path)
    if vendor_dir is None:
        res.warnings.append("Raw data/Vendor 비어있음 — 예전 vendor.xlsx 사용 중 (이번 달 FBL1N 넣었는지 확인)")
    latest = max_posting_date(res.vendor_table)
    if latest is None:
        res.warnings.append("Vendor 전기일(Posting Date)을 읽지 못함 — 기준일 확인 불가")
    res.sources["Vendor 최종 전기일"] = latest.strftime("%Y-%m-%d") if latest else "-"
    if latest and res.fs_months and latest.strftime("%Y-%m") < res.fs_months[-1]:
        res.warnings.append(
            f"Vendor 최종 전기일 {latest:%Y-%m-%d}가 FS 최신 월 {res.fs_months[-1]}보다 이전 — FBL1N 새로 받았는지 확인")


def _collect_projects(base: Path, res: FeedResult) -> None:
    folder = data_dir(base, "Projects")
    if folder is None:
        res.errors.append("Cost Analysis 폴더(Raw data/Projects)에 파일 없음")
        return
    res.project_rows, warns = build_project_rows(folder)
    res.warnings += warns
    res.sources["Projects"] = f"{folder} ({len(list_xlsx(folder))} files)"


def _collect_forecast(base: Path, res: FeedResult) -> None:
    folder = data_dir(base, "Forecast")
    if folder is None:
        res.errors.append("Forecast 폴더(Raw data/Forecast)에 파일 없음")
        return
    try:
        res.forecast_block, path = read_forecast_block(folder)
    except ValueError as exc:
        res.errors.append(str(exc))
        return
    res.sources["Forecast"] = path.name
    actual_months = int(version_of(path).split("+")[0] or 0)
    if res.fs_months and actual_months < int(res.fs_months[-1][5:]):
        res.warnings.append(
            f"Forecast {version_of(path)} 는 실적 {actual_months}개월 기준 — FS는 {res.fs_months[-1]}까지 있음 (새 FCST 없으면 무시)")


def _check(res: FeedResult) -> None:
    if not res.fs_rows:
        res.errors.append("FS 월 데이터 0건")
    if not res.project_rows:
        res.errors.append("Project 데이터 0건")
    if res.vendor_table and len(res.vendor_table) < 2:
        res.errors.append("Vendor 데이터 0건")

    for r in res.fs_rows:
        parts = r["MaterialCost"] + r["LaborCost"] + r["MfgOverhead"]
        if r["COGS"] and abs(parts - r["COGS"]) / abs(r["COGS"]) > COGS_TOLERANCE:
            res.warnings.append(f"{r['Month']}: Material+Labor+Overhead가 COGS와 10% 이상 차이 (원본 Adj 행 확인)")

    project_months = {r["Month"] for r in res.project_rows}
    missing = [m for m in res.fs_months if m not in project_months]
    if missing:
        res.warnings.append(f"Project 데이터 없는 월: {', '.join(missing)}")


def write_workbook(res: FeedResult, base: Path) -> Path:
    """Write dashboard_data.xlsx (previous version copied to _history/)."""
    out = base / OUTPUT_NAME
    wb = openpyxl.Workbook()
    fs = wb.active
    fs.title = "FS"
    fs.append(FS_COLUMNS)
    for r in res.fs_rows:
        fs.append([r[c] for c in FS_COLUMNS])

    vendor = wb.create_sheet("Vendor")
    for row in res.vendor_table:
        vendor.append(row)

    project = wb.create_sheet("Project")
    project.append(PROJECT_COLUMNS)
    for r in res.project_rows:
        project.append([r[c] for c in PROJECT_COLUMNS])

    forecast = wb.create_sheet("Forecast")
    for ri, row in enumerate(res.forecast_block, start=1):
        for ci, value in enumerate(row, start=1):
            if value is not None:  # keep the sheet range where the data starts
                forecast.cell(ri, ci, value)

    if out.exists():
        history = base / HISTORY_DIR
        history.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        shutil.copy2(out, history / f"dashboard_data_{stamp}.xlsx")
    tmp = out.with_suffix(".tmp.xlsx")
    wb.save(tmp)
    os.replace(tmp, out)
    return out
