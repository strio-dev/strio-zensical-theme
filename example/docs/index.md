# Acme documentation

Welcome to Acme. This fictional example consumes the packaged Strio theme.

[Read details](details.md){ .md-button .md-button--primary }

## Code

```sh
nix build .#theme
```

## Typography

Shared styles support **strong text**, `inline code`, and [local links](details.md#table).

<div class="strio-paths" markdown>
<div class="strio-path" markdown>
### Documentation
Shared styles provide these documentation cards.
</div>
<div class="strio-path" markdown>
### Integration
Shared assets are copied during the Nix build.
</div>
</div>

## KDL

```kdl
image "fixture" {
  base "scratch"
}
```
