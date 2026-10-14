## Reading rhythm

This paragraph exercises the documentation reading measure using realistic prose. Shared documentation should make the next action easy to find while leaving enough space for headings, examples and supporting detail. A reader moving between a laptop and a phone should see the same hierarchy without losing the context of the current page. These sentences are intentionally longer than the original compact example so line length and vertical rhythm can be judged in the rendered article.

### Nested heading

A short subsection beneath a second-level heading.

#### Supporting detail

[Follow the details page](details.md) or inspect `inline-code-with-a-longer-identifier`.

## Wide specimens

```text title="unbroken-output.txt"
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

| Command | Description | Expected result | Notes |
| --- | --- | --- | --- |
| `build-with-a-long-argument-name` | An intentionally wide table cell for responsive inspection | Successful local build | Content remains accessible through local horizontal scrolling |
| `preview` | Render documentation locally | Preview starts | Fixture content only |

## Admonitions

!!! note "A supporting note"
    Keep supporting context close to the example it explains.

!!! warning "Review before changing source"
    Check the target environment before changing its configuration.

??? info "More detail"
    Additional context can remain collapsed until the reader needs it.
