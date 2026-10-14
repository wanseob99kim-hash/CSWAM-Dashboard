"""Rolling Forecast -> raw 1.P&L_Summary block for the dashboard."""
from __future__ import annotations

import re
from pathlib import Path

from .sources import find_sheet, list_xlsx, load_values, number, text

VERSION_IN_NAME = re.compile(r"FCST\s*(\d+)\+(\d+)", re.IGNORECASE)
SUMMARY_SHEET = "P&L_Summary"
BLOCK_ROWS = 33  # A1:O33 — the block index.html renders
BLOCK_COLS = 15
HEADER_SCAN_ROWS = 15
HEADER_SCAN_COLS = 30

# Full-year totals collected from every forecast version (ForecastHistory sheet)
HISTORY_COLUMNS = ["Version", "ActualMonths", "Sales", "GrossProfit", "OperatingIncome", "NetIncome"]
HISTORY_ROWS = {
    "Sales": "Sales Rev",
    "GrossProfit": "Gross Profit",
    "OperatingIncome": "O.I(Exc.HQ)",
    "NetIncome": "Net Income(Exc.HQ)",
}


def pick_latest(files: list[Path]) -> Path | None:
    """File with the highest N in 'FCST N+M'; on a tie the later name (e.g. _rev1) wins."""
    best: Path | None = None
    best_n = -1
    for path in sorted(files, key=lambda p: p.name.lower()):
        m = VERSION_IN_NAME.search(path.name)
        if m and int(m.group(1)) >= best_n:
            best_n, best = int(m.group(1)), path
    return best


def version_of(path: Path) -> str:
    m = VERSION_IN_NAME.search(path.name)
    return f"{m.group(1)}+{m.group(2)}" if m else ""


def read_forecast_block(folder: Path) -> tuple[list[list], Path]:
    """Values of A1:O33 from the latest forecast's P&L_Summary sheet."""
    path = pick_latest(list_xlsx(folder))
    if path is None:
        raise ValueError(f"no 'CSWAM Rolling FCST N+M.xlsx' file in {folder}")
    ws = find_sheet(load_values(path), SUMMARY_SHEET)
    if ws is None:
        raise ValueError(f"{path.name}: sheet '{SUMMARY_SHEET}' missing")
    block = [
        [ws.cell(r, c).value for c in range(1, BLOCK_COLS + 1)]
        for r in range(1, BLOCK_ROWS + 1)
    ]
    return block, path


def latest_per_version(files: list[Path]) -> list[Path]:
    """One file per 'N+M' version (a later name such as _rev1 wins), ordered by N."""
    by_n: dict[int, Path] = {}
    for path in sorted(files, key=lambda p: p.name.lower()):
        m = VERSION_IN_NAME.search(path.name)
        if m:
            by_n[int(m.group(1))] = path
    return [by_n[n] for n in sorted(by_n)]


HISTORY_SCAN_ROWS = 80  # the summary block sits at the top of the sheet


def _total_column_layout(grid: list[list]) -> tuple[int, int, int]:
    """(header row, label column, Total column) — 0-based — from the 'Jan' … 'Total' header."""
    for r, row in enumerate(grid[:HEADER_SCAN_ROWS]):
        cells = [text(v) for v in row[:HEADER_SCAN_COLS]]
        if "Jan" in cells and "Total" in cells:
            return r, cells.index("Jan") - 1, cells.index("Total")
    raise ValueError("'Jan' … 'Total' header row not found")


def read_version_totals(path: Path) -> dict:
    """Full-year totals ('000 USD) of one forecast version."""
    wb = load_values(path, read_only=True)
    try:
        ws = find_sheet(wb, SUMMARY_SHEET)
        if ws is None:
            raise ValueError(f"{path.name}: sheet '{SUMMARY_SHEET}' missing")
        grid = [list(r) for r in ws.iter_rows(max_row=HISTORY_SCAN_ROWS, values_only=True)]
    finally:
        wb.close()
    try:
        header, label_col, total_col = _total_column_layout(grid)
    except ValueError as exc:
        raise ValueError(f"{path.name}: {exc}") from exc
    rows: dict[str, list] = {}
    for row in grid[header + 1:]:
        label = text(row[label_col]) if label_col < len(row) else ""
        rows.setdefault(label, row)  # first occurrence wins
    missing = [label for label in HISTORY_ROWS.values() if label not in rows]
    if missing:
        raise ValueError(f"{path.name}: rows not found: {', '.join(missing)}")
    version = version_of(path)
    out = {"Version": version, "ActualMonths": int(version.split("+")[0])}
    for key, label in HISTORY_ROWS.items():
        row = rows[label]
        out[key] = number(row[total_col]) if total_col < len(row) else 0.0
    return out


def read_forecast_history(folder: Path) -> tuple[list[dict], list[str]]:
    """Totals for every forecast version in the folder, oldest first, plus warnings."""
    history: list[dict] = []
    warnings: list[str] = []
    for path in latest_per_version(list_xlsx(folder)):
        try:
            history.append(read_version_totals(path))
        except ValueError as exc:
            warnings.append(str(exc))
    return history, warnings
