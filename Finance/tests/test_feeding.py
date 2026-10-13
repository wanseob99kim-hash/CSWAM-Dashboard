"""Tests for the Raw data -> dashboard_data.xlsx feeding."""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

import openpyxl
import pytest
from openpyxl.styles import Alignment

from feeding import upload as upload_mod
from feeding.__main__ import main
from feeding.build import OUTPUT_NAME, collect, write_workbook
from feeding.closing import FS_COLUMNS, normalize_bs_label, parse_closing_pkg
from feeding.forecast import pick_latest, read_forecast_block, version_of
from feeding.projects import parse_cost_analysis
from feeding.sources import data_dir, load_values, month_from_name, number
from feeding.vendor import latest_vendor_file, max_posting_date, read_vendor_table

REAL_BASE = Path(__file__).resolve().parent.parent
MONTHS = ["Jan", "Feb", "Mar"]


# ---------- builders for small synthetic workbooks ----------
def make_closing_pkg(path: Path, sales=(100.0, 200.0, 0.0)) -> Path:
    wb = openpyxl.Workbook()
    pl = wb.active
    pl.title = "1-4 P&L(COGS Components)"
    for i, m in enumerate(MONTHS):
        pl.cell(2, 5 + i, m)
    rows_b = [("Sales", sales), ("COGS", (80, 160, 0)), ("SG&A", (5, 6, 0)),
              ("Operating Income", (15, 34, 0)), ("EBITDA", (20, 40, 0)),
              ("Non-Operating Income", (1, 2, 0)), ("Non-Operating Expense", (3, 4, 0)),
              ("Net Income", (13, 32, 0))]
    r = 4
    for label, vals in rows_b:
        pl.cell(r, 2, label)
        for i, v in enumerate(vals):
            pl.cell(r, 5 + i, v)
        r += 1
    for label, vals in [("Material ", (50, 100, 0)), ("Labor", (20, 40, 0)), ("Overhead", (10, 20, 0)),
                        ("Submaterial ", (1, 1, 0))]:
        pl.cell(r, 3, label)
        for i, v in enumerate(vals):
            pl.cell(r, 5 + i, v)
        r += 1

    bs = wb.create_sheet("1-5. BS")
    for i, m in enumerate(MONTHS):
        bs.cell(7, 5 + i, m)
    bs_rows = [("SUM", "I. Current Assets", 60), ("SUM", "(2) Inventories", 25),
               (110100, "Cash", 10), (110500, "AR", 15),
               ("SUM", "II. Non-current assets held for sale", 0),
               ("SUM", "II. Non-current assets", 40), ("SUM", "Total Assets", 100),
               ("SUM", "I. Current liabilities", 30), (210200, "AP", 12), (210500, "STD", 8),
               ("SUM", "II. Non-current liabilities held for sale", 0),
               ("SUM", "III. Non-current liability", 20), (230300, "LTD", 18)]
    for r, (code, label, val) in enumerate(bs_rows, start=8):
        bs.cell(r, 2, code)
        bs.cell(r, 4, label)
        for i in range(3):
            bs.cell(r, 5 + i, val + i)
    wb.save(path)
    return path


def make_pivot(path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "PIVOT"
    rows = [("Margin Analysis 2026", None, None, None, None),
            ("Row Labels", "Qty", "Rev", "Cost", "PL"),
            ("VESTAS", 3, -300, -270, 30),
            ("  Project A", 1, -100, -90, 10),
            ("  Project B", 2, -200, -180, 20),
            ("GE", 1, -50, -60, -10),
            ("Project C", 1, -50, -60, -10),  # indented by style, not spaces
            ("Grand Total", 4, -350, -330, 20)]
    for r, row in enumerate(rows, start=1):
        for c, v in enumerate(row, start=1):
            ws.cell(r, c, v)
    ws.cell(7, 1).alignment = Alignment(indent=1)
    wb.save(path)
    return path


def make_vendor(path: Path, with_icons=True) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    header = ["Account", "Document Number", "Document Type", "Posting Date", "Amount in local currency"]
    if with_icons:
        header = [None, None] + header
    ws.append(header)
    pad = [None, None] if with_icons else []
    ws.append(pad + [103270, 510001, "RE", datetime(2026, 8, 31), -10.0])
    ws.append(pad + [103270, 510002, "RE", datetime(2026, 7, 1), -5.0])
    ws.append([None] * len(header))
    wb.save(path)
    return path


def make_forecast(path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1.P&L_Summary"
    ws.cell(4, 2, "2026 Rolling")
    ws.cell(4, 15, "2+10")
    for i, m in enumerate(MONTHS):
        ws.cell(5, 3 + i, m)
    ws.cell(6, 2, "Sales Rev")
    ws.cell(6, 3, 111)
    wb.save(path)
    return path


@pytest.fixture
def raw_base(tmp_path: Path) -> Path:
    raw = tmp_path / "Raw data"
    for name in ("Financials", "Projects", "Forecast", "Vendor"):
        (raw / name).mkdir(parents=True)
    make_closing_pkg(raw / "Financials" / "CSWAM New Monthly Closing Pkg_2026.02.xlsx")
    make_pivot(raw / "Projects" / "Cost Analysis based on Project_2026.01.xlsx")
    make_pivot(raw / "Projects" / "Cost Analysis based on Project_2026.02.xlsx")
    make_forecast(raw / "Forecast" / "CSWAM Rolling FCST 1+11.xlsx")
    make_forecast(raw / "Forecast" / "CSWAM Rolling FCST 2+10.xlsx")
    make_vendor(raw / "Vendor" / "fbl1n.xlsx")
    return tmp_path


# ---------- unit ----------
@pytest.mark.parametrize("label,expected", [
    ("I. Current Assets", "current assets"),
    ("Ⅰ. Current liabilities", "current liabilities"),
    ("(2) Inventories", "inventories"),
    ("Total Assets", "total assets"),
    ("II. Non-current assets", "non-current assets"),
])
def test_normalize_bs_label(label, expected):
    assert normalize_bs_label(label) == expected


def test_month_from_name():
    assert month_from_name("CSWAM New Monthly Closing Pkg_2026.08.xlsx") == "2026-08"
    assert month_from_name("CSWAM New Monthly Closing Pkg_2026.08_rev1.xlsx") == "2026-08"
    assert month_from_name("vendor.xlsx") is None


def test_load_values_reports_corrupt_file(tmp_path):
    bad = tmp_path / "Pkg_2026.01.xlsx"
    bad.write_bytes(b"not a zip")
    with pytest.raises(ValueError, match="파일 열기 실패"):
        load_values(bad)


def test_closing_pkg_without_jan_header_is_rejected(tmp_path):
    path = make_closing_pkg(tmp_path / "Pkg_2026.02.xlsx")
    wb = openpyxl.load_workbook(path)
    wb["1-4 P&L(COGS Components)"].cell(2, 5, "January")
    wb.save(path)
    with pytest.raises(ValueError, match="Jan"):
        parse_closing_pkg(path)


def test_text_posting_dates_are_parsed():
    table = [["Posting Date"], ["2026-08-31"], ["08/15/2026"], [None]]
    assert max_posting_date(table) == datetime(2026, 8, 31)


def test_upload_never_follows_redirects():
    handler = upload_mod._NoRedirect()
    assert handler.redirect_request(None, None, 302, "", {}, "https://elsewhere/") is None


def test_empty_vendor_folder_warns_about_fallback(raw_base):
    for f in (raw_base / "Raw data" / "Vendor").glob("*.xlsx"):
        f.unlink()
    make_vendor(raw_base / "vendor.xlsx", with_icons=False)
    res = collect(raw_base)
    assert any("Raw data/Vendor 비어있음" in w for w in res.warnings)


def test_number_ignores_text_and_bool():
    assert number("abc") == 0 and number(None) == 0 and number(True) == 0 and number(3) == 3.0


def test_pick_latest_forecast_uses_highest_n_and_rev_on_tie():
    names = ["CSWAM Rolling FCST 1+11.xlsx", "CSWAM Rolling FCST 10+2.xlsx",
             "CSWAM Rolling FCST 8+4.xlsx", "CSWAM Rolling FCST 10+2_rev1.xlsx"]
    assert pick_latest([Path(n) for n in names]).name == "CSWAM Rolling FCST 10+2_rev1.xlsx"
    assert pick_latest([Path("other.xlsx")]) is None
    assert version_of(Path("CSWAM Rolling FCST 8+4_rev1.xlsx")) == "8+4"


def test_parse_closing_pkg_maps_rows(tmp_path):
    rows = parse_closing_pkg(make_closing_pkg(tmp_path / "Pkg_2026.02.xlsx"))
    assert list(rows) == ["2026-01", "2026-02"]  # March has no sales
    jan = rows["2026-01"]
    assert jan["CurrentAssets"] == 60          # not the "Non-current assets" row
    assert jan["CurrentLiabilities"] == 30     # not "Non-current liability"
    assert jan["TotalLiabilities"] == 50 and jan["Equity"] == 50
    assert jan["MaterialCost"] == 50 and jan["LaborCost"] == 20 and jan["MfgOverhead"] == 10
    assert jan["EBITDA"] == 20 and jan["OperatingProfit"] == 15
    assert rows["2026-02"]["Cash"] == 11
    assert set(jan) == set(FS_COLUMNS)


def test_parse_closing_pkg_rejects_bad_name(tmp_path):
    with pytest.raises(ValueError):
        parse_closing_pkg(make_closing_pkg(tmp_path / "pkg.xlsx"))


def test_parse_cost_analysis(tmp_path):
    rows = parse_cost_analysis(make_pivot(tmp_path / "Cost Analysis based on Project_2026.08.xlsx"))
    assert [(r["Customer"], r["Project"]) for r in rows] == [
        ("VESTAS", "Project A"), ("VESTAS", "Project B"), ("GE", "Project C")]
    a = rows[0]
    assert a["Month"] == "2026-08" and a["Revenue"] == 100 and a["Cost"] == 90
    assert a["Margin"] == pytest.approx(0.1)


def test_read_vendor_table_drops_icon_columns_and_blank_rows(tmp_path):
    table = read_vendor_table(make_vendor(tmp_path / "v.xlsx"))
    assert table[0] == ["Account", "Document Number", "Document Type", "Posting Date",
                        "Amount in local currency"]
    assert len(table) == 3
    assert max_posting_date(table) == datetime(2026, 8, 31)


def test_read_vendor_table_requires_header(tmp_path):
    wb = openpyxl.Workbook()
    wb.active.append(["foo", "bar"])
    wb.save(tmp_path / "bad.xlsx")
    with pytest.raises(ValueError):
        read_vendor_table(tmp_path / "bad.xlsx")


def test_latest_vendor_file_falls_back(tmp_path):
    fallback = make_vendor(tmp_path / "vendor.xlsx", with_icons=False)
    assert latest_vendor_file(None, fallback) == fallback
    assert latest_vendor_file(None, tmp_path / "missing.xlsx") is None


def test_data_dir_prefers_raw_data(raw_base):
    assert data_dir(raw_base, "Financials") == raw_base / "Raw data" / "Financials"
    assert data_dir(raw_base, "Nothing") is None


# ---------- integration (synthetic folder) ----------
def test_collect_and_write(raw_base):
    res = collect(raw_base)
    assert res.errors == []
    assert res.fs_months == ["2026-01", "2026-02"]
    assert res.sources["Forecast"] == "CSWAM Rolling FCST 2+10.xlsx"
    assert len(res.project_rows) == 6

    out = write_workbook(res, raw_base)
    out2 = write_workbook(res, raw_base)  # second write keeps a history copy
    assert out == out2 == raw_base / OUTPUT_NAME
    assert len(list((raw_base / "_history").glob("dashboard_data_*.xlsx"))) == 1

    wb = openpyxl.load_workbook(out)
    assert wb.sheetnames == ["FS", "Vendor", "Project", "Forecast"]
    assert [c.value for c in wb["FS"][1]] == FS_COLUMNS
    assert wb["FS"]["A2"].value == "2026-01"
    assert wb["Forecast"]["B6"].value == "Sales Rev"


def test_collect_reports_missing_inputs(tmp_path):
    res = collect(tmp_path)
    assert len(res.errors) >= 4


def test_cli_check_only_does_not_write(raw_base, capsys):
    assert main(["--base", str(raw_base)]) == 0
    assert not (raw_base / OUTPUT_NAME).exists()
    assert "FS: 2개월" in capsys.readouterr().out


def test_cli_upload_without_secret_fails_cleanly(raw_base, monkeypatch):
    monkeypatch.delenv(upload_mod.SECRET_ENV, raising=False)
    assert main(["--base", str(raw_base), "--upload"]) == 2
    assert not (raw_base / OUTPUT_NAME).exists()  # nothing written when upload is impossible


def test_upload_sends_secret_header(raw_base, monkeypatch):
    sent = {}

    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class FakeOpener:
        def open(self, req, timeout):
            sent.update(dict(req.header_items()))
            return FakeResp()

    monkeypatch.setenv(upload_mod.SECRET_ENV, "k")
    monkeypatch.setattr(upload_mod, "_OPENER", FakeOpener())
    f = raw_base / "x.bin"
    f.write_bytes(b"1")
    assert "HTTP 200" in upload_mod.upload(f, "x.bin")
    assert sent["X-secret"] == "k" and sent["X-filename"] == "x.bin"


# ---------- real Raw data (skipped when absent) ----------
@pytest.mark.skipif(data_dir(REAL_BASE, "Financials") is None, reason="no Raw data")
def test_real_raw_data_is_consistent():
    res = collect(REAL_BASE)
    assert res.errors == []
    for r in res.fs_rows:
        assert abs(r["TotalAssets"] - r["TotalLiabilities"] - r["Equity"]) < 1
        assert r["CurrentAssets"] < r["TotalAssets"]
        assert r["LaborCost"] > 0 and r["MaterialCost"] > r["COGS"] * 0.5
    block, path = read_forecast_block(data_dir(REAL_BASE, "Forecast"))
    assert len(block) == 33 and path.name == res.sources["Forecast"]


def test_cli_write_creates_output(raw_base, capsys):
    assert main(["--base", str(raw_base), "--write"]) == 0
    assert (raw_base / OUTPUT_NAME).exists()
    assert "생성 완료" in capsys.readouterr().out


def test_cli_stops_on_errors(tmp_path):
    assert main(["--base", str(tmp_path), "--write"]) == 1
    assert not (tmp_path / OUTPUT_NAME).exists()
