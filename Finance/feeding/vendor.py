"""SAP FBL1N vendor line items -> Vendor sheet."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .sources import list_xlsx, load_values, text

DOC_NO_HEADERS = {"Document Number", "DocumentNo"}
POSTING_HEADERS = {"Posting Date", "Pstng Date"}
HEADER_SCAN_ROWS = 20


def latest_vendor_file(folder: Path | None, fallback: Path) -> Path | None:
    """Most recently modified vendor line-item file in Raw data/Vendor, else <base>/vendor.xlsx.

    The folder also holds the GL line items (used for categories), so 'GL …' workbooks are skipped.
    """
    files = [p for p in list_xlsx(folder) if not p.name.upper().startswith("GL")] if folder else []
    if files:
        return max(files, key=lambda p: p.stat().st_mtime)
    return fallback if fallback.is_file() else None


def read_vendor_table(path: Path) -> list[list]:
    """Header row + data rows; columns with an empty header (FBL1N icon columns) dropped."""
    ws = load_values(path).worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    header_idx = next(
        (i for i, r in enumerate(rows[:HEADER_SCAN_ROWS])
         if any(text(v) in DOC_NO_HEADERS for v in r)),
        None,
    )
    if header_idx is None:
        raise ValueError(f"{path.name}: 'Document Number' header not found")

    header = rows[header_idx]
    keep = [i for i, h in enumerate(header) if text(h)]
    table = [[row[i] if i < len(row) else None for i in keep] for row in rows[header_idx:]]
    return [table[0]] + [r for r in table[1:] if any(v not in (None, "") for v in r)]


VENDOR_NAME_SHEET = "vendor list"  # sheet with Name / Supplier columns (optional)


def read_vendor_names(path: Path) -> list[dict]:
    """{Supplier, Name} rows from the workbook's 'Vendor list' sheet; [] when it has none."""
    wb = load_values(path, read_only=True)
    try:
        ws = next((w for w in wb.worksheets if w.title.strip().lower() == VENDOR_NAME_SHEET), None)
        rows = [list(r) for r in ws.iter_rows(values_only=True)] if ws is not None else []
    finally:
        wb.close()
    if not rows:
        return []
    header = [text(h) for h in rows[0]]
    if "Name" not in header or "Supplier" not in header:
        return []
    ni, si = header.index("Name"), header.index("Supplier")
    names: list[dict] = []
    for r in rows[1:]:
        code, name = r[si] if si < len(r) else None, text(r[ni]) if ni < len(r) else ""
        code = str(int(code)) if isinstance(code, (int, float)) else text(code)
        if code and name:
            names.append({"Supplier": code, "Name": name})
    return names


def max_posting_date(table: list[list]) -> datetime | None:
    header = [text(h) for h in table[0]]
    idx = next((i for i, h in enumerate(header) if h in POSTING_HEADERS), None)
    if idx is None:
        return None
    dates = [d for d in (_as_date(r[idx]) for r in table[1:]) if d]
    return max(dates) if dates else None


def _as_date(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y.%m.%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(text(value), fmt)
        except ValueError:
            continue
    return None
