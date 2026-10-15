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

Header wordmarks use Strio's visible height: about 27px through 600px and 30px above it, with intrinsic width. For an SVG with transparent space inside its viewBox, set the shared theme's `--strio-header-logo-scale` and `--strio-header-logo-shift` in your project `extra_css`, as [Acme does](example/docs/stylesheets/acme.css). Scale is viewBox height divided by visible artwork height; shift is `(viewBox center − artwork center) / viewBox height`, expressed as a percentage. An optical adjustment can align lettering with a reference wordmark, as Acme does. These variables affect the project header logo; the Strio footer remains 89px wide.

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
