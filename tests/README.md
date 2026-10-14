# Browser verification

`nix build .#example .#checks.x86_64-linux.contents` checks the strict example build, package files, local links, anchors, assets and licenses.

`nix build .#checks.x86_64-linux.scoped-preview` checks optional preview source allowlists in isolated temporary projects: excluded private/build paths, symlink boundaries, required inputs, staging updates, live Markdown saves, file creation/deletion and atomic config replacement. It also gates watch installation to verify saves during startup and directory replacement, and checks initialization failures. It uses the real staging helper and inotify watcher with a small server fixture; it does not open or watch the caller's workspace.

For keyboard, reading and native-search checks, create an isolated fixture:

```sh
nix develop --command python3 tests/prepare_footer.py --theme \
  --output /tmp/strio-theme-check --site-url http://127.0.0.1:8765/
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/strio-theme-check/site
```

In another terminal, set `PLAYWRIGHT_CORE` to the installed module directory and `CHROMIUM` to its browser executable. Capture a search reference **before** changing the theme:

```sh
node tests/theme_browser.cjs http://127.0.0.1:8765/ /tmp/strio-search-reference.json --record-search
```

After editing, create a new fixture, serve it at the same URL, and compare:

```sh
node tests/theme_browser.cjs http://127.0.0.1:8765/ /tmp/strio-search-reference.json
```

Results and screenshots are written next to the reference, or under `SCREENSHOT_DIR`. The fixture generator refuses to overwrite an existing directory. Search foreground HTML, computed styles, layout and behavior must match; pixel changes through its translucent backdrop are reported separately.

Run the focused touch checks against the same `--theme` fixture:

```sh
node tests/touch_browser.cjs http://127.0.0.1:8765/
```

Four light/dark mobile/desktop states check 44px action, copy and drawer navigation rows, control-group overlap, keyboard activation, code-copy clearance and compact desktop sizes. The drawer wordmark retains Coopr’s 120px width, intrinsic height and 8px title padding; it is exempt from the 44px target check. The pinned native contents trigger retains its 38px size and floating placement. It rises above footer branding and pagination as those enter the viewport. In short viewports, its existing popup shifts beside the trigger to stay below the header; the normal 54px popup anchor remains unchanged. The floating trigger can overlap other scrolling article controls. Native search retains its existing target and is checked separately above.

For project-accent and shared-syntax checks, build two fresh fixtures and run the self-contained browser driver:

```sh
nix develop --command python3 tests/prepare_footer.py --theme --accent '#9D6B35' --output /tmp/strio-palette-amber --site-url http://127.0.0.1:8765/acme/
nix develop --command python3 tests/prepare_footer.py --theme --accent '#4876BA' --output /tmp/strio-palette-blue --site-url http://127.0.0.1:8765/acme/
node tests/palette_browser.cjs /tmp/strio-palette-amber/site /tmp/strio-palette-blue/site /tmp/strio-palette-results
```

The driver serves the fixtures itself and checks light/dark button, link, focus and tab accents, mode-specific syntax contrast against rendered block/inline backgrounds, shared hue families across project accents and native-search isolation.
