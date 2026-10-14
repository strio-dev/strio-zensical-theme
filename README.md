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
Supply your own logo and favicon; Coopr's inversion/sizing is specific
to its monochrome wordmark. The copy/toc scripts depend on the pinned modern theme
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
