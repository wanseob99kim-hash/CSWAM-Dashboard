"""Cost Analysis (PIVOT sheet) -> project margin rows."""
from __future__ import annotations

from pathlib import Path

from .sources import list_xlsx, load_values, month_from_name, number, text

PROJECT_COLUMNS = ["Month", "Customer", "Project", "Qty", "Revenue", "Cost", "PL", "Margin"]
PIVOT_SHEET = "PIVOT"
# Pivot header/footer labels (English and Korean Excel)
SKIP_LABELS = {"row labels", "grand total", "행 레이블", "총합계"}
SKIP_CONTAINS = "margin analysis"
PROJECT_INDENT = "  "  # project rows are indented under their customer


def _is_project_row(cell) -> bool:
    raw = cell.value if isinstance(cell.value, str) else ""
    indent = cell.alignment.indent if cell.alignment is not None else 0
    return bool(indent) or raw.startswith(PROJECT_INDENT)


def parse_cost_analysis(path: Path) -> list[dict]:
    month = month_from_name(path.name)
    if not month:
        raise ValueError(f"{path.name}: no _YYYY.MM. in file name")
    wb = load_values(path)
    if PIVOT_SHEET not in wb.sheetnames:
        raise ValueError(f"{path.name}: sheet '{PIVOT_SHEET}' missing")
    ws = wb[PIVOT_SHEET]

    rows: list[dict] = []
    customer = ""
    for r in range(1, ws.max_row + 1):
        cell = ws.cell(r, 1)
        label = text(cell.value)
        if not label or label.lower() in SKIP_LABELS or SKIP_CONTAINS in label.lower():
            continue
        if not _is_project_row(cell):
            customer = label
            continue
        if not customer:
            continue
        revenue = abs(number(ws.cell(r, 3).value))
        pl = number(ws.cell(r, 5).value)
        rows.append({
            "Month": month,
            "Customer": customer,
            "Project": label,
            "Qty": number(ws.cell(r, 2).value),
            "Revenue": revenue,
            "Cost": abs(number(ws.cell(r, 4).value)),
            "PL": pl,
            "Margin": pl / revenue if revenue else 0.0,
        })
    return rows


def build_project_rows(folder: Path) -> tuple[list[dict], list[str]]:
    """Rows from every monthly file (newest file wins per month) + warnings."""
    by_month: dict[str, list[dict]] = {}
    warnings: list[str] = []
    for path in list_xlsx(folder):
        try:
            rows = parse_cost_analysis(path)
        except ValueError as exc:
            warnings.append(str(exc))
            continue
        if rows:
            by_month[rows[0]["Month"]] = rows
        else:
            warnings.append(f"{path.name}: no project rows in PIVOT")
    return [row for m in sorted(by_month) for row in by_month[m]], warnings
