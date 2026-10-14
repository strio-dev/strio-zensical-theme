# Strio Zensical theme

Shared CSS, scripts and template overrides for Zensical 0.0.63. [Example site](https://strio-dev.github.io/strio-zensical-theme/).

Add the flake input and select its packages in your docs build:

```nix
inputs.strio-theme.url = "github:strio-dev/strio-zensical-theme";
# Inside perSystem:
theme = inputs.strio-theme.packages.${system}.theme;
zensical = inputs.strio-theme.packages.${system}.zensical;
```

Add `zensical` to `nativeBuildInputs`. In the Nix builder, copy the shared files into your writable documentation source:

```sh
cp -r ${theme}/share/strio-zensical-theme/assets/. docs/
cp -r ${theme}/share/strio-zensical-theme/overrides .
zensical build --clean --strict
```

Adapt [example/zensical.toml](example/zensical.toml) for your project’s logo and content.

```sh
nix build .#theme .#example
nix run .#preview          # http://127.0.0.1:8000
nix flake check
```

[MIT License](LICENSE); attribution in [NOTICE](NOTICE).
