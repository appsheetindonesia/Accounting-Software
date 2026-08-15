#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate QA test case files (TestRail CSV + tracking CSV + XLSX) dari tabel
test case di `QA Test Plan - Accounting.md`.

Output:
  qa-test-cases-testrail.csv  → format import TestRail (Case ID, Title, Section,
                                Type, Priority, Estimate, References,
                                Preconditions, Steps, Expected)
  qa-test-cases-tracker.csv   → spreadsheet pelacakan (UTF-8 BOM, Excel-friendly)
  qa-test-cases.xlsx          → workbook berformat (filter, freeze, ringkasan)
  qa-test-results-testrail.csv      → template HASIL eksekusi per run, siap
                                      di-import balik ke TestRail sebagai
                                      result (kolom Status/Comment/Elapsed/…)
  qa-test-results-template.xlsx     → worksheet eksekusi per run: dropdown
                                      Passed/Failed/Blocked, ringkasan otomatis
                                      (COUNTIF) + release gate S1

Status TestRail (default): 1=Passed, 2=Blocked, 3=Untested (default,
TIDAK bisa dikirim sebagai hasil), 4=Retest, 5=Failed. Nama status di CSV
impor harus persis: Passed, Failed, Blocked, Retest, Skipped, Untested.

Menjalankan:  python scripts/generate-qa-test-cases.py
"""
from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "QA Test Plan - Accounting.md"

# Nilai default kolom otomatis run (bisa diedit per baris di Excel)
RUN_DATE_DEFAULT = date.today().isoformat()  # 2026-08-15
ENVIRONMENT_DEFAULT = "QA Local (mock API)"

# Status yang memicu peringatan S1
OPEN_STATUSES = {"Not Run", "Fail"}

# ---------------------------------------------------------------------------
# Peta story (BW-xxx) → sprint, dari matriks traceability (QA Test Plan §5)
# ---------------------------------------------------------------------------
STORY_SPRINT: dict[str, int] = {}
for sprint, n_range in {
    1: range(1, 10),
    2: range(10, 16),
    3: range(16, 20),
    4: range(20, 25),
    5: range(25, 30),
    6: range(30, 35),
}.items():
    for n in n_range:
        STORY_SPRINT[f"BW-{n:03d}"] = sprint

SEVERITY_PRIORITY = {
    "S1": "1 - Critical",
    "S2": "2 - High",
    "S3": "3 - Medium",
    "S4": "4 - Low",
}

DEFAULT_PRECOND = "Reset data seed (mock API di-reset); login sebagai Rina (admin)"

# Preconditions khusus per test case (awalan ID)
PRECOND_OVERRIDES: dict[str, str] = {
    "TC-COA-03": "COA kosong (belum dimuat template)",
    "TC-COA-12": "COA kosong (belum dimuat template)",
    "TC-COA-13": "COA sudah terisi akun",
    "TC-PER-03": "Reset data seed; Maret 2026 masih punya 2 jurnal draft",
    "TC-PER-04": "Reset data seed; Maret 2026 masih punya 2 jurnal draft",
    "TC-PER-05": "Reset data seed; Maret 2026 sudah ditutup",
    "TC-PER-06": "Reset data seed; periode Maret 2026 sudah ditutup",
    "TC-JRN-22": "Reset data seed; periode Februari 2026 tertutup",
    "TC-APR-04": "Login sebagai Dimas (accountant) — tanpa izin approve",
    "TC-RLE-02": "Login sebagai Budi (viewer)",
    "TC-RLE-03": "Login sebagai Dimas (accountant)",
    "TC-RLE-04": "Login bergantian sebagai Rina/Dimas/Budi",
    "TC-RLE-05": "Login sebagai akuntan; entitas CV Karya Mandiri (ent-002) tersedia",
    "TC-RLE-06": "Login sebagai akuntan; data ent-001 sudah terisi",
    "TC-STT-02": "Server mock API dimatikan",
    "TC-PRF-01": "Seed 10.000 jurnal (POST /admin/seed-bulk)",
    "TC-PRF-02": "Seed 10.000 jurnal (POST /admin/seed-bulk)",
    "TC-PRF-03": "Seed 10.000 jurnal (POST /admin/seed-bulk)",
    "TC-BNK-01": "Integrasi bank nonaktif (feature flag OFF)",
    "TC-BNK-02": "Integrasi bank aktif (partner terhubung)",
    "TC-BNK-03": "Integrasi bank aktif; ada jurnal existing untuk rekonsiliasi",
    "RG-": "State seed; mock API + prototipe berjalan (localhost:4000 / :5173)",
}

# Modul spesifik per awalan ID (untuk section yang berisi banyak modul)
ID_MODULE: dict[str, str] = {
    "TC-SRC": "Pencarian Global",
    "TC-RVS": "Reverse",
    "TC-ATT": "Lampiran",
    "TC-APR": "Approval",
    "TC-ONB": "Onboarding",
    "TC-BNK": "Bank",
}

# ---------------------------------------------------------------------------
# Parsing markdown
# ---------------------------------------------------------------------------
def clean(cell: str) -> str:
    """Bersihkan sel markdown: backtick, **bold**, whitespace ekstra."""
    cell = cell.replace("`", "").replace("**", "")
    return re.sub(r"\s+", " ", cell).strip()


def header_section(line: str) -> str | None:
    """Ekstrak nama section dari header markdown (## atau ###)."""
    m = re.match(r"^##+\s+\d+\.\d+\s+(.+?)(?:\s*\(.*\))?$", line)
    if m:
        return clean(re.sub(r"—.*$", "", m.group(1)))
    m = re.match(r"^##+\s+\d+\.\s+(.+?)(?:\s*\(.*\))?$", line)
    if m:
        return clean(m.group(1))
    m = re.match(r"^###\s+(Arus Kas)", line)
    if m:
        return m.group(1)
    return None


def parse_tables() -> list[dict]:
    lines = PLAN.read_text(encoding="utf-8").splitlines()
    section = "Umum"
    records: list[dict] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].strip()
        sec = header_section(line)
        if sec:
            section = sec
            i += 1
            continue
        if not line.startswith("|"):
            i += 1
            continue

        # Kumpulkan baris tabel
        table: list[list[str]] = []
        while i < n and lines[i].strip().startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            # Abaikan baris pemisah (---)
            if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells if c.strip()):
                table.append(cells)
            i += 1

        if len(table) < 2:
            continue

        header = [clean(c) for c in table[0]]
        try:
            idx_id = header.index("ID")
            if "Test Case" in header:
                idx_title, idx_steps, idx_exp, idx_ref, idx_sev = (
                    header.index("Test Case"), header.index("Langkah"),
                    header.index("Hasil Diharapkan"), header.index("AC"),
                    header.index("Sev"),
                )
            elif "Skenario" in header:  # tabel RG-01..12
                idx_title, idx_steps, idx_exp = (
                    header.index("Skenario"), header.index("Langkah Inti"),
                    header.index("Verifikasi Kunci"),
                )
                idx_ref, idx_sev = None, None
            else:
                continue
        except ValueError:
            continue

        for row in table[1:]:
            if len(row) <= idx_id:
                continue
            cid = clean(row[idx_id])
            if not re.match(r"^(TC-|RG-)", cid):
                continue
            title = clean(row[idx_title])
            steps = clean(row[idx_steps])
            expected = clean(row[idx_exp])
            ref = clean(row[idx_ref]) if idx_ref is not None and idx_ref < len(row) else ""
            sev = clean(row[idx_sev]) if idx_sev is not None and idx_sev < len(row) else ""
            records.append({
                "id": cid,
                "title": title,
                "steps": steps,
                "expected": expected,
                "ref": ref,
                "sev": sev,
                "section": section,
            })
    return records


# ---------------------------------------------------------------------------
# Enrichment
# ---------------------------------------------------------------------------
def story_of(ref: str) -> str:
    m = re.search(r"BW-\d{3}", ref)
    return m.group(0) if m else ""


def sprint_of(ref: str) -> str:
    s = story_of(ref)
    return f"Sprint {STORY_SPRINT[s]}" if s in STORY_SPRINT else ""


def module_of(rec: dict) -> str:
    for prefix, mod in ID_MODULE.items():
        if rec["id"].startswith(prefix):
            return mod
    return rec["section"]


def precond_of(rec: dict) -> str:
    for prefix, text in PRECOND_OVERRIDES.items():
        if rec["id"].startswith(prefix):
            return text
    return DEFAULT_PRECOND


def enrich(records: list[dict]) -> list[dict]:
    for r in records:
        r["story"] = story_of(r["ref"])
        r["sprint"] = sprint_of(r["ref"])
        r["module"] = module_of(r)
        r["priority"] = SEVERITY_PRIORITY.get(r["sev"], "3 - Medium")
        r["type"] = "Regression" if r["id"].startswith("RG-") else "Functional"
        r["preconditions"] = precond_of(r)
        r["status"] = "Not Run"
        r["run_date"] = RUN_DATE_DEFAULT
        r["environment"] = ENVIRONMENT_DEFAULT
    return records


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def write_testrail_csv(records: list[dict]) -> Path:
    path = ROOT / "qa-test-cases-testrail.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Case ID", "Title", "Section", "Type", "Priority", "Estimate",
                    "References", "Preconditions", "Steps", "Expected"])
        for r in records:
            w.writerow([r["id"], r["title"], r["module"], r["type"], r["priority"],
                        "", r["story"], r["preconditions"], r["steps"], r["expected"]])
    return path


def write_tracker_csv(records: list[dict]) -> Path:
    path = ROOT / "qa-test-cases-tracker.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ID", "Modul", "Test Case", "Tipe", "Prioritas", "Severity",
                    "Story (AC)", "Sprint", "Status", "Tanggal Run", "Environment",
                    "Langkah", "Hasil Diharapkan", "Preconditions"])
        for r in records:
            w.writerow([r["id"], r["module"], r["title"], r["type"], r["priority"],
                        r["sev"], r["story"], r["sprint"], r["status"],
                        r["run_date"], r["environment"],
                        r["steps"], r["expected"], r["preconditions"]])
    return path


def write_xlsx(records: list[dict]) -> Path:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Test Cases"

    headers = ["ID", "Modul", "Test Case", "Tipe", "Prioritas", "Severity",
               "Story (AC)", "Sprint", "Status", "Tanggal Run", "Environment",
               "Langkah", "Hasil Diharapkan", "Preconditions"]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="2596BE")
    sev_fill = {
        "S1": PatternFill("solid", fgColor="FDE8E8"),
        "S2": PatternFill("solid", fgColor="FEF3C7"),
    }
    # Peringatan: baris S1 yang masih Not Run / Fail disorot merah
    warn_fill = PatternFill("solid", fgColor="FCA5A5")
    for col, _ in enumerate(headers, 1):
        c = ws.cell(row=1, column=col)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = header_fill
        c.alignment = Alignment(vertical="center")

    for r in records:
        ws.append([r["id"], r["module"], r["title"], r["type"], r["priority"],
                   r["sev"], r["story"], r["sprint"], r["status"],
                   r["run_date"], r["environment"],
                   r["steps"], r["expected"], r["preconditions"]])
        row = ws.max_row
        if r["sev"] in sev_fill:
            ws.cell(row=row, column=6).fill = sev_fill[r["sev"]]
        if r["sev"] == "S1" and r["status"] in OPEN_STATUSES:
            for col in range(1, len(headers) + 1):
                ws.cell(row=row, column=col).fill = warn_fill
            c = ws.cell(row=row, column=9)  # Status
            c.font = Font(bold=True, color="9B1C1C")
        for col in range(1, len(headers) + 1):
            ws.cell(row=row, column=col).alignment = Alignment(
                vertical="top", wrap_text=(col in (12, 13, 14)))

    widths = [14, 20, 38, 12, 14, 9, 12, 9, 11, 12, 20, 60, 60, 38]
    for col, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"

    # ---- Sheet ringkasan ----
    from collections import Counter
    ws2 = wb.create_sheet("Ringkasan")
    total = len(records)
    tc = [r for r in records if r["id"].startswith("TC-")]
    rg = [r for r in records if r["id"].startswith("RG-")]

    ws2.append(["Metrik", "Jumlah"])
    ws2.append(["Total test case", total])
    ws2.append(["  Test case fungsional (TC-*)", len(tc)])
    ws2.append(["  Skenario regresi (RG-*)", len(rg)])
    ws2.append([])
    ws2.append(["Per Modul", "Jumlah"])
    for mod, n in Counter(r["module"] for r in tc).most_common():
        if mod:
            ws2.append([mod, n])
    ws2.append([])
    ws2.append(["Per Severity", "Jumlah"])
    for sev, n in Counter(r["sev"] for r in tc).most_common():
        if sev:
            ws2.append([sev, n])
    ws2.append([])
    ws2.append(["Per Sprint", "Jumlah"])
    for sp, n in Counter(r["sprint"] for r in tc).most_common():
        if sp:
            ws2.append([sp, n])

    # ---- Peringatan S1 (Not Run / Fail) ----
    s1_all = [r for r in tc if r["sev"] == "S1"]
    s1_open = [r for r in s1_all if r["status"] in OPEN_STATUSES]
    warn_fill = PatternFill("solid", fgColor="FCA5A5")
    ws2.append([])
    ws2.append(["⚠️ PERINGATAN — Test case S1 yang belum lolos", ""])
    ws2.append([f"Total S1: {len(s1_all)} · Masih Not Run/Fail: {len(s1_open)}", ""])
    if s1_open:
        ws2.append(["ID", "Status"])
        for r in s1_open:
            ws2.append([r["id"], r["status"]])
        ws2.append([])
        ws2.append(["Blokir rilis (release gate)", "YA — selesaikan semua S1 dulu"])
    else:
        ws2.append(["Semua S1 sudah dijalankan dan lolos", "✓"])
        ws2.append([])
        ws2.append(["Blokir rilis (release gate)", "TIDAK"])
    warn_row = ws2.max_row
    for col in (1, 2):
        c = ws2.cell(row=warn_row, column=col)
        c.fill = warn_fill
        c.font = Font(bold=True)
    # Sorot header peringatan
    warn_hdr_row = next(r[0].row for r in ws2.iter_rows(min_row=1, max_row=ws2.max_row) if r[0].value and str(r[0].value).startswith("⚠️"))
    for col in (1, 2):
        ws2.cell(row=warn_hdr_row, column=col).fill = warn_fill
        ws2.cell(row=warn_hdr_row, column=col).font = Font(bold=True, color="9B1C1C")
    ws2.column_dimensions["A"].width = 30
    ws2.column_dimensions["B"].width = 20
    for row in ws2.iter_rows(min_row=1, max_row=1):
        for c in row:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = header_fill

    path = ROOT / "qa-test-cases.xlsx"
    wb.save(path)
    return path


def write_results_csv(records: list[dict]) -> Path:
    """Template hasil eksekusi per run — siap di-import balik ke TestRail
    sebagai result (Test Run → Import Results → CSV). Kolom mengikuti format
    importer TestRail: identifier case (Test Case ID) + field hasil.

    Status diisi QA per run: Passed / Failed / Blocked / Retest / Skipped
    (persis nama status TestRail). Kolom kosong lainnya opsional.
    """
    path = ROOT / "qa-test-results-testrail.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Test Case ID", "Title", "Status", "Comment", "Elapsed",
                    "Version", "Defects", "Assignee"])
        for r in records:
            w.writerow([r["id"], r["title"], "", "", "", "", "", ""])
    return path


def write_results_template_xlsx(records: list[dict]) -> Path:
    """Workbook eksekusi per run: isi Status (dropdown), ringkasan otomatis
    via COUNTIF, dan release gate S1 (formula COUNTIFS).
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = "Hasil Run"

    # ---- Blok info run (diisi/ubah per run) ----
    ws.append(["RUN: Eksekusi Test — Appsheet Accounting Journal", ""])
    ws.append(["Nama Run", "Regresi Maret 2026"])
    ws.append(["Tanggal Run", RUN_DATE_DEFAULT])
    ws.append(["Environment", ENVIRONMENT_DEFAULT])
    ws.append(["Eksekutor", ""])
    ws.append([])

    header_fill = PatternFill("solid", fgColor="2596BE")
    warn_fill = PatternFill("solid", fgColor="FCA5A5")
    ok_fill = PatternFill("solid", fgColor="C6EFCE")

    headers = ["Test Case ID", "Modul", "Test Case", "Severity", "Sprint",
               "Status", "Comment", "Elapsed", "Defects", "Assignee"]
    ws.append(headers)
    header_row = ws.max_row  # 7
    for col in range(1, len(headers) + 1):
        c = ws.cell(row=header_row, column=col)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = header_fill
        c.alignment = Alignment(vertical="center")

    sev_fill = {"S1": PatternFill("solid", fgColor="FDE8E8"),
                "S2": PatternFill("solid", fgColor="FEF3C7")}
    first_data = header_row + 1
    for r in records:
        ws.append([r["id"], r["module"], r["title"], r["sev"], r["sprint"],
                   "", "", "", "", ""])
        row = ws.max_row
        if r["sev"] in sev_fill:
            ws.cell(row=row, column=4).fill = sev_fill[r["sev"]]
        for col in range(1, len(headers) + 1):
            ws.cell(row=row, column=col).alignment = Alignment(
                vertical="top", wrap_text=(col in (3, 7)))
    last_data = ws.max_row

    # Dropdown status (persis nama status TestRail)
    dv = DataValidation(
        type="list",
        formula1='"Passed,Failed,Blocked,Retest,Skipped,Not Run"',
        allow_blank=True,
    )
    ws.add_data_validation(dv)
    dv.add(f"F{first_data}:F{last_data}")

    # ---- Ringkasan otomatis (formula COUNTIF — dihitung Excel saat dibuka) ----
    ws.append([])
    ws.append(["RINGKASAN RUN", ""])
    rng = f"F{first_data}:F{last_data}"
    for i, status in enumerate(["Passed", "Failed", "Blocked", "Retest", "Skipped", "Not Run"], 1):
        ws.append([f"  {status}", f"=COUNTIF({rng},\"{status}\")"])
    ws.append(["  Total dijalankan (bukan Not Run)", f"=COUNTA({rng})-COUNTIF({rng},\"Not Run\")-COUNTIF({rng},\"\")"])
    ws.append(["  % Pass", f'=IF(COUNTA({rng})=0,0,COUNTIF({rng},\"Passed\")/COUNTA({rng}))'])
    ws.append([])
    ws.append(["RELEASE GATE (S1)", ""])
    ws.append(["  S1 belum lolos (Failed/Not Run)",
               f'=COUNTIFS(D{first_data}:D{last_data},"S1",F{first_data}:F{last_data},"<>Passed")-COUNTIFS(D{first_data}:D{last_data},"S1",F{first_data}:F{last_data},"",F{first_data}:F{last_data},"<>")'])
    ws.append(["  Blokir rilis jika S1 belum lolos",
               f'=IF(COUNTIFS(D{first_data}:D{last_data},"S1",F{first_data}:F{last_data},"<>Passed")>0,"YA — selesaikan S1 dulu","TIDAK")'])

    warn_hdr = next(r[0].row for r in ws.iter_rows(min_row=1, max_row=ws.max_row) if r[0].value and str(r[0].value).startswith("RELEASE GATE"))
    for col in (1, 2):
        ws.cell(row=warn_hdr, column=col).fill = warn_fill
        ws.cell(row=warn_hdr, column=col).font = Font(bold=True, color="9B1C1C")

    widths = [14, 20, 38, 9, 9, 11, 46, 9, 12, 14]
    for col, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.freeze_panes = f"A{header_row + 1}"
    ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(headers))}{last_data}"

    # ---- Sheet cara pakai ----
    ws2 = wb.create_sheet("Cara Pakai")
    lines = [
        ["Template hasil eksekusi test — import balik ke TestRail", ""],
        ["", ""],
        ["1. Isi kolom Status per case (dropdown): Passed / Failed / Blocked /", ""],
        ["   Retest / Skipped / Not Run (nama persis status TestRail).", ""],
        ["2. (Opsional) isi Comment, Elapsed (mis. \"5m\"), Defects (mis. TR-7), Assignee.", ""],
        ["3. Sheet 'Hasil Run' → ringkasan & release gate S1 terhitung otomatis.", ""],
        ["", ""],
        ["Import ke TestRail (cara A — UI):", ""],
        ["   Test Run → Import Results → pilih CSV. Format kolom importer:", ""],
        ["   Test Case ID (atau Case ID / Title) + Status + kolom hasil opsional.", ""],
        ["", ""],
        ["Import ke TestRail (cara B — API, add_results_for_cases):", ""],
        ["   Konversi CSV ini ke JSON payload dan POST ke run: ", ""],
        ["   curl -u user:key -H 'Content-Type: application/json' -F 'results=@res.json'", ""],
        ["   https://host/index.php?/api/v2/add_results_for_cases/{run_id}", ""],
        ["", ""],
        ["   status_id default: 1=Passed, 2=Blocked, 4=Retest, 5=Failed", ""],
        ["   (3=Untested tidak bisa dikirim sebagai hasil).", ""],
        ["", ""],
        ["Contoh payload satu hasil:", ""],
        ['   { "case_id": 100, "status_id": 5, "comment": "Gagal saat login",'],
        ['     "elapsed": "3m", "defects": "TR-7", "environment": "qa03" }'],
    ]
    for row in lines:
        ws2.append(row)
    ws2.column_dimensions["A"].width = 95

    path = ROOT / "qa-test-results-template.xlsx"
    wb.save(path)
    return path


def main() -> None:
    records = enrich(parse_tables())
    tc = [r for r in records if r["id"].startswith("TC-")]
    rg = [r for r in records if r["id"].startswith("RG-")]
    assert len(tc) == 137, f"Jumlah TC tidak sesuai: {len(tc)} (harus 137)"
    assert len(rg) == 12, f"Jumlah RG tidak sesuai: {len(rg)} (harus 12)"
    for f in (write_testrail_csv, write_tracker_csv, write_xlsx, write_results_csv, write_results_template_xlsx):
        print(f"[OK] {f(records)}")
    print(f"\nTotal: {len(tc)} TC + {len(rg)} RG = {len(records)} test case")


if __name__ == "__main__":
    main()
