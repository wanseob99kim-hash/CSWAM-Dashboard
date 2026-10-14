"""PFE vendor list (AMPC tracking) from the ZMM009 invoice verification workbook."""
from __future__ import annotations

from pathlib import Path

from .sources import list_xlsx, load_values, text

PFE_VENDOR_SHEET = "PFE Vendor List"
PFE_COLUMNS = ["Supplier", "Name", "Category", "PFE"]
HEADER_SCAN_ROWS = 10
EXCEL_ERRORS = {"#N/A", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#NULL!", "#NUM!"}


def latest_pfe_file(folder: Path) -> Path | None:
    """Most recently modified ZMM009 invoice-verification workbook in Raw data/PFE.

    Other workbooks may sit in the folder (e.g. a sales pipeline), so files named ZMM009
    win; without one, the newest workbook that has the PFE vendor sheet is used by the caller.
    """
    files = list_xlsx(folder)
    named = [p for p in files if "zmm009" in p.name.lower()]
    files = named or files
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _clean(value) -> str:
    """Cell text; Excel error values and blanks become ''."""
    s = text(value)
    return "" if s in EXCEL_ERRORS else s


def read_pfe_vendors(path: Path) -> tuple[list[dict], list[str]]:
    """Rows of the 'PFE Vendor List' sheet as {Supplier, Name, Category, PFE} plus warnings."""
    wb = load_values(path, read_only=True)
    try:
        if PFE_VENDOR_SHEET not in wb.sheetnames:
            raise ValueError(f"{path.name}: sheet '{PFE_VENDOR_SHEET}' missing")
        rows = [list(r) for r in wb[PFE_VENDOR_SHEET].iter_rows(values_only=True)]
    finally:
        wb.close()

    header_idx = next(
        (i for i, r in enumerate(rows[:HEADER_SCAN_ROWS])
         if {"PFE", "Supplier", "Name"} <= {text(v) for v in r}),
        None,
    )
    if header_idx is None:
        raise ValueError(f"{path.name}: header row with PFE / Name / Supplier not found")
    col = {text(v): i for i, v in enumerate(rows[header_idx]) if text(v)}

    def get(row: list, name: str):
        i = col.get(name)
        return row[i] if i is not None and i < len(row) else None

    vendors: list[dict] = []
    warnings: list[str] = []
    for row in rows[header_idx + 1:]:
        name = _clean(get(row, "Name"))
        if not name:
            continue
        code = get(row, "Supplier")
        vendor = {
            "Supplier": str(int(code)) if isinstance(code, (int, float)) else _clean(code),
            "Name": name,
            "Category": _clean(get(row, "Category")),
            "PFE": _clean(get(row, "PFE")),
        }
        if not vendor["Category"]:
            warnings.append(f"PFE 벤더 '{name}': Category 비어있음 (원본 #N/A 등)")
        if vendor["PFE"] not in ("PFE", "Non-PFE"):
            warnings.append(f"PFE 벤더 '{name}': PFE 구분 값이 '{vendor['PFE']}'")
        vendors.append(vendor)
    return vendors, warnings
