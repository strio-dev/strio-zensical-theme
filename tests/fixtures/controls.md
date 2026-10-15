## Controls

<div class="strio-intro" markdown>
Try the controls below and continue to the details page.
</div>

[Primary action](details.md){ .md-button .md-button--primary }
[Secondary action](details.md){ .md-button }
{ .strio-actions }

## Filename and clipboard

```sh title="build.sh"
printf 'clipboard specimen'
```

```{ .text .no-copy }
Read-only output has no clipboard control.
```

```{ .text .copy .no-copy }
explicit copy specimen
```

<div data-copy="copy override specimen" markdown>
```sh
Visible illustrative command
```
</div>

## Tabs

=== "Shell"

    ```sh
    echo shell specimen
    ```

=== "Nix"

    ```nix
    { example = true; }
    ```

## Tables

| Feature | State |
| --- | --- |
| Copy | Enabled |
| Local navigation | [Details](details.md) |

## Final target

[Return to top](#acme-documentation)

## Syntax and inline code

Inspect `build_config` and `timeout=30` alongside a highlighted example.

```python
# Keep configuration local and explicit.
from pathlib import Path

def build_config(enabled: bool = True):
    return {"name": "acme", "timeout": 30,
            "root": Path("."), "enabled": enabled}

print(build_config())
```
