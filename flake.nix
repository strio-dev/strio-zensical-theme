{
  description = "Shared Strio Zensical assets and template overrides";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
  };
  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      flake.lib.mkZensicalSite =
        { system, ... }@args:
        inputs.nixpkgs.legacyPackages.${system}.callPackage ./nix/docs.nix (
          {
            theme = inputs.self.packages.${system}.theme;
            zensical = inputs.self.packages.${system}.zensical;
          }
          // builtins.removeAttrs args [ "system" ]
        );
      flake.lib.mkPreview =
        { system, ... }@args:
        let
          preview = inputs.nixpkgs.legacyPackages.${system}.callPackage ./nix/preview.nix (
            {
              theme = inputs.self.packages.${system}.theme;
              zensical = inputs.self.packages.${system}.zensical;
            }
            // builtins.removeAttrs args [ "system" ]
          );
        in
        {
          type = "app";
          program = "${preview}/bin/strio-docs-preview";
        };
      flake.lib.mkExample =
        { system, siteUrl }:
        inputs.nixpkgs.legacyPackages.${system}.callPackage ./nix/example.nix {
          site = inputs.self.lib.mkZensicalSite {
            inherit system siteUrl;
            src = ./example;
            name = "strio-acme-site";
          };
          inherit siteUrl;
        };
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      perSystem =
        { pkgs, ... }:
        let
          theme = pkgs.callPackage ./nix/package.nix { };
          upstream = pkgs.callPackage ./nix/zensical.nix { };
          zensical = pkgs.runCommand "zensical-strio" { nativeBuildInputs = [ pkgs.makeWrapper ]; } ''
            mkdir -p "$out/bin"
            makeWrapper ${upstream}/bin/zensical "$out/bin/zensical" \
              --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.chroma ]} \
              --prefix PYTHONPATH : ${theme}/share/strio-zensical-theme/python
          '';
          example = inputs.self.lib.mkExample {
            system = pkgs.stdenv.hostPlatform.system;
            siteUrl = "https://example.com/acme/";
          };
          previewFixture = pkgs.callPackage ./nix/preview.nix {
            inherit theme;
            inotify-tools = pkgs.writeShellScriptBin "inotifywait" ''
              if [[ -n "''${PREVIEW_WATCH_FAIL:-}" && " $* " == *" --recursive "* ]]; then
                echo "Simulated watch installation failure" >&2
                exit 1
              fi
              if [[ -n "''${PREVIEW_WATCH_LOG:-}" && " $* " == *" --recursive "* ]]; then
                printf 'install\n' >> "$PREVIEW_WATCH_LOG"
                while [[ ! -f "$PREVIEW_WATCH_LOG.release" ]]; do
                  ${pkgs.coreutils}/bin/sleep 0.01
                done
                ${pkgs.coreutils}/bin/rm "$PREVIEW_WATCH_LOG.release"
              fi
              exec ${pkgs.inotify-tools}/bin/inotifywait "$@"
            '';
            sourcePaths = [
              "docs"
              "zensical.toml"
            ];
            zensical = pkgs.writeShellScriptBin "zensical" ''
              while (($#)); do
                if [[ "$1" == --config-file ]]; then
                  printf '%s\n' "$2" >> "$PREVIEW_LOG"
                  break
                fi
                shift
              done
              exec ${pkgs.coreutils}/bin/sleep infinity
            '';
          };

        in
        {
          packages = {
            default = theme;
            inherit theme example zensical;
          };
          checks = {
            scoped-preview =
              pkgs.runCommand "strio-scoped-preview"
                {
                  nativeBuildInputs = [
                    pkgs.rsync
                    pkgs.coreutils
                    (pkgs.python3.withPackages (ps: [ ps.tomli-w ]))
                  ];
                  PREPARE = ./nix/prepare.py;
                  THEME = "${theme}/share/strio-zensical-theme";
                  PREVIEW = "${previewFixture}/bin/strio-docs-preview";
                }
                ''
                  python3 ${./tests/scoped_preview.py}
                  mkdir "$out"
                '';
            example = example;
            pages-example = inputs.self.lib.mkExample {
              system = pkgs.stdenv.hostPlatform.system;
              siteUrl = "https://strio-dev.github.io/strio-zensical-theme/";
            };
            workflows = pkgs.runCommand "strio-workflow-lint" { nativeBuildInputs = [ pkgs.actionlint ]; } ''
              actionlint -shellcheck= ${./.github/workflows/ci.yml} ${./.github/workflows/pages.yml}
              mkdir "$out"
            '';
            python = pkgs.runCommand "strio-python-tests"
              {
                nativeBuildInputs = [
                  pkgs.chroma
                  (pkgs.python3.withPackages (ps: [ ps.pymdown-extensions ]))
                ];
                PYTHONPATH = "${theme}/share/strio-zensical-theme/python:${./tests/python}";
              }
              ''
                python3 -B -m unittest test_palette test_highlight
                mkdir "$out"
              '';
          };
          apps.preview = inputs.self.lib.mkPreview {
            system = pkgs.stdenv.hostPlatform.system;
            sourceDir = "example";
          };
          devShells.default = pkgs.mkShell {
            packages = [
              zensical
              (pkgs.python3.withPackages (ps: [
                ps.tomli-w
                ps.pymdown-extensions
              ]))
              pkgs.rsync
              pkgs.nixfmt-tree
            ];
          };
          formatter = pkgs.nixfmt-tree;
        };
    };
}
