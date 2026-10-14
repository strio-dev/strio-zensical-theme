"""Build a real three-page fixture for first/middle/last pagination checks."""
import argparse
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--zensical', default='zensical')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
args.output.mkdir(parents=True)  # Refuse to overwrite an existing fixture.
shutil.copytree(root / 'example/docs', args.output / 'docs')
shutil.copytree(root / 'theme/assets', args.output / 'docs', dirs_exist_ok=True)
shutil.copytree(root / 'theme/overrides', args.output / 'overrides')
config = (root / 'example/zensical.toml').read_text()
config = config.replace('https://example.com/acme/', 'http://127.0.0.1:8765/middle/')
config = config.replace('nav = [{ "Overview" = "index.md" }, { "Details" = "details.md" }]', 'nav = [{ "Installing and configuring your first development environment" = "index.md" }, { "Details" = "details.md" }, { "Deploying and maintaining applications in production" = "next.md" }]')
(args.output / 'zensical.toml').write_text(config)
(args.output / 'docs/next.md').write_text('# Deploying and maintaining applications in production\n\nIsolated pagination fixture.\n')
subprocess.run([args.zensical, 'build', '--clean', '--strict'], cwd=args.output, check=True)
