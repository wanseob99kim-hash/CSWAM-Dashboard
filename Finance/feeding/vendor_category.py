"""Vendor category from the GL line items (Vendor tab tables).

Each vendor's invoice documents are looked up by Document Number in the GL line items;
the debit account carrying the most money is the vendor's cost account and its GL name
becomes the category. Clearing / variance / balance-sheet accounts say nothing about what
was bought (GR/IR, purchase price difference, asset clearing, liabilities), so they are
skipped — a vendor with only those lines gets no cost category, and the dashboard falls
back to: rule below → known category (tracked vendors, PFE list) → material type from GR/IR.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from pathlib import Path

from .sources import list_xlsx, load_values, number, text
from .vendor_spend import SPEND_DOC_TYPES, VENDOR_CODE

GL_LINES_SHEET = "gl line item"
GL_NAME_SHEET = "gl name"
GL_FILE_NAME = re.compile(r"\bGL\b.*line", re.IGNORECASE)
NOT_A_COST = re.compile(r"GR/IR|purchase price diff|clearing", re.IGNORECASE)
GRIR = re.compile(r"GR/IR clearing-(.+)", re.IGNORECASE)
BALANCE_SHEET_PREFIXES = ("1", "2")   # assets and liabilities
COST_SHARE_MIN = 0.5   # cost accounts must carry at least half of the debit amount (else it is a material vendor)

# Used only when the GL gives no cost account (user rule, 2026-10-14)
CATEGORY_RULES = {
    "105477": "Logistics",      # OTA AMERICA, INC
    "106088": "Customs Duty",   # OTA AMERICA, INC. (CUSTOMS)
}
# Short display names for long GL account names (prefix match, user request 2026-10-14)
CATEGORY_RENAMES = (
    ("Insurance expense", "Insurance"),
)
CATEGORY_COLUMNS = ["Supplier", "CostCategory", "RuleCategory", "MaterialCategory"]


def display_category(gl_name: str) -> str:
    """GL account name shown as a category, shortened where a rename rule applies."""
    for prefix, short in CATEGORY_RENAMES:
        if gl_name.lower().startswith(prefix.lower()):
            return short
    return gl_name


def find_gl_file(folder: Path | None) -> Path | None:
    """Newest 'GL Line item' workbook in Raw data/Vendor."""
    files = [p for p in list_xlsx(folder) if GL_FILE_NAME.search(p.stem)] if folder else []
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _is_cost_account(account: str, name: str) -> bool:
    return bool(account) and not account.startswith(BALANCE_SHEET_PREFIXES) and not NOT_A_COST.search(name)


def vendor_documents(table: list[list]) -> dict[str, str]:
    """{document number: vendor account} for the invoice documents in the Vendor sheet table."""
    header = [text(h).lower() for h in table[0]] if table else []
    try:
        ac, tc, dc = header.index("account"), header.index("document type"), header.index("document number")
    except ValueError:
        return {}
    docs: dict[str, str] = {}
    for row in table[1:]:
        account = text(row[ac])
        account = account[:-2] if account.endswith(".0") else account
        if VENDOR_CODE.match(account) and text(row[tc]) in SPEND_DOC_TYPES:
            docs.setdefault(text(row[dc]), account)
    return docs


def vendor_categories(gl_path: Path, docs: dict[str, str]) -> list[dict]:
    """One row per vendor: cost-account category, rule category, material type (blank when unknown)."""
    wb = load_values(gl_path, read_only=True)
    try:
        sheets = {w.title.strip().lower(): w for w in wb.worksheets}
        if GL_LINES_SHEET not in sheets:
            raise ValueError(f"{gl_path.name}: sheet 'GL Line item' missing")
        names: dict[str, str] = {}
        if GL_NAME_SHEET in sheets:
            for r in sheets[GL_NAME_SHEET].iter_rows(min_row=2, max_col=2, values_only=True):
                if r and r[0] is not None:
                    code = str(int(r[0])) if isinstance(r[0], (int, float)) else text(r[0])
                    names[code] = text(r[1])
        rows = sheets[GL_LINES_SHEET].iter_rows(values_only=True)
        header = [text(h) for h in next(rows, [])]
        ga, gd, gm = header.index("Account"), header.index("Document Number"), header.index("Amount in local currency")
        cost: dict[str, Counter] = defaultdict(Counter)
        material: dict[str, Counter] = defaultdict(Counter)
        debit: dict[str, float] = defaultdict(float)
        for r in rows:
            vendor = docs.get(text(r[gd])) if r else None
            amount = number(r[gm]) if vendor else 0.0
            if amount <= 0:
                continue  # only debit lines describe what the invoice was for
            debit[vendor] += amount
            account = text(r[ga])
            account = account[:-2] if account.endswith(".0") else account
            name = names.get(account, account)
            if _is_cost_account(account, name):
                cost[vendor][name] += amount
            elif m := GRIR.match(name):
                material[vendor][m.group(1).strip().title()] += amount
    finally:
        wb.close()

    out = []
    for vendor in sorted(set(docs.values())):
        out.append({
            "Supplier": vendor,
            "CostCategory": (display_category(cost[vendor].most_common(1)[0][0])
                             if debit[vendor] and sum(cost[vendor].values()) >= COST_SHARE_MIN * debit[vendor] else ""),
            "RuleCategory": CATEGORY_RULES.get(vendor, ""),
            "MaterialCategory": material[vendor].most_common(1)[0][0] if material[vendor] else "",
        })
    return out
