# Panel examples

The examples below exercise the shared corners with native documentation markup. Inline `code` keeps its existing styling.

[Read overview](index.md){ .md-button .md-button--primary }
[Details](details.md){ .md-button }
{ .strio-actions }

## Cards

<div class="strio-paths" markdown>
<div class="strio-path" markdown>
<p class="strio-path__title">Documentation card</p>

Keep the available options nearby.

[Open reference](details.md)
</div>
<a class="strio-path strio-tutorial" href="details/">
<strong>Tutorial card</strong>
<span>Follow a short example.</span>
<span class="strio-tutorial__action">Read guide</span>
</a>
</div>

<div class="grid cards" markdown>
- **Native grid card**

    Use the existing grid enclosure.

    [Read details](details.md)
</div>

## Code panels

```sh title="build.sh"
printf 'panel clipboard specimen'
```

```sh
printf '%s\n' 'a deliberately long command keeps horizontal scrolling available instead of clipping the copy control or its focus outline'
```

```python linenums="1" title="numbered.py"
name = "example"
print(name)
```

```python linenums="1"
name = "plain numbered example"
print(name)
```

```text
Rendered output remains attached to its code example.
```

<div class="result" markdown>
The output panel completes the lower corners.
</div>

```text title="result.txt"
A titled example can also have attached output.
```

<div class="result" markdown>
The filename and output share one continuous contour.
</div>

## Callouts and expandable panels

!!! note "Callout with nested code"

    A code panel keeps its own corners inside this callout.

    ```sh title="nested.sh"
    printf 'nested specimen'
    ```

    !!! warning "Nested callout"

        Check the surrounding contour and readable spacing.

??? info "Expandable example"

    Keyboard and pointer activation retain the native details behavior.

    ```sh
    printf 'expanded specimen'
    ```

???+ example "Expanded example"

    The open panel retains its original spacing.

    ??? note "Nested expandable example"

        A nested details panel remains operable.

## Tabs

=== "Shell"

    ```sh title="tab.sh"
    printf 'shell tab specimen'
    ```

=== "Nix"

    ```nix linenums="1"
    { example = true; }
    ```

=== "Notes"

    Native tabs retain their open layout and labels.

    !!! note "Note inside a tab"

        The callout supplies its own enclosure.

## Table

| Feature | State | Reference |
| --- | --- | --- |
| Corners | 8px | [Overview](index.md) |
| Controls | Native behavior | [Details](details.md) |
