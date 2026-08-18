"""Unit test untuk normalisasi line ending di scripts/check-qa-sync.py.

Menguji `normalize_line_endings` (fungsi yang dipakai gate sinkronisasi QA
untuk membandingkan CSV): CRLF/CR/LF harus dianggap sama (perbedaan gaya line
ending BUKAN perubahan konten), sedangkan perbedaan konten nyata tetap
terdeteksi — regresi yang membuat gate salah terima / salah tolak karena
line ending langsung kelihatan di sini.

Menjalankan:  python -m unittest discover -s scripts -p "test_*.py"
"""
from __future__ import annotations

import importlib.util
import unittest

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


if __name__ == "__main__":
    unittest.main()
