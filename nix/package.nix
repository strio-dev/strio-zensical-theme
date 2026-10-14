{ runCommand }:
runCommand "strio-zensical-theme-0.1.0" { } ''
  mkdir -p "$out/share/strio-zensical-theme"
  cp -r ${../theme}/. "$out/share/strio-zensical-theme/"
  cp ${../LICENSE} "$out/share/strio-zensical-theme/LICENSE"
  cp ${../NOTICE} "$out/share/strio-zensical-theme/NOTICE"
''
