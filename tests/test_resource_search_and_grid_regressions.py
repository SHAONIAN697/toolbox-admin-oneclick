import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class ResourceSearchAndGridRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")
        cls.admin_source = (CLIENT_SOURCE.parents[1] / "wwwroot" / "admin.js").read_text(encoding="utf-8")

    def test_all_client_variants_use_the_admin_search_switch(self):
        self.assertIn(
            'return BoolValue(features, "resource_search_enabled", false);',
            self.source,
        )
        self.assertIn("if (resourceSearchButtonHost == null) return;", self.source)
        self.assertNotIn("resourceSearchButtonHost == null || vst76Variant", self.source)

    def test_audio_shell_exposes_a_search_button_host(self):
        self.assertIn("Dock = DockStyle.Right, Width = 294, Height = 42", self.source)
        self.assertIn("titleBar.Controls.Add(chrome);\n            resourceSearchButtonHost = chrome;\n            downloadTasksButton", self.source)

    def test_resource_search_input_has_no_outer_border(self):
        self.assertIn("resourceSearchHost.Padding = Padding.Empty;", self.source)
        self.assertNotIn("PaintResourceSearchBorder", self.source)

    def test_resource_search_button_has_no_outer_border(self):
        self.assertIn("if (searchGlyph != null) searchGlyph.BorderColor = Color.Transparent;", self.source)

    def test_resource_search_is_admin_controlled_in_server_defaults(self):
        server_source = (CLIENT_SOURCE.parents[1] / "app.py").read_text(encoding="utf-8")
        self.assertIn('"resource_search_enabled": False', server_source)
        self.assertIn(
            'resource_search_enabled = config_bool(features.get("resource_search_enabled"), False)',
            server_source,
        )

    def test_admin_panel_reads_and_saves_the_search_switch(self):
        self.assertIn('id="resourceSearchEnabled"', self.admin_source)
        self.assertIn("features.resource_search_enabled = $('resourceSearchEnabled')?.checked === true;", self.admin_source)

    def test_config_refresh_rebuilds_current_search_instead_of_resetting_page(self):
        self.assertIn("bool refreshCurrentSearchPage = resourceSearchActive", self.source)
        self.assertIn("if (resourceSearchActive && !refreshCurrentSearchPage)", self.source)
        self.assertIn("ExecuteResourceSearch();", self.source)

    def test_grid_scroll_reserves_bottom_space_for_last_row(self):
        self.assertIn("content.PerformLayout();", self.source)
        self.assertIn("int requiredScrollBottom = requiredBottom + bottomPadding;", self.source)
        self.assertIn("content.AutoScrollMinSize = new Size(0, requiredScrollBottom);", self.source)


if __name__ == "__main__":
    unittest.main()
