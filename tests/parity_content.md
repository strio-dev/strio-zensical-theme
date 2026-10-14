## Controls and spacing

<div class="coopr-intro" markdown>
Introductory text uses the original Coopr typography scale.
</div>

[Primary action](details.md){ .md-button .md-button--primary }
[Secondary action](details.md){ .md-button }
{ .coopr-actions }

[Container guide](details.md){ .md-button .coopr-container-link }

[**Tutorial card**
<span>Continue with a local example.</span>
<span class="coopr-tutorial__action">Start tutorial</span>](details.md){ .coopr-path .coopr-tutorial }

## Filename and clipboard

```sh title="build.sh"
printf 'parity specimen'
```

```{ .text .no-copy }
Read-only output has no clipboard control.
```

<div data-copy="copy override specimen" markdown>
```sh
Visible illustrative command
```
</div>

## Tables

| Feature | State | Notes |
| --- | --- | --- |
| Copy | Enabled | `inline code` |
| Palette | Both | **strong** and *emphasis* |
| Layout | Responsive | [Local navigation](details.md) |

## Tabs

=== "Shell"

    ```sh
    echo shell specimen
    ```

=== "Nix"

    ```nix
    { example = true; }
    ```

## Admonition presentation

<div class="admonition note" markdown>
<p class="admonition-title">Note</p>
Coopr does not explicitly enable the admonition Markdown extension. This fixture
uses its supported md_in_html mechanism to exercise the built-in presentation.
</div>

## Scroll target

Longer prose checks article gutters and sticky navigation as the page scrolls.
The same content, identity and configuration appear in both comparison builds.

## Final target

[Return to top](#acme-documentation)
