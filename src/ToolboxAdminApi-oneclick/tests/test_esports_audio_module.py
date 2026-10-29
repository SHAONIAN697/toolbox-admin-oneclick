import unittest

from app import esports_audio_module_settings


class EsportsAudioModuleSettingsTests(unittest.TestCase):
    def test_enabled_module_requires_https_address_and_sha256(self):
        with self.assertRaises(ValueError):
            esports_audio_module_settings(
                {
                    "enabled": True,
                    "version": "2.2.4",
                    "downloadUrl": "http://downloads.example/module.exe",
                    "sha256": "0" * 64,
                },
                strict=True,
            )

    def test_enabled_module_accepts_valid_manifest(self):
        module = esports_audio_module_settings(
            {
                "enabled": True,
                "version": "2.2.4",
                "downloadUrl": "https://downloads.example/module.exe",
                "backupUrl": "https://backup.example/module.exe",
                "sha256": "A" * 64,
            },
            strict=True,
        )
        self.assertTrue(module["enabled"])
        self.assertEqual("a" * 64, module["sha256"])
        self.assertEqual("windows-x64", module["platform"])

    def test_invalid_optional_backup_is_rejected(self):
        with self.assertRaises(ValueError):
            esports_audio_module_settings(
                {
                    "enabled": False,
                    "downloadUrl": "https://downloads.example/module.zip",
                    "backupUrl": "file:///module.zip",
                },
                strict=True,
            )

    def test_filename_is_sanitized_to_basename(self):
        module = esports_audio_module_settings(
            {
                "fileName": "..\\..\\evil.exe",
                "downloadUrl": "https://downloads.example/module.exe",
            }
        )
        self.assertEqual("evil.exe", module["fileName"])

    def test_enabled_module_rejects_invalid_hash(self):
        with self.assertRaises(ValueError):
            esports_audio_module_settings(
                {
                    "enabled": True,
                    "version": "2.2.4",
                    "downloadUrl": "https://downloads.example/module.exe",
                    "sha256": "not-a-hash",
                },
                strict=True,
            )


if __name__ == "__main__":
    unittest.main()
