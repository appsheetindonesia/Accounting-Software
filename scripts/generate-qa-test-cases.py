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

Menjalankan:  python scripts/generate-qa-test-cases.py
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "QA Test Plan - Accounting.md"

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
                    "Story (AC)", "Sprint", "Status", "Langkah", "Hasil Diharapkan",
                    "Preconditions"])
        for r in records:
            w.writerow([r["id"], r["module"], r["title"], r["type"], r["priority"],
                        r["sev"], r["story"], r["sprint"], r["status"],
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
               "Story (AC)", "Sprint", "Status", "Langkah", "Hasil Diharapkan",
               "Preconditions"]
    ws.append(headers)

    header_fill = PatternFill("solid", fgColor="2596BE")
    sev_fill = {
        "S1": PatternFill("solid", fgColor="FDE8E8"),
        "S2": PatternFill("solid", fgColor="FEF3C7"),
    }
    for col, _ in enumerate(headers, 1):
        c = ws.cell(row=1, column=col)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = header_fill
        c.alignment = Alignment(vertical="center")

    for r in records:
        ws.append([r["id"], r["module"], r["title"], r["type"], r["priority"],
                   r["sev"], r["story"], r["sprint"], r["status"],
                   r["steps"], r["expected"], r["preconditions"]])
        row = ws.max_row
        if r["sev"] in sev_fill:
            ws.cell(row=row, column=6).fill = sev_fill[r["sev"]]
        for col in range(1, len(headers) + 1):
            ws.cell(row=row, column=col).alignment = Alignment(
                vertical="top", wrap_text=(col in (10, 11, 12)))

    widths = [14, 20, 38, 12, 14, 9, 12, 9, 11, 60, 60, 38]
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
        ws2.append([mod, n])
    ws2.append([])
    ws2.append(["Per Severity", "Jumlah"])
    for sev, n in Counter(r["sev"] for r in tc).most_common():
        ws2.append([sev, n])
    ws2.append([])
    ws2.append(["Per Sprint", "Jumlah"])
    for sp, n in Counter(r["sprint"] for r in tc).most_common():
        ws2.append([sp, n])
    ws2.column_dimensions["A"].width = 30
    ws2.column_dimensions["B"].width = 10
    for row in ws2.iter_rows(min_row=1, max_row=1):
        for c in row:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = header_fill

    path = ROOT / "qa-test-cases.xlsx"
    wb.save(path)
    return path


def main() -> None:
    records = enrich(parse_tables())
    tc = [r for r in records if r["id"].startswith("TC-")]
    rg = [r for r in records if r["id"].startswith("RG-")]
    assert len(tc) == 137, f"Jumlah TC tidak sesuai: {len(tc)} (harus 137)"
    assert len(rg) == 12, f"Jumlah RG tidak sesuai: {len(rg)} (harus 12)"
    for f in (write_testrail_csv, write_tracker_csv, write_xlsx):
        print(f"[OK] {f(records)}")
    print(f"\nTotal: {len(tc)} TC + {len(rg)} RG = {len(records)} test case")


if __name__ == "__main__":
    main()
