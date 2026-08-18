"""Test otomatis untuk pre-commit hook (scripts/hooks/pre-commit).

Menjalankan hook bash ASLI di dalam repositori git temporer terisolasi —
TANPA membuat commit nyata di repo mana pun:

  1. SKIP   — hanya file non-QA di-stage → exit 0, cek sinkronisasi TIDAK jalan
  2. REJECT — file QA di-stage tanpa regenerasi artefak → exit 1, commit ditolak
  3. ALLOW  — file QA di-stage dengan artefak sinkron → exit 0, lolos

Setup per test: temp repo berisi salinan `scripts/` (generator, check-qa-sync,
konverter), `scripts/hooks/pre-commit`, dan `QA Test Plan - Accounting.md`.
Artefak hasil generator dibuat sebagai baseline, lalu hook dipanggil langsung
via `bash` (perilaku identik dengan pemanggilan git — hook hanya membaca
`git diff --cached` dan menjalankan check-qa-sync.py).

Menjalankan:  python -m unittest discover -s scripts -p "test_*.py"
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Bash eksplisit via shutil.which: memanggil "bash" telanjang bisa ter-resolve
# ke bash WSL (mount /mnt/d, PATH beda) yang tidak memahami path Windows
# (D:/...) dan tidak menemukan python. Bash MSYS dari Git (hermes) memahami
# keduanya — dipakai langsung lewat path penuhnya.
_BASH = shutil.which("bash")
if not _BASH:
    raise RuntimeError("bash tidak ditemukan di PATH — hook pre-commit butuh bash")

REPO = Path(__file__).resolve().parent.parent          # root repo nyata
SCRIPTS = REPO / "scripts"
PLAN_NAME = "QA Test Plan - Accounting.md"

OUTPUT_FILES = [
    "qa-test-cases-testrail.csv",
    "qa-test-cases-tracker.csv",
    "qa-test-cases.xlsx",
    "qa-test-results-testrail.csv",
    "qa-test-results-template.xlsx",
]

SCRIPTS_TO_COPY = [
    "generate-qa-test-cases.py",
    "check-qa-sync.py",
    "convert-results-to-testrail.py",
]


class PreCommitHookTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        (cls.root / "scripts" / "hooks").mkdir(parents=True)
        for name in SCRIPTS_TO_COPY:
            shutil.copy2(SCRIPTS / name, cls.root / "scripts" / name)
        shutil.copy2(SCRIPTS / "hooks" / "pre-commit",
                     cls.root / "scripts" / "hooks" / "pre-commit")
        shutil.copy2(REPO / PLAN_NAME, cls.root / PLAN_NAME)

        # Repo git valid (tanpa commit) + identitas + hooksPath
        subprocess.run(["git", "init", "-q"], cwd=cls.root, check=True)
        subprocess.run(["git", "config", "user.email", "hook-test@example.com"],
                       cwd=cls.root, check=True)
        subprocess.run(["git", "config", "user.name", "QA Hook Test"],
                       cwd=cls.root, check=True)
        subprocess.run(["git", "config", "core.hooksPath", "scripts/hooks"],
                       cwd=cls.root, check=True)
        cls._gen()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------
    @classmethod
    def _gen(cls) -> None:
        """Jalankan generator di temp repo → artefak output (status Not Run)."""
        r = subprocess.run(
            [sys.executable, str(cls.root / "scripts" / "generate-qa-test-cases.py")],
            cwd=cls.root, capture_output=True, text=True)
        assert r.returncode == 0, f"generator gagal: {r.stdout}\n{r.stderr}"

    def _hook(self) -> subprocess.CompletedProcess:
        # as_posix(): MSYS bash menelan backslash Windows — path harus pakai '/'
        hook = (self.root / "scripts" / "hooks" / "pre-commit").as_posix()
        return subprocess.run(
            [_BASH, hook],
            cwd=self.root, capture_output=True, text=True)

    def _stage(self, *names: str) -> None:
        subprocess.run(["git", "add", "--", *names], cwd=self.root, check=True)

    def _unstage(self) -> None:
        subprocess.run(["git", "reset", "-q"], cwd=self.root, check=True)

    def _reset(self) -> None:
        """Kembalikan plan + artefak ke baseline (independen dari urutan test)."""
        shutil.copy2(REPO / PLAN_NAME, self.root / PLAN_NAME)
        self._gen()
        self._unstage()

    def _tambah_tc_ke_plan(self) -> None:
        """Sisipkan baris TC baru (TC-NEW-01) ke tabel TC plan — jumlah TC bertambah."""
        plan = self.root / PLAN_NAME
        lines = plan.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if re.match(r"^\| TC-", line):
                lines.insert(i + 1, re.sub(r"^\| TC-[\w-]+", "| TC-NEW-01", line))
                break
        else:
            self.fail("baris TC tidak ditemukan di QA Test Plan")
        plan.write_text("\n".join(lines), encoding="utf-8")

    # ------------------------------------------------------------------
    # 1. SKIP — file non-QA saja → hook exit 0 tanpa cek sinkronisasi
    # ------------------------------------------------------------------
    def test_skip_saat_tidak_ada_file_qa(self):
        self._reset()
        (self.root / "README.md").write_text("# temp\n", encoding="utf-8")
        self._stage("README.md")

        r = self._hook()

        self.assertEqual(r.returncode, 0)
        self.assertNotIn("perubahan file QA", r.stdout)  # cek tidak dijalankan
        self.assertNotIn("GAGAL", r.stderr)
        self._unstage()

    # ------------------------------------------------------------------
    # 2. REJECT — plan berubah tanpa regenerasi artefak → ditolak
    # ------------------------------------------------------------------
    def test_reject_plan_berubah_tanpa_regenerasi(self):
        self._reset()
        self._tambah_tc_ke_plan()          # plan bertambah TC
        self._stage(PLAN_NAME)             # artefak TIDAK diregenerasi

        r = self._hook()

        self.assertEqual(r.returncode, 1)
        self.assertIn("perubahan file QA terdeteksi", r.stdout)
        self.assertIn("TIDAK sinkron", r.stdout)      # pesan check-qa-sync
        self.assertIn("GAGAL", r.stderr)
        self.assertIn("ditolak", r.stderr)
        self._unstage()

    # ------------------------------------------------------------------
    # 3. ALLOW — plan + artefak sinkron → lolos
    # ------------------------------------------------------------------
    def test_allow_plan_dan_artefak_sinkron(self):
        self._reset()
        self._tambah_tc_ke_plan()          # plan bertambah TC
        self._gen()                        # artefak diregenerasi → sinkron
        self._stage(PLAN_NAME, *OUTPUT_FILES)

        r = self._hook()

        self.assertEqual(r.returncode, 0, f"stdout={r.stdout}\nstderr={r.stderr}")
        self.assertIn("perubahan file QA terdeteksi", r.stdout)
        self.assertNotIn("GAGAL", r.stderr)
        self._unstage()


if __name__ == "__main__":
    unittest.main()
