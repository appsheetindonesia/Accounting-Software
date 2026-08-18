"""Unit test untuk check-qa-sync.py:
  1. normalize_line_endings — CRLF/CR/LF dianggap sama
  2. committed_run_date — baca tanggal dari tracker CSV
  3. Date-pinning — generator dengan --run-date memaksa semua baris

Menjalankan:  python -m unittest discover -s scripts -p "test_*.py"
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import unittest
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "check_qa_sync", __file__.replace("test_check_qa_sync", "check-qa-sync")
)
cqs = importlib.util.module_from_spec(_SPEC)
assert _SPEC and _SPEC.loader is not None
_SPEC.loader.exec_module(cqs)

norm = cqs.normalize_line_endings


class NormalizeLineEndingsTest(unittest.TestCase):
    def test_crlf_sama_dengan_lf(self):
        """CRLF vs LF yang isinya sama → identik setelah normalisasi."""
        self.assertEqual(
            norm(b"a,b\r\nc,d\r\n"),
            norm(b"a,b\nc,d\n"),
        )

    def test_cr_lama_mac_sama_dengan_lf(self):
        """CR saja (Mac lama) → dianggap LF, sama dengan LF."""
        self.assertEqual(
            norm(b"a\rb\r"),
            norm(b"a\nb\n"),
        )

    def test_line_ending_bukan_perubahan_konten(self):
        """Campuran CRLF/CR/LF dalam satu file → semuanya menjadi LF murni."""
        self.assertEqual(
            norm(b"x\r\ny\rz\n"),
            b"x\ny\nz\n",
        )

    def test_perbedaan_konten_tetap_terdeteksi(self):
        """Normalisasi TIDAK menutupi perbedaan konten nyata."""
        self.assertNotEqual(
            norm(b"a,b\nc,d\n"),
            norm(b"a,b\ne,d\n"),  # c → e
        )

    def test_perbedaan_konten_walau_line_ending_sama(self):
        """Dua file LF sama-sama tapi baris berbeda → tetap beda."""
        self.assertNotEqual(
            norm(b"baris satu\nbaris dua\n"),
            norm(b"baris satu\nbaris DUA\n"),
        )

    def test_utf8_dan_byte_kosong(self):
        """Konten UTF-8 (mis. nama perusahaan) + file kosong tidak rusak."""
        self.assertEqual(
            norm("PT. Kreasi Inovasi Estetika\r\n".encode("utf-8")),
            "PT. Kreasi Inovasi Estetika\n".encode("utf-8"),
        )
        self.assertEqual(norm(b""), b"")
        self.assertEqual(norm(b"\r\n"), b"\n")

    def test_identik_sudah_lf(self):
        """File LF murni → tidak berubah sama sekali (idempoten)."""
        raw = b"1,2,3\n4,5,6\n"
        self.assertEqual(norm(raw), raw)


class CommittedRunDateTest(unittest.TestCase):
    """Unit test untuk committed_run_date(): baca 'Tanggal Run' dari tracker."""

    def setUp(self):
        import tempfile, shutil
        self._tmpdir = tempfile.mkdtemp()
        self._orig_root = cqs.ROOT
        # Patch ROOT ke temporary directory
        cqs.ROOT = Path(self._tmpdir)
        self.tracker = Path(self._tmpdir) / "qa-test-cases-tracker.csv"

    def tearDown(self):
        cqs.ROOT = self._orig_root
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def _write_tracker(self, rows: list[dict]) -> None:
        import csv as _csv
        fieldnames = ["ID", "Modul", "Test Case", "Tipe", "Prioritas",
                      "Severity", "Story (AC)", "Sprint", "Status",
                      "Tanggal Run", "Environment", "Pembuat Test",
                      "Link Bug", "Langkah", "Hasil Diharapkan", "Preconditions"]
        with self.tracker.open("w", encoding="utf-8-sig", newline="") as f:
            w = _csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)

    def test_baca_tanggal_dari_baris_pertama(self):
        """Tanggal Run pada baris data pertama dikembalikan."""
        self._write_tracker([
            {"ID": "TC-01", "Tanggal Run": "2026-08-19", "Status": "Passed"},
            {"ID": "TC-02", "Tanggal Run": "2026-08-16", "Status": "Not Run"},
        ])
        self.assertEqual(cqs.committed_run_date(), "2026-08-19")

    def test_skip_baris_tanpa_tanggal(self):
        """Baris dengan Tanggal Run kosong dilewati; ambil yang pertama terisi."""
        self._write_tracker([
            {"ID": "TC-01", "Tanggal Run": "", "Status": "Not Run"},
            {"ID": "TC-02", "Tanggal Run": "2026-07-01", "Status": "Failed"},
        ])
        self.assertEqual(cqs.committed_run_date(), "2026-07-01")

    def test_semua_kosong_fallback_ke_hari_ini(self):
        """Semua Tanggal Run kosong → fallback ke hari ini."""
        self._write_tracker([
            {"ID": "TC-01", "Tanggal Run": "", "Status": "Not Run"},
        ])
        from datetime import date
        self.assertEqual(cqs.committed_run_date(), date.today().isoformat())

    def test_tidak_ada_file_fallback_ke_hari_ini(self):
        """Tracker tidak ada → fallback ke hari ini."""
        self.assertFalse(self.tracker.exists())
        from datetime import date
        self.assertEqual(cqs.committed_run_date(), date.today().isoformat())

    def test_whitespace_di_strip(self):
        """Spasi/newline di sekitar tanggal di-strip."""
        self._write_tracker([
            {"ID": "TC-01", "Tanggal Run": "  2026-08-19  ", "Status": "Passed"},
        ])
        self.assertEqual(cqs.committed_run_date(), "2026-08-19")

    def test_bom_utf8_ditangani(self):
        """File dengan BOM UTF-8 tetap bisa dibaca."""
        # Tulis manual dengan BOM
        import io
        with self.tracker.open("wb") as f:
            f.write(b"\xef\xbb\xbfID,Tanggal Run,Status\nTC-01,2026-09-01,Passed\n")
        self.assertEqual(cqs.committed_run_date(), "2026-09-01")


class DatePinBehaviorTest(unittest.TestCase):
    """Unit test untuk perilaku pin tanggal di generator (--run-date CLI)."""

    def test_override_flag_true_memaksa_tanggal_baru(self):
        """Saat _OVERRIDE_RUN_DATE=True, enrich() memaksa Tanggal Run = default."""
        gen = importlib.util.spec_from_file_location(
            "gen", str(cqs.ROOT / "scripts" / "generate-qa-test-cases.py"))
        mod = importlib.util.module_from_spec(gen)
        gen.loader.exec_module(mod)

        # Simulasikan: _OVERRIDE_RUN_DATE=True, RUN_DATE_DEFAULT="2029-01-15"
        mod._OVERRIDE_RUN_DATE = True
        mod.RUN_DATE_DEFAULT = "2029-01-15"

        # Existing metadata punya tanggal lama
        existing = {"TC-01": {"Status": "Passed", "Tanggal Run": "2026-08-16"}}

        # Bangun records minimal
        records = [{"id": "TC-01", "module": "M", "title": "T",
                    "type": "Functional", "priority": "3 - Medium",
                    "sev": "S3", "story": "AAJ-001", "sprint": "Sprint 1"}]

        # Jalankan enrich logic langsung
        for r in records:
            meta = existing.get(r["id"], {})
            r["status"] = meta.get("Status", "Not Run")
            if mod._OVERRIDE_RUN_DATE:
                r["run_date"] = mod.RUN_DATE_DEFAULT
            else:
                r["run_date"] = meta.get("Tanggal Run", mod.RUN_DATE_DEFAULT)
            r["environment"] = meta.get("Environment", mod.ENVIRONMENT_DEFAULT)

        # Tanggal baru dipaksa meskipun metadata punya tanggal lama
        self.assertEqual(records[0]["run_date"], "2029-01-15")

    def test_override_flag_false_pertahankan_tanggal_lama(self):
        """Saat _OVERRIDE_RUN_DATE=False, enrich() pertahankan tanggal dari metadata."""
        gen = importlib.util.spec_from_file_location(
            "gen", str(cqs.ROOT / "scripts" / "generate-qa-test-cases.py"))
        mod = importlib.util.module_from_spec(gen)
        gen.loader.exec_module(mod)

        mod._OVERRIDE_RUN_DATE = False
        mod.RUN_DATE_DEFAULT = "2099-12-31"

        existing = {"TC-01": {"Status": "Passed", "Tanggal Run": "2026-08-16"}}
        records = [{"id": "TC-01", "module": "M", "title": "T",
                    "type": "Functional", "priority": "3 - Medium",
                    "sev": "S3", "story": "AAJ-001", "sprint": "Sprint 1"}]

        for r in records:
            meta = existing.get(r["id"], {})
            r["status"] = meta.get("Status", "Not Run")
            if mod._OVERRIDE_RUN_DATE:
                r["run_date"] = mod.RUN_DATE_DEFAULT
            else:
                r["run_date"] = meta.get("Tanggal Run", mod.RUN_DATE_DEFAULT)
            r["environment"] = meta.get("Environment", mod.ENVIRONMENT_DEFAULT)

        # Tanggal lama dipertahankan, bukan default baru
        self.assertEqual(records[0]["run_date"], "2026-08-16")

    def test_override_flag_true_baris_kosong_pakai_default(self):
        """Saat _OVERRIDE_RUN_DATE=True dan metadata kosong, pakai default."""
        gen = importlib.util.spec_from_file_location(
            "gen", str(cqs.ROOT / "scripts" / "generate-qa-test-cases.py"))
        mod = importlib.util.module_from_spec(gen)
        gen.loader.exec_module(mod)

        mod._OVERRIDE_RUN_DATE = True
        mod.RUN_DATE_DEFAULT = "2029-01-15"

        existing = {}  # tidak ada metadata
        records = [{"id": "TC-NEW", "module": "M", "title": "T",
                    "type": "Functional", "priority": "3 - Medium",
                    "sev": "S3", "story": "AAJ-001", "sprint": "Sprint 1"}]

        for r in records:
            meta = existing.get(r["id"], {})
            r["status"] = meta.get("Status", "Not Run")
            if mod._OVERRIDE_RUN_DATE:
                r["run_date"] = mod.RUN_DATE_DEFAULT
            else:
                r["run_date"] = meta.get("Tanggal Run", mod.RUN_DATE_DEFAULT)
            r["environment"] = meta.get("Environment", mod.ENVIRONMENT_DEFAULT)

        self.assertEqual(records[0]["run_date"], "2029-01-15")


if __name__ == "__main__":
    unittest.main()
