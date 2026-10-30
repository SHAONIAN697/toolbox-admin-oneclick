import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class ClientForcedUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")

    def test_embedded_policy_is_checked_before_startup_overlay_is_hidden(self):
        tick = self.source[
            self.source.index("startupRenderTimer.Tick += delegate"):
            self.source.index("startupNetworkTimer =", self.source.index("startupRenderTimer.Tick += delegate"))
        ]
        self.assertLess(tick.index("ApplyInitialEmbeddedConfig();"), tick.index("EnforceEmbeddedUpdatePolicy();"))
        self.assertLess(tick.index("EnforceEmbeddedUpdatePolicy();"), tick.index("HideStartupOverlay();"))

    def test_not_modified_config_response_still_rechecks_policy(self):
        no_change = self.source[
            self.source.index("if (downloaded == null)"):
            self.source.index("json = NormalizeConfigJson(downloaded);", self.source.index("if (downloaded == null)"))
        ]
        self.assertIn("EnforceUpdatePolicy(AsDict(Get(config, \"app\")))", no_change)

    def test_force_block_applies_selected_variant_minimum(self):
        method = self.source[
            self.source.index("private bool EnforceUpdatePolicy("):
            self.source.index("private static Dictionary<string, object> UpdatePolicyForCurrentVariant", self.source.index("private bool EnforceUpdatePolicy("))
        ]
        self.assertIn("app = UpdatePolicyForCurrentVariant(app);", method)
        self.assertIn("BoolValue(app, \"update_force\", false) && current.CompareTo(minimumAllowed) < 0", method)

if __name__ == "__main__":
    unittest.main()
