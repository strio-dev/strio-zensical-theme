"""Build identical-content reference and packaged-theme sites; sources stay read-only."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--coopr", type=Path, required=True)
parser.add_argument("--theme-share", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--zensical", default="zensical")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
config = (args.coopr / "zensical.toml").read_text()
a = config.index("nav = [")
b = config.index("\n[project.extra]", a)
config = config[:a] + 'nav = [{"Overview" = "index.md"}, {"Details" = "details.md"}]\n' + config[b:]
config = config.replace("[project.extra]", "[project.extra]\nstrio_footer = false")
config = config.replace('custom_dir = "docs/.overrides"', 'custom_dir = "overrides"')
for name in ("coopr-baseline", "theme-consumer"):
    dest = args.output / name
    dest.mkdir(parents=True)  # Refuse to overwrite an existing comparison.
    shutil.copytree(repo / "example/docs", dest / "docs", dirs_exist_ok=True)
    shutil.copytree(args.coopr / "docs/assets", dest / "docs/assets", dirs_exist_ok=True)
    page = dest / "docs/index.md"
    page.write_text(page.read_text().replace("strio-", "coopr-") + "\n" + (repo / "tests/parity_content.md").read_text())
    current = config.replace('site_url = "https://coopr.strio.dev"', 'site_url = "http://127.0.0.1:8765/"')
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if name == "coopr-baseline":
        shutil.copytree(args.coopr / "docs/.overrides", dest / "overrides")
        shutil.copytree(args.coopr / "docs/javascripts", dest / "docs/javascripts")
        shutil.copy2(args.coopr / "docs/stylesheets/coopr.css", dest / "docs/stylesheets/coopr.css")
        env["PYTHONPATH"] = str(dest / "overrides")
    else:
        shutil.copytree(args.theme_share / "overrides", dest / "overrides")
        shutil.copytree(args.theme_share / "assets", dest / "docs", dirs_exist_ok=True)
        current = current.replace("stylesheets/coopr.css", "stylesheets/strio.css").replace("coopr_copy", "strio_copy").replace("coopr_highlight", "strio_highlight")
        env["PYTHONPATH"] = str(args.theme_share / "python")
    (dest / "zensical.toml").write_text(current)
    subprocess.run([args.zensical, "build", "--clean", "--strict"], cwd=dest, env=env, check=True)
print(f"Serve {args.output} on localhost:8765; compare /coopr-baseline/site/ and /theme-consumer/site/")
