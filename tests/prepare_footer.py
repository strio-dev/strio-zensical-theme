"""Build isolated pagination and interaction fixtures.

Use --controls for interaction_browser.cjs. For footer_options_browser.cjs,
build each of --case hidden/native/empty with its own --output and --site-url,
then serve each output/site directory at the matching URL.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib

import tomli_w

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "nix"))
from prepare import merge
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "theme/python"))
from strio_palette import configure

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--zensical', default='zensical')
parser.add_argument('--site-url', default='http://127.0.0.1:8765/middle/')
parser.add_argument('--case', choices=['branded', 'hidden', 'native', 'empty'], default='branded')
parser.add_argument('--controls', action='store_true', help='Append the interaction controls fixture to the overview')
parser.add_argument('--theme', action='store_true', help='Include controls, long TOC, prose, tables and callouts for theme_browser.cjs')
parser.add_argument('--accent', help='Override the fixture project UI accent (#RRGGBB)')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
args.output.mkdir(parents=True)  # Refuse to overwrite an existing fixture.
shutil.copytree(root / 'example/docs', args.output / 'docs')
if args.controls or args.theme:
    overview = args.output / 'docs/index.md'
    overview.write_text(overview.read_text() + '\n' + (root / 'tests/fixtures/controls.md').read_text())
    if args.theme:
        overview.write_text(overview.read_text() + '\n' + (root / 'tests/fixtures/reading.md').read_text())
shutil.copytree(root / 'theme/assets', args.output / 'docs', dirs_exist_ok=True)
shutil.copytree(root / 'theme/overrides', args.output / 'overrides')
shutil.copytree(root / 'theme/licenses', args.output / 'docs/licenses/strio')
shutil.copyfile(root / 'LICENSE', args.output / 'docs/licenses/strio/LICENSE')
config = merge(
    tomllib.loads((root / 'theme/zensical.toml').read_text()),
    tomllib.loads((root / 'example/zensical.toml').read_text()),
)
project = config['project']
if args.accent is not None:
    project['extra']['strio_accent'] = args.accent
configure(project, args.output / 'docs')
project['site_url'] = args.site_url
project['nav'] = [
    {"Installing and configuring your first development environment": "index.md"},
    {"Details": "details.md"},
    {"Deploying and maintaining applications in production": "next.md"},
]
if args.theme:
    project['nav'] = [{'Guides': project['nav']}]
    project['markdown_extensions'].update({'admonition': {}, 'pymdownx.details': {}})
project['theme']['custom_dir'] = 'overrides'
if args.case in ('native', 'empty'):
    project['extra']['strio_footer'] = False
if args.case == 'native':
    project['copyright'] = 'Copyright 2026 Acme'
if args.case == 'hidden':
    overview = args.output / 'docs/index.md'
    overview.write_text('---\nhide:\n  - footer\n---\n\n' + overview.read_text())
(args.output / 'zensical.toml').write_text(tomli_w.dumps(config))
(args.output / 'docs/next.md').write_text('# Deploying and maintaining applications in production\n\nIsolated pagination fixture.\n')
subprocess.run([args.zensical, 'build', '--clean', '--strict'], cwd=args.output, check=True)
