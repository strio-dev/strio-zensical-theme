# Strio Zensical theme

Shared styling and overrides for Zensical 0.0.63. [Acme example](https://strio-dev.github.io/strio-zensical-theme/).

Pin the dependency in your flake lock, then pass your documentation source:

```nix
inputs.strio-theme.url = "github:strio-dev/strio-zensical-theme";
# Inside flake-parts perSystem:
packages.docs = inputs.strio-theme.lib.mkZensicalSite {
  inherit system;
  src = ./documentation;
  # Optional deployment URL, including a Pages subpath:
  siteUrl = "https://example.com/docs/";
};
apps.docs-preview = inputs.strio-theme.lib.mkPreview {
  inherit system;
  sourceDir = "documentation";
};
```

Keep `zensical.toml`, Markdown and your logo in that source. Adapt [Acme’s config](example/zensical.toml). Theme files are staged automatically outside your source tree. Shared CSS and JavaScript URLs include a content hash so browsers cannot mix cached theme assets from different releases. Project settings override defaults; project CSS and scripts follow the shared assets. Set `project.repo_url` and `project.repo_name` to enable the native navbar and drawer repository link.

Header wordmarks use a shared typography canvas: lowercase letter bodies occupy 70% of its height, while the complete artwork is centered vertically inside it. Include every ascender, dot, descender and symbol; preserve the paths and spacing. In native SVG coordinates, canvas height is lowercase body height divided by 0.7. Center that canvas on the complete artwork, retaining intentional whitespace. The shared CSS uses ordinary heights of 31.13px on desktop and 27.66px through 600px, with intrinsic width and flex centering. This gives about 21.79px / 19.36px lowercase bodies without project scale or translation overrides. The Strio footer keeps its 89px visible width. When upgrading from logo scale/shift overrides, normalize the SVG and remove those overrides in the same change as the theme pin.

The shared palette uses muted amber for the UI accent. Choose a project hue in `zensical.toml`, as Acme does:

```toml
[project.extra]
strio_accent = "#4876BA"
```

Use a six-digit hex color. The build adjusts lightness when needed for contrast in both modes; buttons, link decoration, focus and current navigation use the resulting hue. Syntax hue families stay fixed across projects, with readable mode-specific shades on the shared code surfaces: `#F8F8F8` in light mode and `#202020` in dark mode. Project CSS and scripts load after the generated theme assets.

[Acme’s component examples](example/docs/components.md) show intro text, action groups, information cards, tutorial cards and compact outline links.

```sh
nix build .#docs
nix run .#docs-preview           # live edits at http://127.0.0.1:8000
nix run .#docs-preview -- --dev-addr 127.0.0.1:8080
```

This repository uses `nix build .#example` and `nix run .#preview`. The standalone `theme` and `zensical` packages remain available for custom builders.

For docs in a repository root, limit live staging and watching to the documentation inputs:

```nix
apps.docs-preview = inputs.strio-theme.lib.mkPreview {
  inherit system;
  sourceDir = ".";
  sourcePaths = [ "docs" "zensical.toml" ];
};
```

`sourcePaths` selects the config, its docs directory and any project template overrides. Only those inputs are staged and watched, including new files and atomic saves. Use existing plain relative paths; file symlinks must target another selected file, and directory symlinks are unsupported. Omit it when `sourceDir` contains only documentation.

Run `nix flake check` for the package, strict examples and preview regressions. Browser drivers in `tests/` use an installed Playwright and Chromium; generated fixtures stay outside the repository.

[MIT License](LICENSE); third-party notices in [theme/licenses](theme/licenses).
