# Strio Zensical theme

Reusable local CSS, JavaScript and Jinja overrides extracted from Coopr. MIT; see
LICENSE and NOTICE. The Acme fixture uses the approved Corner logo only in example/docs/assets. Optional identities/coopr SVGs retain
Coopr's accepted outlines unchanged. Consumers
own their name, navigation, logo, favicon and identity stylesheet. Bale is currently
unstyled and has not been changed.

## Build and preview

```sh
nix build .#theme       # also the default package
nix build .#example     # strict isolated fixture, with link/asset checks
nix flake check
nix run .#preview       # http://127.0.0.1:8000; temporary workspace, Ctrl-C cleans up
nix develop            # pinned Zensical, Python, Nix formatter
```

Outputs on x86_64-linux and aarch64-linux: packages.theme/default (assets),
packages.example (Acme static HTML), packages.zensical (0.0.63), checks.contents,
checks.example, checks.pages-example, checks.workflows, apps.preview, devShells.default and formatter.
Preview uses the current Nix source snapshot; restart after editing theme/fixture files.

## Consumer integration

Add the shared theme flake input:

```nix
inputs.strio-theme.url = "github:strio-dev/strio-zensical-theme";
inputs.strio-theme.inputs.nixpkgs.follows = "nixpkgs";
# Inside perSystem:
theme = inputs.strio-theme.packages.${pkgs.stdenv.hostPlatform.system}.theme;
# In the consumer docs derivation, after copying writable source:
# cp -r ${theme}/share/strio-zensical-theme/assets/. source/docs/
# cp -r ${theme}/share/strio-zensical-theme/overrides source/overrides
# cd source; zensical build --clean --strict
```

The consumer's zensical.toml explicitly selects:

```toml
[project]
extra_css = ["stylesheets/strio.css", "stylesheets/identity.css"]
extra_javascript = ["javascripts/copy.js", "javascripts/toc.js"]
[project.theme]
variant = "modern"
custom_dir = "overrides"
font = false
```

Copy the two palette entries and desired features from example/zensical.toml.
identity.css is optional (omit its extra_css entry unless present).
Supply your own logo and favicon. Shared defaults preserve Coopr's monochrome
logo sizing, slate inversion, mobile visibility and drawer order. Colored logos
can opt out of inversion in a consumer identity stylesheet. The copy/toc scripts depend on the pinned modern theme
DOM and subscription globals, so upgrading Zensical requires fixture revalidation.
All reusable current Coopr overrides are packaged, including strio_copy (native
clipboard controls) and strio_highlight (KDL/Chroma). packages.zensical supplies the
Python import path and Chroma executable; use it in the consumer docs build.
Enable strio_copy and the strio_highlight.format custom fence as shown in the fixture.
The original override unit tests are included and run during the fixture build.
For consumer template customization, copy shared overrides first, then overlay
consumer templates into the single custom_dir. Zensical has no theme-federation API
used here; do not replace built-in theme discovery or install a Python theme plugin.

Verified target: Zensical 0.0.63, matching both sibling Nix pins. Supported integration
uses extra_css, extra_javascript and custom_dir/block overrides, documented at
https://zensical.org/docs/customization/ and exercised by the strict fixture build.
There is no runtime remote font or shared-asset dependency. Nix inputs/tool sources
may need network access on the first build.

Repository: https://github.com/strio-dev/strio-zensical-theme
Acme example: https://strio-dev.github.io/strio-zensical-theme/

Browser verification (optional): with Node, playwright-core and Chromium installed,
start `nix run .#preview`, then run `node tests/browser.cjs`. The logo check also verifies visibility, loading and light/dark inversion.
Set PLAYWRIGHT_CORE
to a module directory and CHROMIUM to the browser executable if needed. PREVIEW_URL
defaults to http://127.0.0.1:8000/ and SCREENSHOT_DIR to /tmp. The check captures
light/dark at 1440px and 390px, rejects overflow/missing controls/browser errors,
and exercises navigation.

Verified on Tempest: 12 override tests, strict Acme build, local links/anchors/assets,
package contents and x86_64 flake checks pass. Chromium appearance/navigation checks
pass in all four viewports, with expected white/#151515 body and #f8f8f8/#202020
code backgrounds. Screenshots visually inspected. Independent code and architecture
review completed. aarch64 is evaluated but not built here.

## CI and GitHub Pages

CI runs on pull requests, main pushes and manual dispatch with contents:read only.
It runs Nix checks (including actionlint, strict Acme builds and proposed Pages
subpath validation), then builds theme/example. No pull_request_target execution.
All actions use immutable commit pins; checkout/Nix pins match Coopr conventions.
CI and Pages build use Coopr's pinned Hestia v3.1.0 cache action, with
upstream-cache-filter and continue-on-error. It uses existing GitHub Actions cache
access, with no new credentials or permission expansion; a cache miss still builds
from the locked sources. Initial cache population may still compile Zensical.

Acme Pages runs on main pushes or manual dispatch of main only. Its build job
reads configure-pages base_url, passes it explicitly to lib.mkExample, validates
links against that URL's path, and uploads the static output. The separate deploy
job has pages:write and id-token:write; build has only contents:read/pages:read.
No example.com placeholder is used in deployed configuration. Shared theme output
continues to exclude the Acme logo and identity stylesheet.

Repository setup: enable Actions and set Settings > Pages > Source to GitHub Actions.
The github-pages environment should permit deployments from main only, plus any
required reviewers. The workflow deliberately does not enable Pages or change settings.

Custom URL build, using the same entry point as Pages:

```sh
SITE_URL=https://strio-dev.github.io/strio-zensical-theme/ nix build --impure --out-link result-pages --expr '
  let theme = builtins.getFlake (toString ./.);
  in theme.lib.mkExample { system = builtins.currentSystem; siteUrl = builtins.getEnv "SITE_URL"; }'
```

The expression reads only the requested URL and checkout path; the resulting Nix
builder uses explicit immutable inputs. configure-pages also supports custom-domain
URLs and root sites, without hardcoding the proposed organization/repo name.

## Coopr appearance comparison

The shared stylesheet keeps Coopr's complete rule order, including logo sizing,
mobile drawer order and sidebar logo treatment. Existing coopr-* Markdown classes
and new strio-* classes both work. The optional coopr-identity.css remains a
compatibility entry point; it no longer supplies missing layout defaults.

To reproduce the visual check with a read-only local Coopr checkout:

```sh
nix build .#theme .#zensical
nix develop
python3 tests/prepare_parity.py --coopr /path/to/coopr \
  --theme-share "$(nix path-info .#theme)/share/strio-zensical-theme" \
  --output /tmp/theme-parity
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/theme-parity
# In another terminal, with playwright-core/Chromium available:
node tests/compare_appearance.cjs \
  http://127.0.0.1:8765/coopr-baseline/site/ \
  http://127.0.0.1:8765/theme-consumer/site/
```

The comparison requires identical authored content, configuration and Coopr identity;
Acme intentionally has its own name/logo and shorter navigation. The fixture adds
code filenames, copy/no-copy/authored copy text, tables, tabs, native admonition
presentation and scroll targets. Coopr does not enable the admonition Markdown
extension; md_in_html renders the fixture's admonition markup without changing defaults.

The appearance matrix covers 390, 599/600/601, 719/720, 959/960, 1219/1220 and
1440 pixels in both palettes, including the drawer wherever available. Captures permit at most ten pixels with one-level
channel differences: the unchanged baseline itself exhibited two such pixels;
the richer baseline-versus-theme drawer capture exhibited six, and one breakpoint
closed capture exhibited three. Header/hamburger geometry
must still match exactly. Only animations and repository counters are suppressed.
This validates these states, rather than claiming all pages and browsers are identical.

`node tests/interaction_parity.cjs BASELINE_URL CONSUMER_URL` additionally exercises
real clipboard text/feedback and authored copy overrides, no-copy exclusion, tabs,
TOC selection, search results, drawer navigation and fixed-header scrolling in both
palettes at 390/1440 pixels. A document sentinel checks actual instant navigation
and history return, rather than only checking that a link reaches its destination.

The footer keeps native Previous/Next labels and links within the article gutters.
An article-width separator sits above navigation; a separate full-width separator
sits above a compact 65px row containing only the approved Strio logo linked to
https://strio.dev. It inherits the documentation palette and adds no remote assets.
Both directions retain full accessible titles and wrap; below 360px they stack.
Set `project.extra.strio_footer=false` for the original native footer. Empty native
metadata is hidden; actual copyright/generator/social metadata remains visible.
Reference: https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/entities/contribute-fields

To verify actual first/middle/last pages, run in `nix develop`:
`python3 tests/prepare_footer.py --output /tmp/strio-footer-fixture`.
Serve its `site` directory and pass the details-page URL as `MIDDLE_URL` alongside
`PREVIEW_URL` to `node tests/footer_browser.cjs`.
