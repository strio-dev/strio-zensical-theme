"""Set the explicit deployment URL before the deterministic docs build."""
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
url = os.environ["SITE_URL"].rstrip("/") + "/"
parsed = urlsplit(url)
assert parsed.scheme in {"http", "https"} and parsed.hostname, "SITE_URL must be an absolute HTTP(S) URL"
assert not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
assert not any(ord(c) < 32 for c in url)
path = Path(sys.argv[1])
config, count = re.subn(r'^site_url = .*$', lambda _: "site_url = " + json.dumps(url), path.read_text(), flags=re.MULTILINE)
assert count == 1, "Expected exactly one site_url setting"
path.write_text(config)
Path("base-path").write_text(parsed.path)
