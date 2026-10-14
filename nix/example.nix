{
  runCommand,
  site,
  theme,
  python3,
  chroma,
  siteUrl ? "https://example.com/acme/",
}:
runCommand "strio-theme-example"
  {
    SITE_URL = siteUrl;
    nativeBuildInputs = [
      chroma
      (python3.withPackages (ps: [ ps.pymdown-extensions ]))
    ];
  }
  ''
    python3 -B -m unittest discover -s ${theme}/share/strio-zensical-theme/python -p 'test_*.py'
    python3 ${../tests/check_site.py} ${site} "$SITE_URL"
    ln -s ${site} "$out"
  ''
