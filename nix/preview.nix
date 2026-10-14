{
  writeShellApplication,
  zensical,
  theme,
  python3,
  rsync,
  inotify-tools,
  coreutils,
  sourceDir ? ".",
  sourcePaths ? null,
  configFile ? "zensical.toml",
}:
let
  shellQuote = value: "'" + builtins.replaceStrings [ "'" ] [ "'\\''" ] (toString value) + "'";
in
assert
  sourcePaths == null
  || (builtins.isList sourcePaths && sourcePaths != [ ] && builtins.all builtins.isString sourcePaths)
  || throw "mkPreview sourcePaths must be a nonempty list of relative path strings";
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
    source_items=(${
      builtins.concatStringsSep " " (map shellQuote (if sourcePaths == null then [ ] else sourcePaths))
    })
    prepare_args=()
    for item in "''${source_items[@]}"; do prepare_args+=(--source-path "$item"); done
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
    watch_pids=()
    watch_log_pids=()
    stop_watchers() {
      for pid in "''${watch_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
      for pid in "''${watch_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
      for pid in "''${watch_log_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
      watch_pids=()
      watch_log_pids=()
    }
    cleanup() {
      trap - EXIT INT TERM
      stop_watchers
      if [[ -n "$serve_pid" ]]; then kill "$serve_pid" 2>/dev/null || true; wait "$serve_pid" 2>/dev/null || true; fi
      rm -rf "$work"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    prepare() {
      python3 ${./prepare.py} --source "$source_path" --output "$work" \
        --theme ${theme}/share/strio-zensical-theme --config-file ${shellQuote configFile} "''${prepare_args[@]}" "$@"
    }
    start_watcher() {
      local ready_fd line established=false
      mkfifo "$work/ready"
      # inotifywait documents its completion announcement (suppressed by --quiet):
      # https://github.com/inotify-tools/inotify-tools/blob/master/man/inotifywait.1.in
      # Pin the locale so this handshake waits for the full recursive installation.
      LC_ALL=C inotifywait --monitor --format '%w%f' \
        --event close_write,create,delete,move,attrib "$@" >"$work/events" 2>"$work/ready" &
      watch_pids+=("$!")
      exec {ready_fd}<"$work/ready"
      rm "$work/ready"
      while IFS= read -r line <&"$ready_fd"; do
        if [[ "$line" == "Watches established." ]]; then established=true; break; fi
        printf '%s\n' "$line" >&2
      done
      if ! "$established"; then
        exec {ready_fd}<&-
        echo "Source watcher failed to establish watches" >&2
        return 1
      fi
      cat <&"$ready_fd" >&2 &
      watch_log_pids+=("$!")
      exec {ready_fd}<&-
    }
    directory_identity() {
      local item parent
      for item in "''${source_items[@]}"; do
        if [[ -d "$source_path/$item" ]]; then stat -c '%d:%i' "$source_path/$item"; fi
        parent=$(dirname "$source_path/$item")
        while [[ "$parent" == "$source_path" || "$parent" == "$source_path/"* ]]; do
          stat -c '%d:%i' "$parent" 2>/dev/null || true
          parent=$(dirname "$parent")
        done
      done
    }
    start_watchers() {
      local item parent
      local directories=() parents=() watch_args=()
      if ((''${#source_items[@]} == 0)); then
        directories=("$source_path")
      else
        watch_args=(--no-dereference)
        for item in "''${source_items[@]}"; do
          if [[ -d "$source_path/$item" ]]; then directories+=("$source_path/$item"); fi
          parent=$(dirname "$source_path/$item")
          while [[ "$parent" == "$source_path" || "$parent" == "$source_path/"* ]]; do
            parents+=("$parent")
            parent=$(dirname "$parent")
          done
        done
      fi
      if ((''${#parents[@]})); then
        # Watch parents without recursion to catch atomic file/directory replacement.
        start_watcher "''${watch_args[@]}" "''${parents[@]}"
      fi
      if ((''${#directories[@]})); then
        start_watcher "''${watch_args[@]}" --recursive "''${directories[@]}"
      fi
    }
    selected_event() {
      local item
      if ((''${#source_items[@]} == 0)); then return 0; fi
      for item in "''${source_items[@]}"; do
        case "$1" in "$source_path/$item"|"$source_path/$item/"*) return 0 ;; esac
        case "$source_path/$item" in "''${1%/}/"*) return 0 ;; esac
      done
      return 1
    }
    pending_event=
    read_event() {
      local fragment=
      if IFS= read -r -t "$1" fragment <&3; then
        _event="$pending_event$fragment"
        pending_event=
        return 0
      fi
      # A timed read can consume a partial line; retain it for the next read.
      pending_event+=$fragment
      return 1
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
    if ((''${#source_items[@]})); then
      prepare --validate-only
    fi
    watch_identity=$(directory_identity)
    start_watchers
    # Stage after all watches are ready, including saves made during installation.
    prepare
    config_hash=$(sha256sum "$config_path")
    start_server
    while kill -0 "$serve_pid" 2>/dev/null; do
      for pid in "''${watch_pids[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then echo "Source watcher stopped" >&2; exit 1; fi
      done
      if read_event 1; then
        if ! selected_event "$_event"; then continue; fi
        # Drain each burst before restaging; only this process runs prepare.
        while read_event 0.2; do :; done
        next_identity=$(directory_identity)
        if [[ "$next_identity" != "$watch_identity" ]]; then
          if ! prepare --validate-only; then
            echo "Could not validate changed source paths; keeping the last valid preview." >&2
            continue
          fi
          stop_watchers
          watch_identity=$next_identity
          start_watchers
        fi
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
