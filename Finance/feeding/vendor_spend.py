"""Total spend per vendor from the FBL1N vendor line items (Vendor tab 'Top 10 by Total Spend').

Spend = net amount of invoice documents: invoices are credits (negative), credit memos debits,
so spend = -(sum of amounts). Payment / clearing documents (AB, KZ, T4, KX …) are left out.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from pathlib import Path

from .sources import load_values, number, text

SPEND_DOC_TYPES = {"RE", "KR", "KG", "SA", "AX", "TX"}
SPEND_COLUMNS = ["Supplier", "Name", "TermsCode", "Terms", "Amount"]
ACCOUNT_HEADERS = ("Account", "Vendor")
TYPE_HEADERS = ("Document Type", "Type")
AMOUNT_HEADERS = ("Amount in local currency", "Amount in local curr", "Amt in loc.cur.")
TERMS_HEADERS = ("Terms of Payment", "Payt Terms")
PAYMENT_TERM_SHEET = "payment term"
VENDOR_CODE = re.compile(r"^\d+$")


def _col(header: list[str], names: tuple[str, ...]) -> int | None:
    lowered = [h.lower() for h in header]
    for n in names:
        if n.lower() in lowered:
            return lowered.index(n.lower())
    return None


def read_payment_terms(path: Path) -> dict[str, str]:
    """{code: description} from the 'Payment Term' sheet (two columns, no header); {} if absent."""
    wb = load_values(path, read_only=True)
    try:
        ws = next((w for w in wb.worksheets if w.title.strip().lower() == PAYMENT_TERM_SHEET), None)
        rows = list(ws.iter_rows(max_col=2, values_only=True)) if ws is not None else []
    finally:
        wb.close()
    return {text(r[0]): text(r[1]) for r in rows if r and text(r[0])}


def vendor_spend(table: list[list], names: dict[str, str], terms: dict[str, str]) -> list[dict]:
    """Spend per vendor account (largest first) from the Vendor sheet table (header row first)."""
    if not table:
        return []
    header = [text(h) for h in table[0]]
    ac, tc, mc = _col(header, ACCOUNT_HEADERS), _col(header, TYPE_HEADERS), _col(header, AMOUNT_HEADERS)
    pc = _col(header, TERMS_HEADERS)
    if ac is None or tc is None or mc is None:
        return []
    spend: dict[str, float] = defaultdict(float)
    term_use: dict[str, Counter] = defaultdict(Counter)
    for row in table[1:]:
        account = text(row[ac]) if ac < len(row) else ""
        account = account[:-2] if account.endswith(".0") else account
        if not VENDOR_CODE.match(account) or text(row[tc]) not in SPEND_DOC_TYPES:
            continue
        spend[account] -= number(row[mc]) if mc < len(row) else 0.0
        if pc is not None and pc < len(row) and text(row[pc]):
            term_use[account][text(row[pc])] += 1
    out = []
    for account, amount in spend.items():
        code = term_use[account].most_common(1)[0][0] if term_use[account] else ""
        out.append({"Supplier": account, "Name": names.get(account, account), "TermsCode": code,
                    "Terms": terms.get(code, code), "Amount": round(amount, 2)})
    out.sort(key=lambda r: r["Amount"], reverse=True)
    return out
