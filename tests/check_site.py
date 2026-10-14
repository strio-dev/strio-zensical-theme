"""Check generated HTML local links/assets, anchors, override use and isolation."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import sys
root = Path(sys.argv[1]).resolve()
base_path = sys.argv[2] if len(sys.argv) > 2 else "/"
class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(); self.path = path; self.refs = []; self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs: self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if key in attrs: self.refs.append(attrs[key])
pages = {}
for path in root.rglob("*.html"):
    page = Page(path); page.feed(path.read_text()); pages[path] = page
errors = []
for path, page in pages.items():
    for ref in page.refs:
        url = urlsplit(ref)
        if url.scheme or url.netloc: continue
        if url.path.startswith("/") and base_path != "/":
            assert url.path.startswith(base_path), ref
            url = url._replace(path="/" + url.path[len(base_path):])
        target = ((root / unquote(url.path.lstrip("/"))) if url.path.startswith("/") else (path.parent / unquote(url.path))) if url.path else path
        if target.is_dir(): target = target / "index.html"
        target = target.resolve()
        if not target.is_relative_to(root) or not target.exists(): errors.append(f"{path.relative_to(root)}: missing {ref}")
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f"{path.relative_to(root)}: missing anchor {ref}")
assert not errors, "\n".join(errors)
html = (root / "index.html").read_text()
for expected in ("stylesheets/strio.css", "stylesheets/acme.css", "assets/acme-corner.svg", "javascripts/copy.js", "javascripts/toc.js", "--strio-code-check-icon"):
    assert expected in html, expected
assert "Acme" in html
assert "strio-code-" in html
assert "language-kdl" in html
assert "Page not found" in (root / "404.html").read_text()
assert not (root / "overrides").exists()
assert not list(root.rglob("*.py"))
print(f"Checked {len(pages)} HTML pages: local links, anchors, assets, overrides and source isolation")

assert 'aria-label="Strio homepage"' in html
assert 'href="https://strio.dev"' in html
assert 'strio-footer__brandbar' in html
assert 'viewBox="108 148.617 396 110.766"' in html
assert not (root / "fonts/InterVariable.ttf").exists()
