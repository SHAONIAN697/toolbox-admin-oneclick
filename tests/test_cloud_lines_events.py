import unittest
from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "wwwroot" / "admin.js").read_text(encoding="utf-8")


class CloudLineEventTests(unittest.TestCase):
    def test_edit_actions_are_rendered_above_and_below_editor(self):
        start = SOURCE.index("function renderButtonEditRow(tr, button)")
        end = SOURCE.index("function ensureButtonSortUi()", start)
        block = SOURCE[start:end]
        self.assertIn("button-edit-actions-top", block)
        self.assertGreaterEqual(block.count("${editActions}"), 2)

    def test_cloud_line_actions_use_container_delegation_for_dynamic_rows(self):
        start = SOURCE.index("function bindCloudLines(root)")
        end = SOURCE.index("function readCloudLines(root)", start)
        block = SOURCE[start:end]

        self.assertIn("wrap.addEventListener('click'", block)
        self.assertIn("event.target.closest('[data-cloud-add]')", block)
        self.assertIn("event.target.closest('[data-cloud-remove]')", block)
        self.assertIn("event.preventDefault()", block)
        self.assertIn("event.stopPropagation()", block)
        self.assertIn("data-cloud-remove", block)

    def test_action_switch_rebinds_cloud_lines_after_rebuilding_target_control(self):
        start = SOURCE.index("function updateRowTargetState(row, button)")
        end = SOURCE.index("function bindScriptTargetControl(root)", start)
        self.assertIn("bindCloudLines(row);", SOURCE[start:end])

    def test_page_capture_handler_handles_dynamic_route_buttons(self):
        start = SOURCE.index("function bindCloudLineDocumentEvents()")
        end = SOURCE.index("function readCloudLines(root)", start)
        block = SOURCE[start:end]

        self.assertIn("document.addEventListener('click'", block)
        self.assertIn("}, true);", block)
        self.assertIn("closest('[data-cloud-add]')", block)
        self.assertIn("closest('[data-cloud-remove]')", block)
        self.assertIn("querySelector('[data-cloud-lines]')?.insertAdjacentHTML", block)
        self.assertIn("bindCloudLineDocumentEvents();", SOURCE)


if __name__ == "__main__":
    unittest.main()
