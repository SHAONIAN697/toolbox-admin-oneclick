import unittest
from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "wwwroot" / "admin.js").read_text(encoding="utf-8")


class CloudPickerButtonNameTests(unittest.TestCase):
    def test_picker_defaults_name_per_file_and_submits_per_file_names(self):
        self.assertIn("state.cloudPickerButtonNames = {}", SOURCE)
        self.assertIn("data-file-name", SOURCE)
        self.assertIn("state.cloudPickerButtonNames[input.dataset.fileName] = input.value", SOURCE)
        self.assertIn("buttonNames:state.cloudPickerButtonNames || {}", SOURCE)

    def test_name_editor_only_renders_for_new_button_mode(self):
        start = SOURCE.index("function renderCloudPickerRows()")
        end = SOURCE.index("function renderCloudPickerCount()", start)
        block = SOURCE[start:end]
        self.assertIn("mode === 'existing'", block)
        self.assertIn("按钮名称<input", block)
        self.assertIn("maxlength=\"120\"", block)


if __name__ == "__main__":
    unittest.main()
