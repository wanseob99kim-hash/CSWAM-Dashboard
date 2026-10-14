"""PFE vs Non-PFE purchase amounts by project (AMPC tab pivot).

Invoice lines come from the year sheets ('2025', '2026', …) of the ZMM009 invoice
verification workbook. Each line is classified by its supplier code against the
PFE Vendor List; suppliers not on the list are left out (counted in the summary).
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

from .sources import load_values, text

PROJECT_PIVOT_COLUMNS = ["Project", "NonPFE", "PFE", "Total", "PFERatio"]
YEAR_SHEET = re.compile(r"^\d{4}$")
PROJECT_HEADERS = ("Cust.Proj.No.", "Customer Project No.")
SUPPLIER_HEADERS = ("Supplier",)
AMOUNT_HEADERS = ("Amount LC", "Amt.in loc.cur.")
DATE_HEADERS = ("Pstng Date", "Posting Date")
EXCEL_EPOCH = date(1899, 12, 30)
SERIAL_DATE_RANGE = (30000, 80000)  # Excel serials between 1982 and 2119
BLANK_PROJECT = "(No project)"


@dataclass
class ProjectPivot:
    rows: list[dict] = field(default_factory=list)
    sheets: list[str] = field(default_factory=list)
    first_date: date | None = None
    last_date: date | None = None
    lines_used: int = 0
    lines_off_list: int = 0
    lines_bad_amount: int = 0


def _column(header: list[str], names: tuple[str, ...], sheet: str) -> int:
    for i, h in enumerate(header):
        if h in names:
            return i
    raise ValueError(f"sheet '{sheet}': none of {', '.join(names)} in header")


def _supplier_code(value) -> str:
    s = text(value)
    return str(int(float(s))) if re.fullmatch(r"\d+(\.0+)?", s) else s


def _amount(value) -> float | None:
    """Numbers, or SAP text like '1,234.50' / '1,234.50-'; None when unreadable."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = text(value).replace(",", "")
    if not s:
        return 0.0
    negative = s.endswith("-")
    try:
        x = float(s.rstrip("-"))
    except ValueError:
        return None
    return -x if negative else x


def _posting_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and SERIAL_DATE_RANGE[0] <= value <= SERIAL_DATE_RANGE[1]:
        return EXCEL_EPOCH + timedelta(days=int(value))
    m = re.match(r"(\d{4})[.\-/](\d{2})[.\-/](\d{2})", text(value))
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


SCOPE_PIVOT_SHEET = re.compile(r"^PIVOT", re.IGNORECASE)
SCOPE_RELEVANT_SHEET = re.compile(r"^Relevant Projects", re.IGNORECASE)
SCOPE_HEADER = "Project Name"
SCOPE_END = {"grand total", "총합계"}


def read_project_scope(path: Path) -> tuple[list[str], str]:
    """Projects to report, in display order, and where the list came from.

    1st choice: the project summary of the PIVOT sheet (column under 'Project Name',
    down to 'Grand Total') — its order is the order the finance team reads.
    Fallback: distinct projects of the 'Relevant Projects …' sheet in first-seen order.
    """
    wb = load_values(path, read_only=True)
    try:
        for ws in wb.worksheets:
            if not SCOPE_PIVOT_SHEET.match(ws.title.strip()):
                continue
            scope: list[str] = []
            col = None
            for row in ws.iter_rows(values_only=True):
                cells = [text(v) for v in row]
                if col is None:
                    col = cells.index(SCOPE_HEADER) if SCOPE_HEADER in cells else None
                    continue
                name = cells[col] if col < len(cells) else ""
                if name.lower() in SCOPE_END:
                    break
                if name and name not in scope:
                    scope.append(name)
            if scope:
                return scope, f"{ws.title} 시트 요약표"
        for ws in wb.worksheets:
            if not SCOPE_RELEVANT_SHEET.match(ws.title.strip()):
                continue
            rows = ws.iter_rows(values_only=True)
            header = [text(h) for h in next(rows, [])]
            pc = _column(header, PROJECT_HEADERS, ws.title)
            scope = []
            for row in rows:
                name = text(row[pc]) if row and pc < len(row) else ""
                if name and name not in scope:
                    scope.append(name)
            if scope:
                return scope, f"{ws.title} 시트"
    finally:
        wb.close()
    return [], ""


def scoped_rows(scope: list[str], project_rows: list[dict]) -> tuple[list[dict], list[str]]:
    """Pivot rows for the scoped projects in scope order; projects without invoices get a zero row."""
    by_project = {r["Project"]: r for r in project_rows}
    rows, missing = [], []
    for name in scope:
        row = by_project.get(name)
        if row is None:
            missing.append(name)
            row = {"Project": name, "NonPFE": 0.0, "PFE": 0.0, "Total": 0.0, "PFERatio": None}
        rows.append(row)
    return rows, missing


def build_project_pivot(path: Path, vendor_status: dict[str, str]) -> ProjectPivot:
    """Sum invoice amounts by project into PFE / Non-PFE using vendor_status {code: 'PFE'|'Non-PFE'}."""
    sums: dict[str, dict[str, float]] = defaultdict(lambda: {"PFE": 0.0, "Non-PFE": 0.0})
    pivot = ProjectPivot()
    wb = load_values(path, read_only=True)
    try:
        for ws in wb.worksheets:
            if not YEAR_SHEET.match(ws.title.strip()):
                continue
            pivot.sheets.append(ws.title.strip())
            rows = ws.iter_rows(values_only=True)
            header = [text(h) for h in next(rows, [])]
            pc = _column(header, PROJECT_HEADERS, ws.title)
            sc = _column(header, SUPPLIER_HEADERS, ws.title)
            ac = _column(header, AMOUNT_HEADERS, ws.title)
            dc = next((i for i, h in enumerate(header) if h in DATE_HEADERS), None)
            for row in rows:
                if not row or len(row) <= max(pc, sc, ac) or text(row[sc]) == "":
                    continue
                status = vendor_status.get(_supplier_code(row[sc]))
                if status not in ("PFE", "Non-PFE"):
                    pivot.lines_off_list += 1
                    continue
                amount = _amount(row[ac])
                if amount is None:
                    pivot.lines_bad_amount += 1
                    continue
                sums[text(row[pc]) or BLANK_PROJECT][status] += amount
                pivot.lines_used += 1
                d = _posting_date(row[dc]) if dc is not None and dc < len(row) else None
                if d:
                    pivot.first_date = min(pivot.first_date or d, d)
                    pivot.last_date = max(pivot.last_date or d, d)
    finally:
        wb.close()

    for project, s in sums.items():
        total = s["PFE"] + s["Non-PFE"]
        pivot.rows.append({
            "Project": project,
            "NonPFE": round(s["Non-PFE"], 2),
            "PFE": round(s["PFE"], 2),
            "Total": round(total, 2),
            # a ratio only means something when there is a positive total
            "PFERatio": round(s["PFE"] / total, 6) if total > 0 else None,
        })
    pivot.rows.sort(key=lambda r: r["Total"], reverse=True)
    return pivot
