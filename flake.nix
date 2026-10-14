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
      flake.lib.mkExample =
        { system, siteUrl }:
        let
          pkgs = inputs.nixpkgs.legacyPackages.${system};
        in
        pkgs.callPackage ./nix/example.nix {
          theme = inputs.self.packages.${system}.theme;
          zensical = inputs.self.packages.${system}.zensical;
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
          example = pkgs.callPackage ./nix/example.nix { inherit theme zensical; };
          preview = pkgs.writeShellApplication {
            name = "strio-theme-preview";
            runtimeInputs = [
              zensical
              pkgs.coreutils
            ];
            text = ''
              work=$(mktemp -d)
              trap 'rm -rf "$work"' EXIT
              cp -r ${./example}/. "$work/"
              chmod -R u+w "$work"
              cp -r ${theme}/share/strio-zensical-theme/assets/. "$work/docs/"
              cp -r ${theme}/share/strio-zensical-theme/overrides "$work/overrides"
              mkdir -p "$work/docs/licenses/strio"
              cp ${theme}/share/strio-zensical-theme/{LICENSE,licenses/*} "$work/docs/licenses/strio/"
              chmod -R u+w "$work"
              cd "$work"
              zensical serve --dev-addr 127.0.0.1:8000
            '';
          };
        in
        {
          packages = {
            default = theme;
            inherit theme example zensical;
          };
          checks = {
            example = example;
            pages-example = inputs.self.lib.mkExample {
              system = pkgs.stdenv.hostPlatform.system;
              siteUrl = "https://strio-dev.github.io/strio-zensical-theme/";
            };
            workflows = pkgs.runCommand "strio-workflow-lint" { nativeBuildInputs = [ pkgs.actionlint ]; } ''
              actionlint -shellcheck= ${./.github/workflows/ci.yml} ${./.github/workflows/pages.yml}
              mkdir "$out"
            '';
            contents = pkgs.runCommand "strio-theme-contents" { } ''
              test -s ${theme}/share/strio-zensical-theme/assets/stylesheets/strio.css
              test -s ${theme}/share/strio-zensical-theme/assets/javascripts/copy.js
              test -s ${theme}/share/strio-zensical-theme/assets/javascripts/toc.js
              test -s ${theme}/share/strio-zensical-theme/overrides/main.html
              test -s ${theme}/share/strio-zensical-theme/overrides/404.html
              test -s ${theme}/share/strio-zensical-theme/overrides/partials/footer.html
              test -s ${theme}/share/strio-zensical-theme/overrides/.icons/strio/wordmark.svg
              test -s ${theme}/share/strio-zensical-theme/LICENSE
              test -s ${theme}/share/strio-zensical-theme/licenses/Upstream-MIT.txt
              test -s ${theme}/share/strio-zensical-theme/licenses/Zensical-MIT.txt
              mkdir "$out"
            '';
          };
          apps.preview = {
            type = "app";
            program = "${preview}/bin/strio-theme-preview";
          };
          devShells.default = pkgs.mkShell {
            packages = [
              zensical
              pkgs.python3
              pkgs.nixfmt-tree
            ];
          };
          formatter = pkgs.nixfmt-tree;
        };
    };
}
