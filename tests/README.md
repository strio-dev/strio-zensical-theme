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

Four light/dark mobile/desktop states check 44px action, copy and drawer navigation rows, control-group overlap, keyboard activation, code-copy clearance and compact desktop sizes. The drawer wordmark retains Coopr’s 120px width, intrinsic height and 8px title padding; it is exempt from the 44px target check. The pinned native contents trigger retains its 38px size and floating placement. It stays 32px above the viewport bottom until footer branding or pagination reaches it, then tracks that boundary with 5px clearance and no position transition. The popup adapts the [official shadcn popover motion](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/popover.tsx): a 150ms ease-out fade and 95% zoom from an 8px lower pose, anchored to its bottom-right corner. Opening and closing remain monotonic, and reduced motion removes both transforms and transitions immediately. In short viewports, its existing popup shifts beside the trigger to stay below the header; the normal 54px popup anchor remains unchanged. The floating trigger can overlap other scrolling article controls. Native search retains its existing target and is checked separately above.

The docs title bar is 64px at every viewport size. Its project wordmark matches the homepage header's visible height (26.84px through 600px; 30.20px above), with intrinsic width and project CSS compensation for SVG padding. The bottom wordmark row follows the homepage's 27px vertical padding and 89px logo. Its divider fills the available width up to the native 61rem docs grid, including the sidebar and contents columns. The logo keeps the homepage's 24px horizontal inset through 600px and 40px above that, including when the divider reaches the docs grid limit. Previous/next navigation stays in the article.

For continuous contents-button tracking on short and tall mobile viewports in both modes, run the self-contained driver against the generated fixture:

```sh
node tests/contents_tracking_browser.cjs /tmp/strio-theme-check/site /tmp/strio-contents-tracking
```

It samples both scroll directions across the footer boundary, checks the corner inset, exact collision clearance, monotonic movement and absence of settling, and verifies popup keyboard behavior and reduced motion. Measurements and screenshots are written to the supplied output directory. The driver hit-tests the trigger and pagination throughout the sweep and checks pointer and keyboard popup access. At viewport heights of 400px or less, pagination reserves a 54px lane on its right side for the native control; the control can stay beside navigation and continue clearing the footer without entering the header. Taller viewports retain the full-width pagination and normal collision tracking.

For the compact popup motion, use the same generated fixture:

```sh
node tests/contents_motion_browser.cjs /tmp/strio-theme-check/site /tmp/strio-contents-motion
```

This driver samples opening, visible closing and rapid reversals for opacity, scale and vertical movement, including RTL and short viewports. It checks no overshoot, immediate reduced-motion states, native keyboard/pointer access, unchanged trigger/footer tracking and the 959px/960px desktop boundary. Full mobile popup screenshots and frame measurements are written to the output directory.

For project-accent and shared-syntax checks, build two fresh fixtures and run the self-contained browser driver:

```sh
nix develop --command python3 tests/prepare_footer.py --theme --accent '#9D6B35' --output /tmp/strio-palette-amber --site-url http://127.0.0.1:8765/acme/
nix develop --command python3 tests/prepare_footer.py --theme --accent '#4876BA' --output /tmp/strio-palette-blue --site-url http://127.0.0.1:8765/acme/
node tests/palette_browser.cjs /tmp/strio-palette-amber/site /tmp/strio-palette-blue/site /tmp/strio-palette-results
```

The driver serves the fixtures itself and checks light/dark button, link, focus and tab accents, mode-specific syntax contrast against rendered block/inline backgrounds, shared hue families across project accents and native-search isolation.

For panel corners and nested controls, create and serve the isolated gallery:

```sh
nix develop --command python3 tests/prepare_footer.py --panels \
  --output /tmp/strio-panels-check --site-url http://127.0.0.1:8765/
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/strio-panels-check/site
```

With `PLAYWRIGHT_CORE` and `CHROMIUM` set as above, run in another terminal:

```sh
EVIDENCE_DIR=/tmp/strio-panel-results node tests/panels_browser.cjs http://127.0.0.1:8765/panels/
```

The driver checks fixed 8px enclosures in both modes from 320px to 2000px, joined code/title/line-number/output contours, expandable panels, tabs, scrolling code, copy clearance and keyboard access. Buttons, navigation pills and inline code retain their existing corners. Tabs follow the [official Luma default style](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-luma.css#L373): a muted capsule rail with a selected capsule, 4px inset, 14px labels and 8px separation from content. The rail is 36px high on desktop and 52px on touch layouts, keeping each native radio label 44px high on touch devices. Tab code panels retain their own 8px corners. Pointer and keyboard selection, visible focus and project-accent focus rings are checked. Gallery and overview screenshots are saved with the measurements. Native-search isolation uses `theme_browser.cjs` above.
