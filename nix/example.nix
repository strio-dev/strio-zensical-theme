{
  runCommand,
  zensical,
  theme,
  python3,
  chroma,
  siteUrl ? "https://example.com/acme/",
}:
runCommand "strio-theme-example"
  {
    SITE_URL = siteUrl;
    nativeBuildInputs = [
      zensical
      chroma
      (python3.withPackages (ps: [ ps.pymdown-extensions ]))
    ];
  }
  ''
    cp -r ${../example} source
    chmod -R u+w source
    cp -r ${theme}/share/strio-zensical-theme/assets/. source/docs/
    cp -r ${theme}/share/strio-zensical-theme/overrides source/overrides
    cd source
    export HOME="$TMPDIR"
    python3 -B -m unittest discover -s ${theme}/share/strio-zensical-theme/python -p 'test_*.py'
    python3 ${../tests/configure_site.py} zensical.toml
    zensical build --clean --strict
    python3 ${../tests/check_site.py} site "$(cat base-path)"
    mv site "$out"
  ''
