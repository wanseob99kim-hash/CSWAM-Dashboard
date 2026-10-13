"""Locate raw input files under the dashboard folder."""
from __future__ import annotations

import re
import warnings
from pathlib import Path

import openpyxl
from openpyxl.reader import workbook as _wb_reader

RAW_DIR_NAME = "Raw data"
MONTH_IN_NAME = re.compile(r"_(\d{4})\.(\d{2})(?=[._ ])")


def data_dir(base: Path, name: str) -> Path | None:
    """First folder holding .xlsx files: Raw data/<name>[/<name>] or <name>[/<name>]."""
    candidates = [
        base / RAW_DIR_NAME / name,
        base / RAW_DIR_NAME / name / name,
        base / name,
        base / name / name,
    ]
    for folder in candidates:
        if folder.is_dir() and list_xlsx(folder):
            return folder
    return None


def list_xlsx(folder: Path) -> list[Path]:
    """Sorted .xlsx files in folder, Excel lock files excluded."""
    files = [p for p in folder.glob("*.xlsx") if not p.name.startswith("~$")]
    return sorted(files, key=lambda p: p.name.lower())


def month_from_name(name: str) -> str | None:
    """'..._2026.08.xlsx' -> '2026-08'."""
    m = MONTH_IN_NAME.search(name)
    return f"{m.group(1)}-{m.group(2)}" if m else None


def load_values(path: Path) -> openpyxl.Workbook:
    """Open a workbook with cached cell values.

    Some exports carry broken defined names (e.g. print titles '#N/A') that make
    openpyxl refuse the file; names are irrelevant here, so retry without them.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            return openpyxl.load_workbook(path, data_only=True)
        except ValueError:
            pass  # broken defined names — retry below
        except Exception as exc:  # corrupt / not an xlsx: report per file, keep the run going
            raise ValueError(f"{path.name}: 파일 열기 실패 ({exc})") from exc
        original = _wb_reader.WorkbookParser.assign_names
        _wb_reader.WorkbookParser.assign_names = lambda self: None
        try:
            return openpyxl.load_workbook(path, data_only=True)
        except Exception as exc:
            raise ValueError(f"{path.name}: 파일 열기 실패 ({exc})") from exc
        finally:
            _wb_reader.WorkbookParser.assign_names = original


def find_sheet(wb: openpyxl.Workbook, needle: str):
    """First worksheet whose name contains needle (case-insensitive)."""
    for ws in wb.worksheets:
        if needle.lower() in ws.title.lower():
            return ws
    return None


def text(value) -> str:
    """Cell value as trimmed text; '' for empty."""
    return "" if value is None else str(value).strip()


def number(value) -> float:
    """Numeric cell value; 0 for empty, text or error values."""
    if isinstance(value, bool):
        return 0.0
    return float(value) if isinstance(value, (int, float)) else 0.0
