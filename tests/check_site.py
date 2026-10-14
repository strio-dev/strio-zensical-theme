"""Check generated HTML links, assets, overrides and source isolation."""
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if key in attrs:
                self.refs.append(attrs[key])


root = Path(sys.argv[1]).resolve()
base_path = urlsplit(sys.argv[2]).path if len(sys.argv) > 2 else "/"
base_path = base_path.rstrip("/") + "/"
pages = {}
for path in root.rglob("*.html"):
    page = Page()
    page.feed(path.read_text())
    pages[path] = page

errors = []
for path, page in pages.items():
    for ref in page.refs:
        url = urlsplit(ref)
        if url.scheme or url.netloc:
            continue
        if url.path.startswith("/") and base_path != "/":
            assert url.path.startswith(base_path), ref
            url = url._replace(path="/" + url.path[len(base_path):])
        if not url.path:
            target = path
        elif url.path.startswith("/"):
            target = root / unquote(url.path.lstrip("/"))
        else:
            target = path.parent / unquote(url.path)
        if target.is_dir():
            target /= "index.html"
        target = target.resolve()
        if not target.is_relative_to(root) or not target.exists():
            errors.append(f"{path.relative_to(root)}: missing {ref}")
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f"{path.relative_to(root)}: missing anchor {ref}")
assert not errors, "\n".join(errors)

html = (root / "index.html").read_text()
for expected in (
    "stylesheets/strio.css", "stylesheets/palette.css", "stylesheets/strio-accent.css",
    "assets/acme-corner.svg", "javascripts/copy.js",
    "javascripts/toc.js", "javascripts/panels.js", "--strio-code-check-icon", "Acme", "strio-code-",
    "language-kdl", 'aria-label="Strio homepage"', 'href="https://strio.dev"',
    "strio-footer__brandbar", 'viewBox="108 148.617 396 110.766"',
):
    assert expected in html, expected
for name in ("LICENSE", "Zensical-MIT.txt"):
    license_text = (root / "licenses/strio" / name).read_text()
    assert "Permission is hereby granted" in license_text, name
assert 'href="https://github.com/strio-dev/strio-zensical-theme"' in html
components = (root / "components/index.html").read_text()
for hook in ("strio-intro", "strio-actions", "strio-path__title", "strio-tutorial", "strio-tutorial__action", "strio-container-link"):
    assert hook in components, hook
assert "Page not found" in (root / "404.html").read_text()
assert not (root / "overrides").exists()
assert not list(root.rglob("*.py"))
assert not (root / "fonts/InterVariable.ttf").exists()
print(f"Checked {len(pages)} HTML pages: links, anchors, assets, licenses and overrides")
