"""Regression checks for scoped staging and live preview; run through the flake check."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest


PREPARE = Path(os.environ.get("PREPARE", "nix/prepare.py")).resolve()
THEME = Path(os.environ.get("THEME", "theme")).resolve()


class ScopedPreview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "project"
        self.source.mkdir()
        (self.source / "docs").mkdir()
        (self.source / "docs/index.md").write_text("# Original\n")
        (self.source / "zensical.toml").write_text('[project]\nsite_name = "Scoped"\n')
        (self.source / ".omx").mkdir()
        (self.source / ".omx/private").write_text("private")
        external = self.root / "never-follow"
        external.mkdir()
        (external / "secret").write_text("outside the source")
        (self.source / ".omx/external").symlink_to(external, target_is_directory=True)
        (self.source / "result").symlink_to(self.source / ".omx", target_is_directory=True)
        self.output = self.root / "output"

    def prepare(self, paths=("docs", "zensical.toml"), success=True, config="zensical.toml"):
        command = [sys.executable, str(PREPARE), "--source", str(self.source),
                   "--output", str(self.output), "--theme", str(THEME), "--config-file", config]
        if paths is not None:
            for path in paths:
                command.extend(["--source-path", path])
        result = subprocess.run(command, capture_output=True, text=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_scoped_staging_and_updates(self):
        self.prepare()
        staged = self.output / "source"
        self.assertEqual({p.name for p in staged.iterdir()}, {"docs", "zensical.toml"})
        (self.source / "docs/new.md").write_text("# New\n")
        (self.source / "docs/index.md").unlink()
        self.prepare()
        self.assertTrue((staged / "docs/new.md").exists())
        self.assertFalse((staged / "docs/index.md").exists())
        self.assertTrue(list((staged / "docs/stylesheets").glob("strio.*.css")))

    def test_default_still_stages_other_inputs(self):
        (self.source / "extra.txt").write_text("extra")
        self.prepare(paths=None)
        self.assertTrue((self.output / "source/extra.txt").exists())

    def test_invalid_or_missing_selection(self):
        for paths in (("../private",), ("/tmp",), ("missing",), ("docs",),
                      ("zensical.toml",), ("docs/../docs", "zensical.toml")):
            with self.subTest(paths=paths):
                result = self.prepare(paths, success=False)
                self.assertIn("source", result.stderr.lower())
        self.assertFalse(self.output.exists())

    def test_selected_symlinks_fail_before_staging(self):
        for name in ("secret", "linked"):
            link = self.source / "docs" / name
            link.symlink_to(self.source / ".omx", target_is_directory=True)
            result = self.prepare(success=False)
            self.assertIn("symlink", result.stderr.lower())
            self.assertFalse(self.output.exists())
            link.unlink()

    def test_selected_file_symlink_within_docs(self):
        (self.source / "docs/alias.md").symlink_to("index.md")
        self.prepare()
        self.assertEqual((self.output / "source/docs/alias.md").read_text(), "# Original\n")

    def test_selected_file_symlink_to_private_input(self):
        (self.source / "docs/private.txt").symlink_to("../.omx/private")
        result = self.prepare(success=False)
        self.assertIn("symlink", result.stderr.lower())
        self.assertFalse(self.output.exists())

    def test_symlink_parent_rejected_before_staging(self):
        (self.source / "alias").symlink_to(self.source / "docs", target_is_directory=True)
        result = self.prepare(("alias/index.md", "docs", "zensical.toml"), success=False)
        self.assertIn("symlink parent", result.stderr.lower())
        self.assertFalse(self.output.exists())

    def test_nested_config_and_custom_directory(self):
        nested = self.source / "documentation"
        nested.mkdir()
        (self.source / "docs").rename(nested / "docs")
        (nested / "custom").mkdir()
        (nested / "custom/main.html").write_text("custom template")
        (self.source / "zensical.toml").unlink()
        (nested / "zensical.toml").write_text(
            '[project]\ndocs_dir = "docs"\n'
            '[project.theme]\ncustom_dir = "custom"\n')
        self.prepare(("documentation/docs", "documentation/zensical.toml"), success=False,
                     config="documentation/zensical.toml")
        self.prepare(("documentation/docs", "documentation/custom", "documentation/zensical.toml"),
                     config="documentation/zensical.toml")
        self.assertEqual((self.output / "overrides/main.html").read_text(), "custom template")
        self.assertFalse((self.output / "source/.omx").exists())

    def start_preview(self, expected_exit=(0, -signal.SIGTERM, 143), **extra_environment):
        preview = os.environ.get("PREVIEW")
        if not preview:
            self.skipTest("PREVIEW is supplied by the flake check")
        log = self.root / "serve.log"
        errors = self.root / "preview-errors.log"
        error_stream = errors.open("w")
        self.addCleanup(error_stream.close)
        environment = dict(os.environ, PREVIEW_LOG=str(log), **extra_environment)
        process = subprocess.Popen([preview, str(self.source)], env=environment,
                                   stdout=subprocess.DEVNULL, stderr=error_stream,
                                   text=True, start_new_session=True)
        def stop():
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=10)
            if expected_exit is not None and process.returncode not in expected_exit:
                self.fail(errors.read_text())
        self.addCleanup(stop)
        def wait_for(predicate):
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if predicate():
                    return
                if process.poll() is not None:
                    self.fail(errors.read_text())
                time.sleep(0.05)
            self.fail("Timed out waiting for live preview update: " + errors.read_text())
        return process, log, wait_for

    def test_watcher_initialization_failure(self):
        process, log, _ = self.start_preview(expected_exit=None, PREVIEW_WATCH_FAIL="1")
        self.assertNotEqual(process.wait(timeout=15), 0)
        self.assertFalse(log.exists())
        errors = (self.root / "preview-errors.log").read_text()
        self.assertIn("Simulated watch installation failure", errors)
        self.assertIn("Source watcher failed to establish watches", errors)

    def test_watcher_readiness_and_directory_replacement(self):
        installs = self.root / "watch-installs"
        release = self.root / "watch-installs.release"
        _, log, wait_for = self.start_preview(PREVIEW_WATCH_LOG=str(installs))
        wait_for(installs.exists)
        self.assertFalse(log.exists(), "Server started before recursive watch installation")
        (self.source / "docs/index.md").write_text("# Saved during installation\n")
        release.touch()
        wait_for(log.exists)
        staged = Path(log.read_text().splitlines()[0]).parent
        self.assertEqual((staged / "docs/index.md").read_text(), "# Saved during installation\n")
        # Ordinary saves retain established watches rather than reinstalling them.
        (self.source / "docs/index.md").write_text("# Ordinary save\n")
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# Ordinary save\n")
        self.assertEqual(installs.read_text().splitlines(), ["install"])
        # Replacing a selected directory requires fresh watches. Save while that
        # installation is gated to prove the subsequent stage captures the edit.
        (self.source / "docs").rename(self.root / "old-docs")
        (self.source / "docs").mkdir()
        (self.source / "docs/index.md").write_text("# Replacement\n")
        wait_for(lambda: len(installs.read_text().splitlines()) == 2)
        (self.source / "docs/index.md").write_text("# Saved during refresh\n")
        release.touch()
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# Saved during refresh\n")
        (self.source / "docs/index.md").write_text("# Save after refresh\n")
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# Save after refresh\n")
        self.assertEqual(installs.read_text().splitlines(), ["install", "install"])

    def test_live_preview(self):
        process, log, wait_for = self.start_preview()
        wait_for(log.exists)
        staged = Path(log.read_text().splitlines()[0]).parent
        self.assertEqual({p.name for p in staged.iterdir()}, {"docs", "zensical.toml"})
        # An unrelated root event must not cause a restage.
        config_time = (staged / "zensical.toml").stat().st_mtime_ns
        (self.source / "unselected.txt").write_text("ignore")
        (self.source / ".omx/private").write_text("still private")
        time.sleep(1)
        self.assertEqual((staged / "zensical.toml").stat().st_mtime_ns, config_time)
        (self.source / "docs/index.md").write_text("# Edited\n")
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# Edited\n")
        # rsync's default whole-second timestamp check misses equal-size quick saves.
        previous = (self.source / "docs/index.md").stat()
        (self.source / "docs/index.md").write_text("# Edit!!\n")
        os.utime(self.source / "docs/index.md", ns=(previous.st_atime_ns, previous.st_mtime_ns))
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# Edit!!\n")
        (self.source / "docs/nested").mkdir()
        (self.source / "docs/nested/new.md").write_text("# New\n")
        wait_for(lambda: (staged / "docs/nested/new.md").exists())
        (self.source / "docs/nested/new.md").unlink()
        wait_for(lambda: not (staged / "docs/nested/new.md").exists())
        replacement = self.source / "config.tmp"
        replacement.write_text('[project]\nsite_name = "Replaced"\n')
        replacement.replace(self.source / "zensical.toml")
        wait_for(lambda: "Replaced" in (staged / "zensical.toml").read_text())
        wait_for(lambda: len(log.read_text().splitlines()) >= 2)
        (self.source / "docs/index.md").write_text("# After restart\n")
        wait_for(lambda: (staged / "docs/index.md").read_text() == "# After restart\n")
        (self.source / "zensical.toml").unlink()
        time.sleep(0.5)
        self.assertIsNone(process.poll())
        self.assertIn("Replaced", (staged / "zensical.toml").read_text())
        replacement.write_text('[project]\nsite_name = "Restored"\n')
        replacement.replace(self.source / "zensical.toml")
        wait_for(lambda: "Restored" in (staged / "zensical.toml").read_text())


if __name__ == "__main__":
    unittest.main()
