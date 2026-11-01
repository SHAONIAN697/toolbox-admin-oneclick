import importlib.util
import re
import tempfile
import unittest
from pathlib import Path


class XingguiConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/app.py'
        spec = importlib.util.spec_from_file_location('xinggui_config_tests', path)
        cls.app = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.app)

    def test_https_images_accept_cdn_queries_and_clear(self):
        url = 'https://cdn.example.com/render?id=123&format=png'
        self.assertEqual(url, self.app.normalize_https_image_url(url))
        self.assertEqual('', self.app.normalize_https_image_url(None))
        self.assertEqual('', self.app.normalize_https_image_url(''))

    def test_reject_invalid_image_urls(self):
        for url in ('http://example.com/a.png', 'file:///a.png', '//example.com/a',
                    'https://user:secret@example.com/a', 'https://example.com:bad/a',
                    'https://example.com/a%0a.png', 'https://example.com/a b',
                    'https://example.com\\a', 'https://', 'https://example.com/' + 'x' * 2048):
            with self.subTest(url=url[:80]):
                self.assertEqual('', self.app.normalize_https_image_url(url))

    def test_app_patch_accepts_and_clears_all_image_fields(self):
        config = {'app': {}}
        fields = ('logo_url', 'icon_url', 'exe_icon_url', 'home_banner_url')
        values = {key: 'https://cdn.example.com/' + key for key in fields}
        self.app.apply_app_patch(config, values)
        for key in fields:
            self.assertEqual(values[key], config['app'][key])
        self.app.apply_app_patch(config, {key: '' for key in fields})
        for key in fields:
            self.assertEqual('', config['app'][key])

    def test_basic_settings_patch_preserves_legacy_image_urls_when_hidden(self):
        config = {'app': {
            'logo_url': 'https://cdn.example.com/logo.png',
            'icon_url': 'https://cdn.example.com/icon.png',
            'exe_icon_url': 'https://cdn.example.com/app.ico',
        }}
        self.app.apply_app_patch(config, {
            'title': '星轨工具箱', 'icon': 'https://cdn.example.com/brand.png',
            'exe_icon': 'https://cdn.example.com/brand.ico',
            'home_banner_url': 'https://cdn.example.com/banner.webp',
        })
        self.assertEqual('https://cdn.example.com/logo.png', config['app']['logo_url'])
        self.assertEqual('https://cdn.example.com/icon.png', config['app']['icon_url'])
        self.assertEqual('https://cdn.example.com/app.ico', config['app']['exe_icon_url'])

    def test_variant_has_independent_download_count(self):
        self.assertIn('xinggui', self.app.CLIENT_VARIANT_ORDER)
        self.assertEqual('星轨工具箱', self.app.CLIENT_VARIANTS['xinggui']['label'])
        previous = self.app.CLIENT_DOWNLOAD_STATS_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                self.app.CLIENT_DOWNLOAD_STATS_PATH = Path(directory) / 'counts.json'
                self.assertEqual(1, self.app.record_client_download('xinggui'))
                self.assertEqual(1, self.app.read_client_download_counts()['xinggui'])
                self.assertEqual(0, self.app.read_client_download_counts()['original'])
        finally:
            self.app.CLIENT_DOWNLOAD_STATS_PATH = previous

    def test_xinggui_version_cover_is_persistent_server_default(self):
        self.assertEqual('/xinggui-version-cover.png', self.app.XINGGUI_DEFAULT_COVER_URL)
        variant = next(item for item in self.app.public_client_variants()['variants'] if item['id'] == 'xinggui')
        self.assertEqual('/xinggui-version-cover.png', variant['coverUrl'])
        self.assertTrue((Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/wwwroot/xinggui-version-cover.png').exists())

    def test_password_and_page_access_reuse_existing_client_contracts(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        prompt_start = source.index('private bool PromptPassword(')
        verify_start = source.index('private bool VerifyPassword(', prompt_start)
        prompt = source[prompt_start:verify_start]
        self.assertIn('new XingguiPasswordDialog', prompt)
        self.assertIn('VerifyPassword(value, stored)', prompt)
        self.assertEqual(1, len(re.findall(r'private bool VerifyPassword\(', source)))

        route_start = source.index('private void ShowPage(')
        route_end = source.index('private void ', route_start + 30)
        route = source[route_start:route_end]
        self.assertLess(route.index('EnsurePageUnlocked(id)'), route.index('RenderXingguiHomePage()'))

    def test_xinggui_exe_reuses_existing_icon_setting_and_cover_is_url_only(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/app.py').read_text(encoding='utf-8')
        build_start = source.index('def make_client_exe(')
        build_end = source.index('\ndef ', build_start + 10)
        build = source[build_start:build_end]
        self.assertIn('icon_file = custom_client_icon(app_config, td)', build)
        self.assertIn('cover_url = normalize_https_image_url(cover_url)', source)

        script = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/wwwroot/admin.js').read_text(encoding='utf-8')
        xinggui_controls = re.search(r"variant\.id === 'xinggui'\s*\? `([^`]+)`", script, re.DOTALL).group(1)
        self.assertIn('data-variant-cover-preview', xinggui_controls)
        self.assertNotIn('data-variant-upload', xinggui_controls)

    def test_tuner_search_button_does_not_assign_unsupported_transparent_border(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        start = source.index('private void ApplyResourceSearchTheme()')
        end = source.index('private void SetSearchPlaceholder()', start)
        method = source[start:end]
        self.assertIn('resourceSearchButton.FlatAppearance.BorderSize = 0;', method)
        self.assertIn('resourceSearchButton.FlatAppearance.BorderColor = back;', method)
        self.assertNotIn('resourceSearchButton.FlatAppearance.BorderColor = Color.Transparent;', method)

    def test_xinggui_bottom_password_entry_is_configured_and_reuses_password_verification(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        shell_start = source.index('private void BuildTunerShell()')
        shell_end = source.index('private void LockVst76Pages()', shell_start)
        shell = source[shell_start:shell_end]
        self.assertIn('MakeVst76SideUtilityButton("▣  密码", false)', shell)
        self.assertIn('xingguiPasswordButton.Visible = false;', shell)
        self.assertIn('ShowPage("downloads")', shell)
        self.assertIn('ShowPage("settings")', shell)
        self.assertIn('PromptPassword(storedPassword, "工具箱密码", "请输入工具箱启动密码")', shell)

        config_start = source.index('private void ApplyConfig()')
        config_end = source.index('private void ApplyTheme(', config_start)
        config = source[config_start:config_end]
        self.assertIn('UpdateXingguiPasswordButton();', config)
        self.assertIn('xingguiPasswordButton.Visible = xingguiVariant && !String.IsNullOrWhiteSpace(password) && !passwordUnlocked;', source)
        self.assertIn('UpdateXingguiUtilityLayout();', source)

    def test_xinggui_home_uses_backend_download_actions_and_existing_guards(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        home_start = source.index('private void RenderXingguiHomePage()')
        home_end = source.index('private static void ApplyTunerPalette(', home_start)
        home = source[home_start:home_end]
        self.assertIn('home_banner_url', home)
        self.assertIn('ColumnCount = narrow ? 1 : 2', home)
        self.assertIn('homeSections[0]', home)
        self.assertIn('homeSections[1]', home)
        self.assertIn('PopulateXingguiBusinessPanel(businessPanel, businessItems)', home)
        self.assertIn('item["__search_page_id"] = XingguiHomePageId;', home)
        self.assertIn('RunResourceItemAction(item, info)', home)

        action_start = source.index('private void RunResourceItemAction(')
        action_end = source.index('private bool StartPackageDownload(', action_start)
        action = source[action_start:action_end]
        self.assertIn('EnsurePageUnlocked(pageId)', action)
        self.assertIn('ConfirmButtonGuard', action)
        self.assertIn('RunAction(', action)

    def test_xinggui_brand_uses_shared_settings_and_home_disables_scrolling(self):
        root = Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick'
        client = (root / 'client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        config_start = client.index('private void ApplyConfig()')
        config_end = client.index('private void ApplyTheme(', config_start)
        config = client[config_start:config_end]
        self.assertIn('brandTitle.Text = tunerVariant ? appTitle : displayAppTitle;', config)
        self.assertIn('if (xingguiVariant) brandTitle.Text = displayAppTitle;', config)
        self.assertIn('ApplyAppIcon(brandIconUrl, GetText(app, "logo_text", "Y"));', config)

        home_start = client.index('private void RenderXingguiHomePage()')
        home_end = client.index('private static void ApplyTunerPalette(', home_start)
        home = client[home_start:home_end]
        self.assertIn('content.AutoScroll = false;', home)
        self.assertIn('ResetContentScrollState();', home)
        self.assertIn('content.VerticalScroll.Enabled = false;', home)
        self.assertIn('AutoScroll = false', home)

        html = (root / 'wwwroot/index.html').read_text(encoding='utf-8')
        script = (root / 'wwwroot/admin.js').read_text(encoding='utf-8')
        self.assertNotIn('Logo 图片链接', html + script)
        self.assertNotIn('功能图标链接', html + script)

    def test_xinggui_uses_remote_brand_fields_and_loads_images(self):
        client = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        self.assertIn('if (xingguiVariant) ApplyXingguiImages(app);', client)
        self.assertIn('GetText(app, "exe_icon_url", GetText(app, "exe_icon", ""))', client)
        self.assertIn('mime != "application/octet-stream"', client)
        fetch_image = client[client.index('private static Image FetchXingguiImage('):client.index('private void QueueXingguiImage(')]
        self.assertIn(".Split(new char[] { ';' }, StringSplitOptions.None)", fetch_image)
        self.assertNotRegex(fetch_image, r'\.Split\(\s*[\'\"][^\'\"]+[\'\"]\s*,\s*StringSplitOptions\.')
        self.assertIn('QueueXingguiImage(url, 1400, 420', client)
        home = client[client.index('private void RenderXingguiHomePage()'):client.index('private RoundedPanel CreateXingguiHomePanel(')]
        self.assertIn('AnimatedBanner banner = new AnimatedBanner', home)
        self.assertNotIn('banner.Paint += delegate', home)
        self.assertNotIn('DrawString(headingText', home)
        self.assertNotIn('DrawString(subtitleText', home)
        self.assertIn('banner.Image = new Bitmap(image);', home)
        self.assertIn('private sealed class AnimatedBanner', client)
        self.assertIn('AnimateTo(1.03F)', client)

    def test_tuner_driver_page_resize_does_not_queue_recursive_renders(self):
        client = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        self.assertIn('if ((tunerVariant || vst76Variant) && (currentPage.Equals(TunerDriversPageId', client)
        self.assertIn('currentPage.Equals(TunerLinksPageId', client)
        self.assertIn('content.HorizontalScroll.Enabled = false;', client)
        self.assertIn('content.HorizontalScroll.Visible = false;', client)
        self.assertIn('DisableHorizontalScrollbars(content);', client)
        self.assertIn('private void DisableHorizontalScrollbars(Control root)', client)

    def test_toolbox_buttons_and_window_use_reference_corner_radii(self):
        client = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        tuner_button = client[client.index('private sealed class TunerActionButton'):client.index('private sealed class TunerNavButton')]
        tuner_nav = client[client.index('private sealed class TunerNavButton'):client.index('private sealed class XingguiDownloadCard')]
        self.assertIn('UiRoundRect(rect, 11)', tuner_button)
        self.assertIn('UiRoundRect(rect, 12)', tuner_nav)
        self.assertIn('EnsureRoundedRegion(this, xingguiVariant ? 14 : 12', client)
        self.assertIn('CornerRadius = 14', client)
        template_button = client[client.index('private sealed class TemplateActionButton'):client.index('private sealed class RoundedPanel')]
        self.assertIn('XingguiHomeMode ? 11 : (XingguiBusinessMode ? 9 : 8)', template_button)
        self.assertIn('EnsureRoundedRegion(this, cornerRadius', template_button)

    def test_xinggui_bottom_utility_buttons_keep_contrast_when_active(self):
        client = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        self.assertIn('(vst76Variant || xingguiVariant) && settingsButton != null', client)
        self.assertIn('ApplyXingguiUtilityButtonState(xingguiDownloadButton', client)
        helper = client[client.index('private void ApplyXingguiUtilityButtonState'):client.index('private void UpdatePortalBottomNavState')]
        self.assertIn('Color activeBack = LightTheme ? Color.FromArgb(220, 232, 248) : Color.FromArgb(50, 67, 91)', helper)
        self.assertIn('button.ForeColor = active ? Accent : TextColor;', helper)

    def test_tuner_download_page_disables_both_scrollbars_and_fits_content(self):
        client = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        scrolling = client[client.index('private void UpdateContentScrolling()'):client.index('private void BuildResourceSearchChrome()')]
        self.assertIn('String.Equals(currentPage, "downloads", StringComparison.OrdinalIgnoreCase)', scrolling)
        self.assertIn('content.VerticalScroll.Enabled = false;', scrolling)
        self.assertIn('content.HorizontalScroll.Enabled = false;', scrolling)
        downloads = client[client.index('private void RenderTunerDownloadsPage()'):client.index('private Control CreateTunerDownloadsHeader(')]
        self.assertIn('recordsList.Scrollable = true;', downloads)
        self.assertIn('HideNativeScrollBars(recordsList);', downloads)
        self.assertIn('pageHeight - activeHeight - 150', downloads)
        self.assertIn('private static extern bool ShowScrollBar(IntPtr hWnd, int bar, bool show);', client)

    def test_home_page_is_added_without_moving_other_page_buttons(self):
        cfg = {'app': {'title': '我的品牌'}, 'pages': {'legacy': {'title': '资源', 'sections': [
            {'title': '软件', 'buttons': [{'id': 'old', 'name': '安装包', 'action': 'download', 'download_url': 'https://example.test/setup.exe', 'guard': {'requireConfirm': True}}]},
        ]}}}
        original = self.app.json_clone(cfg['pages']['legacy'])
        self.assertTrue(self.app.ensure_xinggui_home_page(cfg))
        home = cfg['pages']['xinggui_home']
        self.assertEqual([], home['sections'][0]['buttons'])
        self.assertNotIn('xinggui_home', [item.get('id') for item in cfg.get('sidebar', []) if isinstance(item, dict)])
        self.assertEqual(original, cfg['pages']['legacy'])
        home['sections'][1]['buttons'] = []
        self.assertFalse(self.app.ensure_xinggui_home_page(cfg))
        self.assertEqual([], home['sections'][1]['buttons'])

    def test_home_patch_keeps_two_named_columns(self):
        cfg = self.app.default_config()
        self.app.apply_xinggui_home_patch(cfg, {'sections': [
            {'title': '自定义左侧', 'buttons': []}, {'title': '自定义右侧', 'buttons': []},
        ]})
        self.assertEqual(['远程连接', '业务范围'], [section['title'] for section in cfg['pages']['xinggui_home']['sections']])

    def test_home_patch_supports_text_only_buttons_and_complete_download_config(self):
        cfg = self.app.default_config()
        self.app.apply_xinggui_home_patch(cfg, {'sections': [
            {'title': '下载', 'buttons': [{'name': '安装包', 'action': 'download', 'target': 'https://example.test/a.exe', 'backup_url': 'https://example.test/backup.exe', 'download_directory': 'D:/Downloads', 'download_delete_on_exit': True, 'guard': {'requireConfirm': True}}]},
            {'title': '业务', 'buttons': [{'name': '文字按钮', 'target': '', 'action': 'link'}, {'name': '已隐藏', 'enabled': False}]},
        ]})
        home = cfg['pages']['xinggui_home']
        self.assertEqual('', home['sections'][1]['buttons'][0]['url'])
        self.assertTrue(home['sections'][1]['buttons'][0]['enabled'])
        rows, _ = self.app.button_rows(cfg)
        self.assertTrue(any(row['name'] == '文字按钮' for row in rows))
        self.app.normalize_client_config(cfg)
        home = cfg['pages']['xinggui_home']
        self.assertEqual(['文字按钮'], [button['name'] for button in home['sections'][1]['buttons']])
        download = home['sections'][0]['buttons'][0]
        self.assertEqual('https://example.test/a.exe', download['target'])
        self.assertEqual('https://example.test/backup.exe', download['backup_url'])
        self.assertTrue(download['download_delete_on_exit'])

    def test_home_defaults_and_updates_are_isolated_per_user_on_disk(self):
        old = {key: getattr(self.app, key) for key in ('DATA', 'USER_DATA', 'USER_TEMPLATE_PATH')}
        try:
            with tempfile.TemporaryDirectory() as directory:
                self.app.DATA = Path(directory)
                self.app.USER_DATA = Path(directory) / 'users'
                self.app.USER_TEMPLATE_PATH = Path(directory) / 'user-template.json'
                for user in ('a', 'b'):
                    self.app.write_json(self.app.user_config_path(user), {'app': {'title': user}, 'pages': {}})
                a = self.app.read_config('a')
                b = self.app.read_config('b')
                self.assertIn('xinggui_home', a['pages'])
                baseline = self.app.json_clone(b)
                self.app.apply_xinggui_home_patch(a, {'sections': [
                    {'title': 'A左', 'buttons': [{'name': 'A按钮'}]}, {'title': 'A右', 'buttons': []},
                ]})
                self.app.write_config(a, 'a')
                self.assertEqual(baseline, self.app.read_config('b'))
                self.assertEqual('A按钮', self.app.read_config('a')['pages']['xinggui_home']['sections'][0]['buttons'][0]['name'])
                template = self.app.read_user_template_config()
                self.assertIn('xinggui_home', template['pages'])
                self.assertNotEqual(a['pages']['xinggui_home'], template['pages']['xinggui_home'])
        finally:
            for key, value in old.items(): setattr(self.app, key, value)

    def test_startup_migration_adds_home_page_to_existing_users_and_template(self):
        old = {key: getattr(self.app, key) for key in ('DATA', 'USER_DATA', 'USER_TEMPLATE_PATH', 'USERS_PATH')}
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.app.DATA = root
                self.app.USER_DATA = root / 'users'
                self.app.USER_TEMPLATE_PATH = root / 'user-template.json'
                self.app.USERS_PATH = root / 'users.json'
                self.app.write_json(self.app.USERS_PATH, {'users': [{'id': 'old-a'}, {'id': 'old-b'}]})
                for user in ('old-a', 'old-b'):
                    self.app.write_json(self.app.user_config_path(user), {'app': {'title': user}, 'pages': {}})
                self.app.write_json(self.app.USER_TEMPLATE_PATH, {'app': {}, 'pages': {}})
                self.assertEqual(2, self.app.migrate_all_user_configs())
                for user in ('old-a', 'old-b'):
                    self.assertIn('xinggui_home', self.app.read_config(user)['pages'])
                self.assertIn('xinggui_home', self.app.read_user_template_config()['pages'])
        finally:
            for key, value in old.items(): setattr(self.app, key, value)

    def test_password_entry_hides_after_unlock_and_reappears_for_new_password(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        self.assertIn('xingguiPasswordButton.Visible = xingguiVariant && !String.IsNullOrWhiteSpace(password) && !passwordUnlocked;', source)
        self.assertIn('UpdateXingguiPasswordButton();', source)
        self.assertIn('passwordUnlocked = true; UpdateXingguiPasswordButton();', source)

    def test_xinggui_keeps_system_settings_out_of_primary_navigation(self):
        source = (Path(__file__).resolve().parents[1] / 'src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs').read_text(encoding='utf-8')
        start = source.index('private void BuildNav()')
        end = source.index('private void AddNavButton(', start)
        navigation = source[start:end]
        self.assertIn('if (!tunerAdded.Contains("settings") && !xingguiVariant)', navigation)
        self.assertIn('private void UpdateXingguiUtilityLayout()', source)
