"""Closing Package (1-4 P&L, 1-5 BS) -> monthly FS rows."""
from __future__ import annotations

from pathlib import Path

from .sources import find_sheet, list_xlsx, load_values, month_from_name, number, text

FS_COLUMNS = [
    "Month", "CurrentAssets", "TotalAssets", "CurrentLiabilities", "TotalLiabilities",
    "Equity", "Cash", "TradeReceivables", "Inventories", "TradePayables",
    "ShortTermDebt", "LongTermDebt", "Sales", "COGS", "OperatingProfit", "SGAExpenses",
    "NonOpIncome", "NonOpExpense", "NetIncome", "MaterialCost", "LaborCost",
    "MfgOverhead", "EBITDA",
]

# P&L totals sit in column B, COGS components in column C
PL_ROWS_B = {
    "Sales": "Sales", "COGS": "COGS", "SGAExpenses": "SG&A",
    "OperatingProfit": "Operating Income", "EBITDA": "EBITDA",
    "NonOpIncome": "Non-Operating Income", "NonOpExpense": "Non-Operating Expense",
    "NetIncome": "Net Income",
}
PL_ROWS_C = {"MaterialCost": "Material", "LaborCost": "Labor", "MfgOverhead": "Overhead"}

# BS "SUM" rows: column D English label after stripping "I. " / "(2) " prefixes
BS_SUM_ROWS = {
    "CurrentAssets": {"current assets"},
    "TotalAssets": {"total assets"},
    "CurrentLiabilities": {"current liabilities"},
    "NonCurrentLiabilities": {"non-current liability", "non-current liabilities"},
    "Inventories": {"inventories"},
}
# BS GCoA account codes in column B
BS_GCOA_ROWS = {
    "Cash": "110100", "TradeReceivables": "110500", "TradePayables": "210200",
    "ShortTermDebt": "210500", "LongTermDebt": "230300",
}
HEADER_SCAN_ROWS = 15
HEADER_SCAN_COLS = 40
MIN_SALES = 1.0


def normalize_bs_label(label: str) -> str:
    """'I. Current Assets' -> 'current assets', '(2) Inventories' -> 'inventories'."""
    s = label.strip().lower()
    if s.startswith("("):
        pos = s.find(") ")
        if pos >= 0:
            s = s[pos + 2:]
    else:
        pos = s.find(". ")
        if 0 <= pos <= 5:
            s = s[pos + 2:]
    return s.strip()


def jan_column(ws) -> int:
    for r in range(1, HEADER_SCAN_ROWS + 1):
        for c in range(1, HEADER_SCAN_COLS + 1):
            if text(ws.cell(r, c).value) == "Jan":
                return c
    raise ValueError(f"{ws.title}: 'Jan' month header not found")


def label_row(ws, col: int, label: str) -> int:
    """First row whose column equals label (trimmed, case-insensitive); 0 if absent."""
    wanted = label.lower()
    for r in range(1, ws.max_row + 1):
        if text(ws.cell(r, col).value).lower() == wanted:
            return r
    return 0


def bs_rows(ws) -> dict[str, int]:
    found: dict[str, int] = {}
    for r in range(1, ws.max_row + 1):
        code = text(ws.cell(r, 2).value)
        if code == "SUM":
            tag = normalize_bs_label(text(ws.cell(r, 4).value))
            for key, names in BS_SUM_ROWS.items():
                if key not in found and tag in names:
                    found[key] = r
        else:
            for key, gcoa in BS_GCOA_ROWS.items():
                if key not in found and code in (gcoa, f"{gcoa}.0"):
                    found[key] = r
    return found


def parse_closing_pkg(path: Path) -> dict[str, dict]:
    """Rows keyed by 'YYYY-MM' for every month with sales in this package."""
    month = month_from_name(path.name)
    if not month:
        raise ValueError(f"{path.name}: no _YYYY.MM. in file name")
    year = month[:4]

    wb = load_values(path)
    pl, bs = find_sheet(wb, "1-4"), find_sheet(wb, "1-5")
    if pl is None or bs is None:
        raise ValueError(f"{path.name}: sheet 1-4 or 1-5 missing")

    pl_rows = {k: label_row(pl, 2, v) for k, v in PL_ROWS_B.items()}
    pl_rows.update({k: label_row(pl, 3, v) for k, v in PL_ROWS_C.items()})
    if not pl_rows["Sales"]:
        raise ValueError(f"{path.name}: 'Sales' row not found in {pl.title}")
    b_rows = bs_rows(bs)
    missing = [k for k, v in pl_rows.items() if not v] + [
        k for k in list(BS_SUM_ROWS) + list(BS_GCOA_ROWS) if k not in b_rows
    ]
    if missing:
        raise ValueError(f"{path.name}: rows not found: {', '.join(missing)}")

    pl_jan, bs_jan = jan_column(pl), jan_column(bs)
    out: dict[str, dict] = {}
    for mi in range(12):
        pl_val = lambda key: number(pl.cell(pl_rows[key], pl_jan + mi).value)  # noqa: E731
        bs_val = lambda key: number(bs.cell(b_rows[key], bs_jan + mi).value)  # noqa: E731
        sales = pl_val("Sales")
        if abs(sales) < MIN_SALES:
            continue
        cur_liab = bs_val("CurrentLiabilities")
        tot_liab = cur_liab + bs_val("NonCurrentLiabilities")
        tot_assets = bs_val("TotalAssets")
        key = f"{year}-{mi + 1:02d}"
        out[key] = {
            "Month": key,
            "CurrentAssets": bs_val("CurrentAssets"),
            "TotalAssets": tot_assets,
            "CurrentLiabilities": cur_liab,
            "TotalLiabilities": tot_liab,
            "Equity": tot_assets - tot_liab,
            **{k: bs_val(k) for k in ("Cash", "TradeReceivables", "Inventories",
                                      "TradePayables", "ShortTermDebt", "LongTermDebt")},
            **{k: pl_val(k) for k in PL_ROWS_B},
            **{k: pl_val(k) for k in PL_ROWS_C},
        }
    return out


def build_fs_rows(folder: Path) -> tuple[list[dict], list[str]]:
    """FS rows from every package (newest package wins per month) + warnings."""
    by_month: dict[str, dict] = {}
    warnings: list[str] = []
    for path in list_xlsx(folder):
        try:
            by_month.update(parse_closing_pkg(path))
        except ValueError as exc:
            warnings.append(str(exc))
    return [by_month[m] for m in sorted(by_month)], warnings
