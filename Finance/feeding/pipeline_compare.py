"""Sales Pipeline vs SAP: per-section revenue and material cost by project.

SAP side   — Closing Package sheet '1-7. COGS Detail': one row per project and month with
             QTY (sections), Sales Revenue, Steel plate, Flange, Internal, Aluminum (USD).
             Summed over the months and divided by the summed QTY → USD per section.
Pipeline   — Sales Pipeline workbook, 'MPP Invocing' sheet: Rev (K USD) / Sec and the ASP
             (+ handling) per section for Plate, Flange, Internal and Door Frame (USD).
Door Frame — the pipeline's Door Frame is SAP's Aluminum.
"""
from __future__ import annotations

import re
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from .sources import list_xlsx, load_values, number, text

METRICS = ["Revenue", "Steel", "Flange", "Internal", "DoorFrame", "Paint"]
MATERIALS = ["Steel", "Flange", "Internal", "DoorFrame", "Paint"]   # Material Total = sum of these
OPTIONAL_METRICS = {"Paint"}   # older pipeline / package layouts may not have it
COMPARE_COLUMNS = (["Customer", "Project", "SapProjects", "PipelineSections", "SapSections"]
                   + [f"{m}_{side}" for m in METRICS for side in ("Pipeline", "SAP")])

SAP_SHEET = re.compile(r"^1-7")
SAP_HEADER = "PJT Name"
SAP_COLUMNS = {"Revenue": "Sales Revenue", "Steel": "Steel plate", "Flange": "Flange",
               "Internal": "Internal", "DoorFrame": "Aluminum", "Paint": "Paint"}

MPP_SHEET = re.compile(r"MPP\s*Invo", re.IGNORECASE)   # the workbook spells it 'MPP Invocing'
# Column names differ between pipeline versions (Jan: 'ASP_Plate', Oct: 'Plate/Sec'), so each
# column lists every known spelling.
MPP_REVENUE_K = re.compile(r"^Rev.*(K USD.*Sec|Sec.*K USD)", re.IGNORECASE)
MPP_SECTIONS = re.compile(r"^(No of Sec\s*\(Act\)|Act Sec)$", re.IGNORECASE)
MPP_COST_COLUMNS = {   # column groups summed per metric (USD per section); first group = unit price
    "Steel": (("ASP_Plate", "Plate/Sec"), ("Steel Handling", "Steel Handling/Sec")),
    "Flange": (("ASP_Flange", "Flange/Sec"), ("Flange_Handling", "Flange Handling/Sec")),
    "Internal": (("ASP_Internal", "Internal/Sec"), ("Internal Hanling", "Internal Handling/Sec")),
    "DoorFrame": (("ASP_Door Frame", "Door Frame/Sec"), ("D/F Handling", "D/F Handling/Sec")),
    # Paint = paint + zinc wire (metalizing) + their shared handling, like SAP's Paint sub material
    "Paint": (("ASP_Paint", "Paint/Sec"), ("ASP_Zinc Wire", "Zinc Wire/Sec"),
              ("Paint_Zinc Handling", "Paint_Zinc Handling/Sec")),
}
PIPELINE_NAME = re.compile(r"pipeline", re.IGNORECASE)
PIPELINE_FOLDER = "Sales Pipeline"   # Raw data/Sales Pipeline (moved from PFE on 2026-10-14)
HEADER_SCAN_ROWS = 10
MAX_BLANK_ROWS = 10

# Pipeline rows that are not a specific project are skipped unless listed in PROJECT_OVERRIDES
PLACEHOLDER = re.compile(r"forecast", re.IGNORECASE)
# Pipeline names that do not match the SAP project name; checked against section counts
# (pipeline plan vs SAP QTY) on 2026-10-14. An empty list = no SAP project (yet).
PROJECT_OVERRIDES = {
    "2026 GE 114m Forecast": ["4Q25 114M G920"],   # Jan pipeline name, confirmed by the user
    "GE11402MW60CWEG920": ["4Q25 114M G920"],      # Oct pipeline name (40 sections in March)
    "2026 Xcel-Hale": ["HALE - 2T"],
    "2026 Xcel-Coutenay": ["COUTENAY - 1T"],
    "2027 Highland126S": [],                       # 2027 project, December start
}
TABLE_END = "total"   # the sheet holds a second table below the first 'Total' row
NAME_MATCH_MIN = 0.85


# ---------- SAP (Closing Package 1-7)
def read_sap_project_costs(path: Path) -> dict[str, dict[str, float]]:
    """{SAP project: {'QTY': sections, metric: USD total}} summed over all months of the package."""
    wb = load_values(path, read_only=True)
    try:
        ws = next((w for w in wb.worksheets if SAP_SHEET.match(w.title.strip())), None)
        if ws is None:
            raise ValueError(f"{path.name}: sheet '1-7. COGS Detail' missing")
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    finally:
        wb.close()
    head = next((i for i, r in enumerate(rows) if SAP_HEADER in [text(v) for v in r]), None)
    if head is None or head + 1 >= len(rows):
        raise ValueError(f"{path.name}: '{SAP_HEADER}' header not found in 1-7 sheet")
    top = [text(v) for v in rows[head]]
    sub = [text(v) for v in rows[head + 1]]
    pc, qc = top.index(SAP_HEADER), top.index("QTY") if "QTY" in top else None
    cols = {m: sub.index(name) for m, name in SAP_COLUMNS.items() if name in sub}
    required = [name for m, name in SAP_COLUMNS.items() if m not in OPTIONAL_METRICS]
    if qc is None or any(name not in sub for name in required):
        raise ValueError(f"{path.name}: 1-7 sheet columns QTY / {', '.join(required)} not all found")
    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in rows[head + 2:]:
        project = text(r[pc]) if pc < len(r) else ""
        if not project:
            continue
        totals[project]["QTY"] += number(r[qc])
        for m, c in cols.items():
            totals[project][m] += number(r[c]) if c < len(r) else 0.0
    return {p: dict(v) for p, v in totals.items()}


# ---------- Pipeline (MPP Invoicing)
def find_pipeline_file(folders: list[Path]) -> Path | None:
    files = [p for f in folders if f for p in list_xlsx(f) if PIPELINE_NAME.search(p.name)]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def read_pipeline_unit_values(path: Path) -> list[dict]:
    """Rows of the MPP sheet: customer, project, sections and per-section USD values."""
    wb = load_values(path, read_only=True)
    try:
        ws = next((w for w in wb.worksheets if MPP_SHEET.search(w.title)), None)
        if ws is None:
            raise ValueError(f"{path.name}: 'MPP Invoicing' sheet not found")
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    finally:
        wb.close()
    head = next((i for i, r in enumerate(rows[:HEADER_SCAN_ROWS])
                 if [text(v) for v in r[:2]] == ["Customer", "Project Name"]), None)
    if head is None:
        raise ValueError(f"{path.name}: 'Customer / Project Name' header not found in MPP sheet")
    # labels sit on the header row and the row below it
    labels: dict[str, int] = {}
    for r in rows[head:head + 2]:
        for i, v in enumerate(r):
            if text(v) and text(v) not in labels:
                labels[text(v)] = i
    find = lambda pattern: next((i for name, i in labels.items() if pattern.search(name)), None)  # noqa: E731
    rev_col, sec_col = find(MPP_REVENUE_K), find(MPP_SECTIONS)
    if rev_col is None:
        raise ValueError(f"{path.name}: 'Rev (K USD) / Sec' column not found")
    def first(names: tuple[str, ...]) -> int | None:
        return next((labels[n] for n in names if n in labels), None)

    cost_cols = {m: [first(names) for names in groups] for m, groups in MPP_COST_COLUMNS.items()}
    missing = [MPP_COST_COLUMNS[m][0][0] for m, cs in cost_cols.items()
               if cs[0] is None and m not in OPTIONAL_METRICS]
    if missing:
        raise ValueError(f"{path.name}: MPP columns not found: {', '.join(missing)}")

    out: list[dict] = []
    blanks = 0
    for r in rows[head + 1:]:
        project = text(r[1]) if len(r) > 1 else ""
        if project.lower() == TABLE_END:
            break
        if not project or project == "Project Name":
            blanks += 1
            if blanks > MAX_BLANK_ROWS:
                break
            continue
        blanks = 0
        cell = lambda c: number(r[c]) if c is not None and c < len(r) else 0.0  # noqa: E731
        row = {"Customer": text(r[0]), "Project": project, "Sections": cell(sec_col),
               "Revenue": cell(rev_col) * 1000}
        for metric, cs in cost_cols.items():
            row[metric] = sum(cell(c) for c in cs)
        out.append(row)
    return out


# ---------- matching and comparison
def _base_name(name: str) -> str:
    """'2026 Alle Cat II' → 'ALLE CAT II', 'ALLE CATT II 13T' → 'ALLE CATT II'."""
    s = re.sub(r"^\s*20\d\d\s+", "", name.upper())
    s = re.sub(r"\s*-?\s*\d+\s*[A-Z]?$", "", s.strip())
    return re.sub(r"[^A-Z0-9 ]", "", s).strip()


def match_sap_projects(pipeline_name: str, sap_names: list[str]) -> list[str]:
    """SAP projects belonging to a pipeline project (all phases, e.g. BUFFALO GAP 100T and 2T)."""
    if pipeline_name in PROJECT_OVERRIDES:
        return list(PROJECT_OVERRIDES[pipeline_name])
    if PLACEHOLDER.search(pipeline_name):
        return []
    base = _base_name(pipeline_name)
    return [s for s in sap_names
            if _base_name(s) == base or SequenceMatcher(None, _base_name(s), base).ratio() >= NAME_MATCH_MIN]


def compare(pipeline_rows: list[dict], sap: dict[str, dict[str, float]]) -> tuple[list[dict], list[str]]:
    """One row per pipeline project with Pipeline and SAP values per section (None = no data)."""
    out, skipped = [], []
    sap_names = list(sap)
    for p in pipeline_rows:
        matched = match_sap_projects(p["Project"], sap_names)
        if not matched and PLACEHOLDER.search(p["Project"]):
            skipped.append(p["Project"])
            continue
        qty = sum(sap.get(s, {}).get("QTY", 0.0) for s in matched)
        row = {"Customer": p["Customer"], "Project": p["Project"],
               "SapProjects": ", ".join(matched), "PipelineSections": p["Sections"], "SapSections": qty}
        for m in METRICS:
            row[f"{m}_Pipeline"] = round(p[m], 2) if p[m] else None
            total = sum(sap.get(s, {}).get(m, 0.0) for s in matched)
            has_sap = any(m in sap.get(s, {}) for s in matched)
            row[f"{m}_SAP"] = round(total / qty, 2) if qty and has_sap else None
        out.append(row)
    return out, skipped
