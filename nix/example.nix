{
  runCommand,
  site,
  python3,
  siteUrl ? "https://example.com/acme/",
}:
runCommand "strio-theme-example"
  {
    SITE_URL = siteUrl;
    nativeBuildInputs = [ python3 ];
  }
  ''
    python3 ${../tests/check_site.py} ${site} "$SITE_URL"
    ln -s ${site} "$out"
  ''
