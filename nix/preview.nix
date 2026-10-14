{
  writeShellApplication,
  zensical,
  theme,
  python3,
  rsync,
  inotify-tools,
  coreutils,
  sourceDir ? ".",
  configFile ? "zensical.toml",
}:
let
  shellQuote = value: "'" + builtins.replaceStrings [ "'" ] [ "'\\''" ] (toString value) + "'";
in
writeShellApplication {
  name = "strio-docs-preview";
  runtimeInputs = [
    zensical
    rsync
    inotify-tools
    coreutils
    (python3.withPackages (ps: [ ps.tomli-w ]))
  ];
  text = ''
    source_path=${shellQuote sourceDir}
    addr=127.0.0.1:8000
    source_given=false
    while (($#)); do
      case "$1" in
        --dev-addr)
          if (($# < 2)); then echo "--dev-addr requires host:port" >&2; exit 2; fi
          addr=$2
          shift 2
          ;;
        --help|-h)
          echo "Usage: strio-docs-preview [SOURCE] [--dev-addr HOST:PORT]"
          exit 0
          ;;
        --*) echo "Unknown option: $1" >&2; exit 2 ;;
        *)
          if "$source_given"; then echo "Only one source directory is accepted" >&2; exit 2; fi
          source_path=$1
          source_given=true
          shift
          ;;
      esac
    done
    source_path=$(realpath -e "$source_path")
    test -d "$source_path"
    if [[ "$source_path" == / ]]; then echo "Choose a project directory, not /" >&2; exit 2; fi
    work=$(mktemp -d /tmp/strio-docs-preview.XXXXXXXX)
    case "$work/" in
      "$source_path/"*)
        rm -rf "$work"
        echo "Source must not contain the temporary preview directory" >&2
        exit 2
        ;;
    esac
    config_path="$work/source/"${shellQuote configFile}
    serve_pid=
    watch_pid=
    cleanup() {
      trap - EXIT INT TERM
      if [[ -n "$watch_pid" ]]; then kill "$watch_pid" 2>/dev/null || true; wait "$watch_pid" 2>/dev/null || true; fi
      if [[ -n "$serve_pid" ]]; then kill "$serve_pid" 2>/dev/null || true; wait "$serve_pid" 2>/dev/null || true; fi
      rm -rf "$work"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    prepare() {
      python3 ${./prepare.py} --source "$source_path" --output "$work" \
        --theme ${theme}/share/strio-zensical-theme --config-file ${shellQuote configFile}
    }
    start_server() {
      (
        cd "$(dirname "$config_path")"
        exec zensical serve --config-file "$config_path" --dev-addr "$addr"
      ) &
      serve_pid=$!
    }
    mkfifo "$work/events"
    # Open both ends so startup never blocks waiting for the watcher.
    exec 3<>"$work/events"
    inotifywait --monitor --recursive --quiet --format '%e' \
      --event close_write,create,delete,move,attrib "$source_path" >"$work/events" &
    watch_pid=$!
    prepare
    config_hash=$(sha256sum "$config_path")
    start_server
    while kill -0 "$serve_pid" 2>/dev/null; do
      if ! kill -0 "$watch_pid" 2>/dev/null; then echo "Source watcher stopped" >&2; exit 1; fi
      if IFS= read -r -t 1 _event <&3; then
        # Drain each burst before restaging; only this process runs prepare.
        while IFS= read -r -t 0.2 _event <&3; do :; done
        if ! prepare; then
          echo "Could not restage source; keeping the last valid preview. Fix the source and save again to retry." >&2
          continue
        fi
        next_hash=$(sha256sum "$config_path")
        if [[ "$next_hash" != "$config_hash" ]]; then
          kill "$serve_pid" 2>/dev/null || true
          wait "$serve_pid" 2>/dev/null || true
          config_hash=$next_hash
          start_server
        fi
      fi
    done
    wait "$serve_pid"
  '';
}
