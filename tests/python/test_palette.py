import colorsys
from pathlib import Path
import tempfile
import unittest

from strio_palette import ACCENT_CSS, DEFAULT_ACCENT, accent_colors, configure, contrast, rgb


class PaletteTests(unittest.TestCase):
    def assert_usable(self, color):
        self.assertGreaterEqual(contrast(color, "#FFFFFF"), 4.5)
        for surface in ("#FFFFFF", "#F5F6F5", "#151515", "#202020"):
            self.assertGreaterEqual(contrast(color, surface), 3)

    def test_reviewed_amber_and_acme_blue_preserved(self):
        for seed in (DEFAULT_ACCENT, "#4876BA"):
            colors = accent_colors(seed)
            self.assertEqual(colors["accent"], seed)
            self.assert_usable(colors["accent"])
            self.assert_usable(colors["hover"])

    def test_extreme_colors_are_safe_and_deterministic(self):
        for seed in ("#FFFFFF", "#000000", "#FFFF00", "#0000FF", "#FF0000", "#00FF00", "#FF00FF", "#00FFFF", "#777777"):
            colors = accent_colors(seed)
            self.assertEqual(colors, accent_colors(seed.lower()))
            self.assert_usable(colors["accent"])
            self.assert_usable(colors["hover"])
            self.assertNotEqual(colors["accent"], colors["hover"])
            seed_hue, _, seed_saturation = colorsys.rgb_to_hls(*rgb(seed))
            hue, _, saturation = colorsys.rgb_to_hls(*rgb(colors["accent"]))
            if seed_saturation:
                self.assertLess(min(abs(hue - seed_hue), 1 - abs(hue - seed_hue)), 0.005)
                self.assertAlmostEqual(saturation, seed_saturation, delta=0.015)
            else:
                self.assertEqual(saturation, 0)

    def test_rounded_edge_candidates_remain_safe(self):
        for seed in ("#747474", "#767676", "#956432", "#BC718C", "#426FB1"):
            colors = accent_colors(seed)
            self.assert_usable(colors["accent"])
            self.assert_usable(colors["hover"])

    def test_invalid_input_fails(self):
        for value in (None, False, 42, [], {}, "red", "#fff", "#123456; color:red", "#123456\n", "#GGGGGG"):
            with self.assertRaises(ValueError):
                accent_colors(value)

    def test_configuration_emits_local_css_before_consumer_overrides(self):
        with tempfile.TemporaryDirectory() as temporary:
            docs = Path(temporary)
            project = {"extra": {"strio_accent": "#4876ba"}, "extra_css": ["stylesheets/strio.css", "stylesheets/palette.css", "custom.css"]}
            colors = configure(project, docs)
            self.assertEqual(colors["accent"], "#4876BA")
            self.assertEqual(project["extra_css"], ["stylesheets/strio.css", "stylesheets/palette.css", ACCENT_CSS, "custom.css"])
            output = (docs / ACCENT_CSS).read_text()
            self.assertIn("body[data-md-color-scheme]", output)
            self.assertIn("--strio-palette-accent: #4876BA", output)
            self.assertNotIn("--md-", output)
            self.assertNotIn("code-", output)
            with self.assertRaisesRegex(ValueError, "already in the project source"):
                configure(project, docs)


if __name__ == "__main__":
    unittest.main()
