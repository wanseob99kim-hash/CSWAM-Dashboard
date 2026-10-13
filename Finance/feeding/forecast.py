"""Rolling Forecast -> raw 1.P&L_Summary block for the dashboard."""
from __future__ import annotations

import re
from pathlib import Path

from .sources import find_sheet, list_xlsx, load_values

VERSION_IN_NAME = re.compile(r"FCST\s*(\d+)\+(\d+)", re.IGNORECASE)
SUMMARY_SHEET = "P&L_Summary"
BLOCK_ROWS = 33  # A1:O33 — the block index.html renders
BLOCK_COLS = 15


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
