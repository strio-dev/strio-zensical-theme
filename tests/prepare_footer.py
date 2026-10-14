"""Build isolated pagination and interaction fixtures.

Use --controls for interaction_browser.cjs. For footer_options_browser.cjs,
build each of --case hidden/native/empty with its own --output and --site-url,
then serve each output/site directory at the matching URL.
"""
import argparse
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--zensical', default='zensical')
parser.add_argument('--site-url', default='http://127.0.0.1:8765/middle/')
parser.add_argument('--case', choices=['branded', 'hidden', 'native', 'empty'], default='branded')
parser.add_argument('--controls', action='store_true', help='Append the interaction controls fixture to the overview')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
args.output.mkdir(parents=True)  # Refuse to overwrite an existing fixture.
shutil.copytree(root / 'example/docs', args.output / 'docs')
if args.controls:
    overview = args.output / 'docs/index.md'
    overview.write_text(overview.read_text() + '\n' + (root / 'tests/fixtures/controls.md').read_text())
shutil.copytree(root / 'theme/assets', args.output / 'docs', dirs_exist_ok=True)
shutil.copytree(root / 'theme/overrides', args.output / 'overrides')
shutil.copytree(root / 'theme/licenses', args.output / 'docs/licenses/strio')
shutil.copyfile(root / 'LICENSE', args.output / 'docs/licenses/strio/LICENSE')
config = (root / 'example/zensical.toml').read_text()
config = config.replace('https://example.com/acme/', args.site_url)
if args.case in ('native', 'empty'):
    config = config.replace('generator = false', 'generator = false\nstrio_footer = false')
if args.case == 'native':
    config = config.replace('[project]\n', '[project]\ncopyright = "Copyright 2026 Acme"\n')
if args.case == 'hidden':
    overview = args.output / 'docs/index.md'
    overview.write_text('---\nhide:\n  - footer\n---\n\n' + overview.read_text())
config = config.replace('nav = [{ "Overview" = "index.md" }, { "Details" = "details.md" }]', 'nav = [{ "Installing and configuring your first development environment" = "index.md" }, { "Details" = "details.md" }, { "Deploying and maintaining applications in production" = "next.md" }]')
(args.output / 'zensical.toml').write_text(config)
(args.output / 'docs/next.md').write_text('# Deploying and maintaining applications in production\n\nIsolated pagination fixture.\n')
subprocess.run([args.zensical, 'build', '--clean', '--strict'], cwd=args.output, check=True)
