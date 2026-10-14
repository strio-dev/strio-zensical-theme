{
  runCommand,
  python3,
  rsync,
  zensical,
  theme,
  lib,
  src,
  configFile ? "zensical.toml",
  siteUrl ? null,
  name ? "strio-docs",
}:
runCommand name
  {
    SOURCE = src;
    CONFIG_FILE = configFile;
    SITE_URL = if siteUrl == null then "" else siteUrl;
    nativeBuildInputs = [
      zensical
      rsync
      (python3.withPackages (ps: [ ps.tomli-w ]))
    ];
  }
  ''
    python3 ${./prepare.py} --source "$SOURCE" --output "$PWD/work" \
      --theme ${theme}/share/strio-zensical-theme --config-file "$CONFIG_FILE" \
      ${lib.optionalString (siteUrl != null) ''--site-url "$SITE_URL"''}
    export HOME="$TMPDIR"
    work="$PWD/work"
    cd "$(dirname "$work/source/$CONFIG_FILE")"
    zensical build --config-file "$work/source/$CONFIG_FILE" --clean --strict
    mv site "$out"
  ''
