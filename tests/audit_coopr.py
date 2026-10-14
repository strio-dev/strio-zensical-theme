"""Reconcile every current Coopr theme source against the extracted package."""
from pathlib import Path
import re
import sys
import tomllib

coopr = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[1]
mapping = {
    "404.html": "theme/overrides/404.html",
    "main.html": "theme/overrides/main.html",
    "coopr_copy.py": "theme/python/strio_copy.py",
    "coopr_highlight.py": "theme/python/strio_highlight.py",
    "test_copy.py": "theme/python/test_copy.py",
    "test_highlight.py": "theme/python/test_highlight.py",
}
source_files = {p.name for p in (coopr / "docs/.overrides").iterdir() if p.is_file()}
assert source_files == set(mapping), f"Unaccounted override files: {source_files ^ set(mapping)}"
for name, target in mapping.items():
    assert (coopr / "docs/.overrides" / name).read_text().replace("coopr", "strio") == (repo / target).read_text(), name
for source, target in [("docs/javascripts", "theme/assets/javascripts"), ("docs/assets", "theme/identities/coopr")]:
    paths = list((coopr / source).iterdir())
    assert {p.name for p in paths if p.is_file()} == {p.name for p in (repo / target).iterdir() if p.is_file()}
    for path in paths:
        if path.is_file():
            actual = (repo / target / path.name).read_bytes()
            expected = path.read_bytes() if path.suffix == ".svg" else path.read_text().replace("coopr", "strio").encode()
            assert actual == expected, path.name
assert {p.name for p in (coopr / "docs/stylesheets").iterdir() if p.is_file()} == {"coopr.css"}
css = (coopr / "docs/stylesheets/coopr.css").read_text().replace("coopr", "strio")
css = re.sub(r'\.strio-([A-Za-z0-9_-]+)', lambda m: ':is(.strio-' + m[1] + ', .coopr-' + m[1] + ')', css)
assert css == (repo / "theme/assets/stylesheets/strio.css").read_text().split("\n/* Shared Strio footer", 1)[0], "CSS declarations/order differ"
a = tomllib.loads((coopr / "zensical.toml").read_text())["project"]
b = tomllib.loads((repo / "example/zensical.toml").read_text())["project"]
for key in ["variant", "language", "font", "features", "palette", "icon"]:
    assert a["theme"][key] == b["theme"][key], key
assert a["extra"] == b["extra"]
assert repr(a["markdown_extensions"]).replace("coopr", "strio") == repr(b["markdown_extensions"])
original = (coopr / "nix/zensical.nix").read_text()
packaged = (repo / "nix/zensical.nix").read_text()
assert re.findall(r'version = "([^"\n]+)"', original) == re.findall(r'version = "([^"\n]+)"', packaged)
assert re.findall(r'hash = "([^"\n]+)"', original) == re.findall(r'hash = "([^"\n]+)"', packaged)
assert not list((repo / "theme").rglob("*.pyc"))
assert not list((repo / "theme").rglob("*acme*"))
print("All Coopr CSS/JS/templates/extensions/tests/assets accounted for; rule order, theme defaults, tool version/hashes match; Acme stays example-only")
