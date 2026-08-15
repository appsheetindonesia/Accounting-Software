#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Konversi `qa-test-results-testrail.csv` (hasil eksekusi QA) ke JSON payload
untuk API TestRail `add_results_for_cases`.

Input  — CSV hasil generator:  scripts/generate-qa-test-cases.py
         (kolom: Test Case ID, Title, Status, Comment, Elapsed, Version,
         Defects, Assignee). Status diisi QA per run.
Output — `qa-test-results-testrail.json` berisi payload siap kirim:
         { "results": [ { "case_id": 100, "status_id": 5, "comment": "...",
                          "elapsed": "3m", "version": "...", "defects": "TR-7" } ] }

Aturan:
  * Status dipetakan ke status_id TestRail:
      Passed=1, Blocked=2, Retest=4, Failed/Fail=5, Skipped=6.
      Skipped=6 adalah status kustom default TestRail — sesuaikan
      STATUS_IDS di bawah jika instance Anda memakai id berbeda.
  * Baris berstatus kosong / "Not Run" dilewati (status 3=Untested tidak
    bisa dikirim sebagai hasil).
  * case_id wajib numerik (ID case TestRail). Kalau kolom "Test Case ID"
    berisi referensi kustom (mis. TC-LAY-01), sediakan pemetaan
    kustom → numerik via `--mapping` (JSON: { "TC-LAY-01": 100 }).
  * Assignee tidak dipetakan otomatis (API butuh user id); isi via UI
    TestRail atau tambahkan assignedto_id manual pada payload.

Contoh pemakaian (baca CSV default → tulis JSON default):
    python scripts/convert-results-to-testrail.py

Dengan pemetaan ID kustom → numerik:
    python scripts/convert-results-to-testrail.py --mapping testrail-case-ids.json

Kirim ke TestRail (curl — isi <host>/<run_id> manual, atau berikan
--host dan --run-id agar contoh curl terisi otomatis):
    curl -u user:apikey -H 'Content-Type: application/json' \
         -d @qa-test-results-testrail.json \
         'https://<host>/index.php?/api/v2/add_results_for_cases/<run_id>'

Argumen:
    --input PATH   CSV sumber (default: qa-test-results-testrail.csv)
    --output PATH  JSON tujuan, '-' = stdout (default: qa-test-results-testrail.json)
    --mapping PATH JSON pemetaan referensi kustom → ID case numerik
    --host URL     host TestRail, mis. https://myco.testrail.io — dipakai mengisi
                   URL contoh curl (fallback placeholder <host>)
    --run-id INT   ID test run TestRail — dipakai mengisi URL contoh curl
                   (fallback placeholder <run_id>)
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "qa-test-results-testrail.csv"
DEFAULT_OUTPUT = ROOT / "qa-test-results-testrail.json"

# Nama status di CSV → status_id TestRail (1=Passed, 2=Blocked, 3=Untested,
# 4=Retest, 5=Failed; 6 dst. status kustom — sesuaikan jika perlu).
STATUS_IDS: dict[str, int] = {
    "passed": 1,
    "blocked": 2,
    "retest": 4,
    "failed": 5,
    "fail": 5,
    "skipped": 6,
}
UNSUBMITTABLE = {"not run", ""}


def load_mapping(path: Path) -> dict[str, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(k).strip(): int(v) for k, v in data.items()}


def convert(csv_path: Path, mapping: dict[str, int]) -> tuple[list[dict], dict]:
    """Baca CSV hasil eksekusi → daftar result + statistik lewatan."""
    results: list[dict] = []
    stats = {"not_run": 0, "unknown_status": 0, "no_numeric_id": 0}

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            status = (row.get("Status") or "").strip()
            if status.lower() in UNSUBMITTABLE:
                stats["not_run"] += 1
                continue

            status_id = STATUS_IDS.get(status.lower())
            if status_id is None:
                stats["unknown_status"] += 1
                print(f"[WARN] Status tidak dikenal, dilewati: {status!r} "
                      f"({row.get('Test Case ID')})")
                continue

            raw_id = (row.get("Test Case ID") or "").strip()
            case_id: int | None = None
            if raw_id.isdigit():
                case_id = int(raw_id)
            elif raw_id in mapping:
                case_id = mapping[raw_id]
            else:
                stats["no_numeric_id"] += 1
                print(f"[WARN] case_id non-numerik tanpa pemetaan, dilewati: "
                      f"{raw_id!r} (gunakan --mapping)")
                continue

            result: dict = {"case_id": case_id, "status_id": status_id}
            for col, key in (("Comment", "comment"), ("Elapsed", "elapsed"),
                             ("Version", "version"), ("Defects", "defects")):
                value = (row.get(col) or "").strip()
                if value:
                    result[key] = value
            results.append(result)

    return results, stats


def main() -> None:
    # Output unicode aman di semua platform (mis. '→' di Windows cp1252)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser(
        description="Konversi qa-test-results-testrail.csv → JSON payload "
                    "add_results_for_cases (TestRail).",
        epilog="Contoh curl:\n"
               "  curl -u user:apikey -H 'Content-Type: application/json' \\\n"
               "       -d @qa-test-results-testrail.json \\\n"
               "       'https://<host>/index.php?/api/v2/add_results_for_cases/<run_id>'",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT,
                    help=f"CSV sumber (default: {DEFAULT_INPUT.name})")
    ap.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT),
                    help="JSON tujuan, '-' = stdout "
                         "(default: qa-test-results-testrail.json)")
    ap.add_argument("--mapping", type=Path, default=None,
                    help="JSON pemetaan referensi kustom → ID case numerik")
    ap.add_argument("--host", metavar="URL", default="",
                    help="host TestRail, mis. https://myco.testrail.io — mengisi "
                         "URL contoh curl (fallback <host>)")
    ap.add_argument("--run-id", metavar="INT", default="",
                    help="ID test run TestRail — mengisi URL contoh curl "
                         "(fallback <run_id>)")
    args = ap.parse_args()

    if not args.input.exists():
        raise SystemExit(f"[ERROR] {args.input} tidak ditemukan. "
                         f"Jalankan dulu scripts/generate-qa-test-cases.py")
    mapping = load_mapping(args.mapping) if args.mapping else {}

    results, stats = convert(args.input, mapping)
    payload = {"results": results}
    out = "-" if args.output == "-" else str(Path(args.output).resolve())
    if out == "-":
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        Path(out).write_text(json.dumps(payload, indent=2, ensure_ascii=False),
                             encoding="utf-8")

    total = stats["not_run"] + stats["unknown_status"] + stats["no_numeric_id"] + len(results)
    print(f"\nTotal baris: {total}")
    print(f"  → {len(results)} result siap kirim")
    print(f"  → {stats['not_run']} dilewati (kosong/Not Run — tidak bisa dikirim)")
    print(f"  → {stats['unknown_status']} status tidak dikenal")
    print(f"  → {stats['no_numeric_id']} case_id non-numerik tanpa pemetaan")
    if results:
        host = args.host.strip().rstrip("/")
        run_id = args.run_id.strip()
        url = (f"{host or '<host>'}/index.php?/api/v2/add_results_for_cases/"
               f"{run_id or '<run_id>'}")
        print(f"\nPayload tertulis ke {out if out != '-' else 'stdout'}")
        print("Contoh kirim (siap salin-tempel):\n"
              "  curl -u user:apikey -H 'Content-Type: application/json' \\\n"
              f"       -d @{Path(out).name if out != '-' else '<file.json>'} \\\n"
              f"       '{url}'")
    else:
        raise SystemExit("[ERROR] Tidak ada result yang bisa dikirim — "
                         "isi kolom Status dulu di CSV.")


if __name__ == "__main__":
    main()
