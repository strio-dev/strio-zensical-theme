"""Generate a project's local UI accent without changing shared syntax colors."""
import colorsys
from functools import lru_cache
import re

DEFAULT_ACCENT = "#9D6B35"
ACCENT_CSS = "stylesheets/strio-accent.css"
SURFACES = ("#FFFFFF", "#F5F6F5", "#151515", "#202020")


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))


def luminance(hex_color):
    return sum(weight * (channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
               for channel, weight in zip(rgb(hex_color), (0.2126, 0.7152, 0.0722)))


def contrast(first, second):
    low, high = sorted((luminance(first), luminance(second)))
    return (high + 0.05) / (low + 0.05)


def usable(color):
    return contrast(color, "#FFFFFF") >= 4.5 and all(contrast(color, surface) >= 3 for surface in SURFACES)


def to_hex(channels):
    return "#" + "".join(f"{round(channel * 255):02X}" for channel in channels)


def accent_colors(requested=DEFAULT_ACCENT):
    """Retain valid colors; otherwise adapt only HSL lightness, then verify rounded RGB.

    One opaque color serves both modes: white labels need 4.5:1 and indicators
    need 3:1 on both canvas and raised surfaces. HSL is used only to preserve the
    requested hue and saturation while finding a color in that shared range.
    """
    if not isinstance(requested, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", requested):
        raise ValueError("project.extra.strio_accent must be a six-digit hex color, for example #9D6B35")
    return _accent_colors(requested.upper())


@lru_cache(maxsize=128)
def _accent_colors(requested):
    hue, lightness, saturation = colorsys.rgb_to_hls(*rgb(requested))
    # Searching quantized candidates makes the acceptance decision on actual
    # emitted RGB, including extreme seeds and the narrow common contrast range.
    candidates = []
    for step in range(10001):
        candidate_lightness = step / 10000
        candidate = to_hex(colorsys.hls_to_rgb(hue, candidate_lightness, saturation))
        if usable(candidate):
            candidates.append((candidate_lightness, candidate))
    if not candidates:
        raise ValueError("Could not derive a contrast-safe UI accent from project.extra.strio_accent")
    accent = requested if usable(requested) else min(candidates, key=lambda item: abs(item[0] - lightness))[1]
    _, accent_lightness, _ = colorsys.rgb_to_hls(*rgb(accent))
    # Prefer a modest darker hover; seeds at the lower boundary get a lighter
    # distinct hover within the same contrast-safe interval.
    hover_target = accent_lightness * 0.94
    hover = min(candidates, key=lambda item: abs(item[0] - hover_target))[1]
    if hover == accent:
        hover = min((item for item in candidates if item[1] != accent),
                    key=lambda item: abs(item[0] - accent_lightness * 1.06))[1]
    if requested == DEFAULT_ACCENT:
        hover = "#956432"  # Reviewed amber hover; it meets the same constraints.
    return {"requested": requested, "accent": accent, "hover": hover}


def configure(project, docs):
    """Validate configuration and write reserved local CSS during staging."""
    extra = project.setdefault("extra", {})
    colors = accent_colors(extra.get("strio_accent", DEFAULT_ACCENT))
    css_path = docs / ACCENT_CSS
    if css_path.exists():
        raise ValueError(f"Shared theme generated asset is already in the project source: {ACCENT_CSS}")
    css_path.parent.mkdir(parents=True, exist_ok=True)
    css_path.write_text(
        "/* Generated at build time from project.extra.strio_accent. */\n"
        "body[data-md-color-scheme] {\n"
        f"  --strio-palette-accent: {colors['accent']};\n"
        f"  --strio-palette-accent-hover: {colors['hover']};\n"
        "}\n"
    )
    # Shared generated CSS follows the palette, before consumer overrides.
    assets = [asset for asset in project.get("extra_css", []) if asset != ACCENT_CSS]
    position = assets.index("stylesheets/palette.css") + 1 if "stylesheets/palette.css" in assets else 0
    assets.insert(position, ACCENT_CSS)
    project["extra_css"] = assets
    return colors
