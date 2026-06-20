using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("__EXE_TITLE__")]
[assembly: AssemblyDescription("__EXE_DESCRIPTION__")]
[assembly: AssemblyCompany("__EXE_COMPANY__")]
[assembly: AssemblyProduct("__EXE_PRODUCT__")]
[assembly: AssemblyCopyright("__EXE_COPYRIGHT__")]
[assembly: AssemblyVersion("__EXE_VERSION__")]
[assembly: AssemblyFileVersion("__EXE_FILE_VERSION__")]

namespace ToolboxClient
{
    internal static class Program
    {
        private const string ConfigUrl = "__CONFIG_URL__";
        internal const string ClientVariant = "__CLIENT_VARIANT__";
        internal const string ClientVariantLabel = "__CLIENT_VARIANT_LABEL__";
        internal const string BuildId = "__BUILD_ID__";
        internal const string BuildStamp = "__BUILD_STAMP__";
        internal const string IntegritySeed = "__INTEGRITY_SEED__";
        internal const string BuildSignature = "__BUILD_SIGNATURE__";

        [STAThread]
        private static void Main()
        {
            ConfigureNetworkSecurity();
            if (!VerifyClientIntegrity())
            {
                MessageBox.Show("工具箱文件校验失败，请从后台重新下载最新版。", "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ToolboxForm(ConfigUrl));
        }

        private static void ConfigureNetworkSecurity()
        {
            ServicePointManager.Expect100Continue = false;
            ServicePointManager.SecurityProtocol =
                (SecurityProtocolType)3072 |
                (SecurityProtocolType)768 |
                SecurityProtocolType.Tls;
        }

        private static bool VerifyClientIntegrity()
        {
            if (String.IsNullOrWhiteSpace(ConfigUrl) || ConfigUrl.IndexOf("/api/toolbox/config?key=", StringComparison.OrdinalIgnoreCase) < 0) return false;
            if (String.IsNullOrWhiteSpace(BuildId) || String.IsNullOrWhiteSpace(BuildStamp) || String.IsNullOrWhiteSpace(IntegritySeed)) return false;
            if (BuildId.StartsWith("__", StringComparison.Ordinal) || BuildStamp.StartsWith("__", StringComparison.Ordinal) || IntegritySeed.StartsWith("__", StringComparison.Ordinal) || BuildSignature.StartsWith("__", StringComparison.Ordinal)) return false;
            if (Debugger.IsAttached) return false;
            return true;
        }
    }

    internal sealed class ToolboxForm : Form
    {
        private readonly string configUrl;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private Dictionary<string, object> config = new Dictionary<string, object>();
        private Panel side;
        private PictureBox brandIcon;
        private Label brandTitle;
        private Label brandSubtitle;
        private FlowLayoutPanel nav;
        private Label title;
        private Label status;
        private FlowLayoutPanel content;
        private Panel progressPanel;
        private Label progressLabel;
        private ProgressBar downloadProgress;
        private Panel recordsPanel;
        private Panel settingsPanel;
        private Panel contactPopupOverlay;
        private Form contactPopupWindow;
        private ListView recordsList;
        private Label recordsProgressLabel;
        private FlowLayoutPanel activeDownloadsList;
        private Panel titleBar;
        private Button gridModeButton;
        private Button listModeButton;
        private Button recordsButton;
        private Button downloadTasksButton;
        private Button settingsButton;
        private Button topMostButton;
        private Button contactButton;
        private Button themeButton;
        private ToolTip topToolTip;
        private System.Windows.Forms.Timer refreshTimer;
        private string currentPage = "";
        private IList<object> currentSections = new List<object>();
        private bool listMode = false;
        private bool passwordUnlocked = false;
        private bool loadingConfig = false;
        private readonly List<DownloadTask> activeDownloads = new List<DownloadTask>();
        private readonly object activeDownloadsLock = new object();
        private readonly Dictionary<string, Panel> activeDownloadRows = new Dictionary<string, Panel>();
        private string lastConfigJson = "";
        private string lastSyncText = "";
        private string lastPasswordHash = "";
        private string runtimeIntegrityToken = "";
        private bool runtimeIntegrityChecked = false;
        private string runtimeIntegrityError = "";
        private DateTime runtimeIntegrityExpiresAt = DateTime.MinValue;
        private string runtimeExecutableSha256 = "";
        private bool initialSizeApplied = false;
        private readonly bool studioVariant = Program.ClientVariant.Equals("studio", StringComparison.OrdinalIgnoreCase);
        private readonly bool portalVariant = Program.ClientVariant.Equals("portal", StringComparison.OrdinalIgnoreCase);
        private readonly Dictionary<string, Control> navButtons = new Dictionary<string, Control>();
        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>();
        private readonly HashSet<string> failedIcons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private Icon runtimeIcon;
        private ContactPopupConfig popupConfig;
        private DateTime popupCacheLoadedAt = DateTime.MinValue;
        private int brandClickCount = 0;
        private DateTime brandClickWindowStart = DateTime.MinValue;
        private DateTime lastBrandClickAt = DateTime.MinValue;
        private Point lastBrandClickScreenPoint = Point.Empty;
        private int activeContactPopupTab = 0;
        private const int PopupDefaultCacheMinutes = 60;
        private bool portalEnglish = false;
        private Button portalCnButton;
        private Button portalEnButton;
        private string portalBrandTitleSource = "";
        private string portalBrandSubtitleSource = "";
        private bool portalTopMost = false;
        private Size portalWindowRegionSize = Size.Empty;
        private int portalWindowRegionRadius = 0;
        private const string StudioRecordsListTag = "studio_records_list";
        private const string StudioActiveDownloadsTag = "studio_active_downloads";
        private const string PortalRecordsListTag = "portal_records_list";
        private const string PortalActiveDownloadsTag = "portal_active_downloads";

        private static Color Bg = Color.FromArgb(18, 30, 43);
        private static Color SideBg = Color.FromArgb(10, 18, 29);
        private static Color PanelBg = Color.FromArgb(25, 39, 58);
        private static Color PanelBg2 = Color.FromArgb(35, 49, 66);
        private static Color Line = Color.FromArgb(48, 66, 86);
        private static Color Accent = Color.FromArgb(43, 166, 221);
        private static Color Gold = Color.FromArgb(218, 163, 0);
        private static Color Green = Color.FromArgb(29, 174, 101);
        private static Color Red = Color.FromArgb(229, 67, 67);
        private static Color Purple = Color.FromArgb(105, 77, 202);
        private static Color TextColor = Color.FromArgb(237, 242, 244);
        private static Color Muted = Color.FromArgb(139, 151, 166);
        private static bool LightTheme = false;

        private readonly Dictionary<string, string> scripts = new Dictionary<string, string>
        {
            { "sys_control_panel", "control.exe" },
            { "sys_sound_settings", "mmsys.cpl" },
            { "open_network_connections", "ncpa.cpl" },
            { "sys_apps_features", "appwiz.cpl" },
            { "sys_device_manager", "devmgmt.msc" },
            { "sys_disk_manager", "diskmgmt.msc" },
            { "sys_computer_manager", "compmgmt.msc" },
            { "sys_services", "services.msc" },
            { "sys_task_manager", "taskmgr.exe" },
            { "sys_system_info", "msinfo32.exe" },
            { "sys_env_vars", "rundll32 sysdm.cpl,EditEnvironmentVariables" },
            { "sys_event_viewer", "eventvwr.msc" },
            { "sys_registry", "regedit.exe" },
            { "sys_group_policy", "gpedit.msc" },
            { "sys_cmd_prompt", "cmd.exe" },
            { "sys_security_policy", "secpol.msc" },
            { "sys_power_options", "powercfg.cpl" },
            { "sys_classic_context_menu", "reg add HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32 /f /ve & taskkill /f /im explorer.exe & start explorer.exe" },
            { "add_hosts_block", "notepad.exe C:\\Windows\\System32\\drivers\\etc\\hosts" },
            { "sys_system_clean", "cleanmgr.exe" },
            { "disable_firewall", "netsh advfirewall set allprofiles state off" },
            { "disable_update", "reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU /v NoAutoUpdate /t REG_DWORD /d 1 /f & sc config wuauserv start= disabled & sc stop wuauserv" },
            { "disable_uac", "reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System /v EnableLUA /t REG_DWORD /d 0 /f & reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System /v ConsentPromptBehaviorAdmin /t REG_DWORD /d 0 /f" },
            { "activate_windows", "slmgr /ato" },
            { "preset_new_machine", "cleanmgr.exe" },
            { "preset_audio_workstation", "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" },
            { "preset_privacy_lockdown", "reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo /v Enabled /t REG_DWORD /d 0 /f" },
            { "preset_pure_activate", "slmgr /ato" }
        };

        public ToolboxForm(string url)
        {
            configUrl = NormalizeConfigUrl(url);
            Text = "工具箱";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(860, 560);
            Size = new Size(1080, 700);
            BackColor = Bg;
            ForeColor = TextColor;
            Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            BuildShell();
            refreshTimer = new System.Windows.Forms.Timer();
            refreshTimer.Interval = 5000;
            refreshTimer.Tick += delegate { LoadConfigAsync(false); LoadPopupConfigAsync(false); };
            Shown += delegate { LoadConfigAsync(true); refreshTimer.Start(); };
        }

        private static string NormalizeConfigUrl(string url)
        {
            try
            {
                Uri uri = new Uri(url);
                if (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ||
                    uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
                    return uri.ToString();
            }
            catch
            {
            }
            return url;
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (runtimeIcon != null) runtimeIcon.Dispose();
            if (contactPopupWindow != null && !contactPopupWindow.IsDisposed) contactPopupWindow.Dispose();
            base.OnFormClosed(e);
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (portalVariant) UpdatePortalWindowRegion();
        }

        private void BuildShell()
        {
            if (studioVariant)
            {
                BuildStudioShell();
                return;
            }
            if (portalVariant)
            {
                BuildPortalShell();
                return;
            }

            TableLayoutPanel root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
                BackColor = Bg
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 232F));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            Controls.Add(root);

            side = new Panel { Dock = DockStyle.Fill, BackColor = SideBg, Padding = new Padding(16, 46, 16, 18) };
            root.Controls.Add(side, 0, 0);

            TableLayoutPanel sideLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 4,
                BackColor = SideBg
            };
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 26F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            side.Controls.Add(sideLayout);

            TableLayoutPanel brandPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 2,
                BackColor = SideBg
            };
            brandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44F));
            brandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            brandPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
            brandPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24F));

            brandIcon = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.CenterImage,
                BackColor = SideBg
            };
            brandTitle = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.White,
                TextAlign = ContentAlignment.BottomLeft,
                AutoEllipsis = false,
                Font = new Font(Font.FontFamily, 15F, FontStyle.Bold)
            };
            brandSubtitle = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Muted,
                TextAlign = ContentAlignment.TopLeft,
                AutoEllipsis = true,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Bold)
            };
            brandPanel.Controls.Add(brandIcon, 0, 0);
            brandPanel.SetRowSpan(brandIcon, 2);
            brandPanel.Controls.Add(brandTitle, 1, 0);
            brandPanel.Controls.Add(brandSubtitle, 1, 1);
            brandPanel.Cursor = Cursors.Hand;
            AttachBrandPopupEntry(brandPanel);

            nav = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = SideBg,
                Padding = new Padding(0, 4, 0, 0)
            };
            sideLayout.Controls.Add(brandPanel, 0, 0);
            sideLayout.SetRowSpan(brandPanel, 2);
            sideLayout.Controls.Add(nav, 0, 3);

            Panel main = new Panel { Dock = DockStyle.Fill, BackColor = Bg, Padding = new Padding(44, 26, 28, 28) };
            root.Controls.Add(main, 1, 0);

            TableLayoutPanel mainLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 4,
                BackColor = Bg
            };
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 68F));
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 1F));
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 18F));
            main.Controls.Add(mainLayout);

            titleBar = new Panel { Dock = DockStyle.Top, Height = 68, BackColor = Bg };
            titleBar.MouseDown += DragWindow;
            mainLayout.Controls.Add(titleBar, 0, 0);

            title = new Label
            {
                Dock = DockStyle.Left,
                Width = 300,
                ForeColor = Color.White,
                TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font(Font.FontFamily, 20F, FontStyle.Bold)
            };
            title.MouseDown += DragWindow;
            titleBar.Controls.Add(title);

            FlowLayoutPanel windowControls = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                Width = 248,
                Height = 36,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(0),
                Margin = Padding.Empty,
                BackColor = Bg
            };
            titleBar.Controls.Add(windowControls);

            gridModeButton = MakeTopButton("▦");
            listModeButton = MakeTopButton("☰");
            recordsButton = MakeTopButton("⇩");
            settingsButton = MakeTopButton("⚙");
            Button minButton = MakeTopButton("−");
            Button maxButton = MakeTopButton("□");
            Button closeButton = MakeTopButton("×");
            gridModeButton.Click += delegate { listMode = false; UpdateModeButtons(); RenderCurrentSections(); };
            listModeButton.Click += delegate { listMode = true; UpdateModeButtons(); RenderCurrentSections(); };
            recordsButton.Click += delegate { ShowDownloadRecords(); };
            settingsButton.Click += delegate { ShowClientSettings(); };
            minButton.Click += delegate { WindowState = FormWindowState.Minimized; };
            maxButton.Click += delegate { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; UpdatePortalWindowRegion(); };
            closeButton.Click += delegate { Close(); };
            topToolTip = new ToolTip();
            topToolTip.SetToolTip(gridModeButton, "宫格显示");
            topToolTip.SetToolTip(listModeButton, "列表显示");
            topToolTip.SetToolTip(recordsButton, "下载记录");
            topToolTip.SetToolTip(settingsButton, "下载设置");
            windowControls.Controls.Add(gridModeButton);
            windowControls.Controls.Add(listModeButton);
            windowControls.Controls.Add(recordsButton);
            windowControls.Controls.Add(settingsButton);
            windowControls.Controls.Add(minButton);
            windowControls.Controls.Add(maxButton);
            windowControls.Controls.Add(closeButton);
            UpdateModeButtons();

            Panel divider = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(31, 48, 66) };
            mainLayout.Controls.Add(divider, 0, 1);

            status = new Label { Dock = DockStyle.Fill, ForeColor = Muted, TextAlign = ContentAlignment.MiddleLeft, Visible = true, Text = "同步准备中 v" + Program.BuildStamp };
            mainLayout.Controls.Add(status, 0, 3);

            progressPanel = new Panel { Dock = DockStyle.Fill, BackColor = Bg, Visible = false };
            progressLabel = new Label
            {
                Dock = DockStyle.Left,
                Width = 245,
                ForeColor = Muted,
                TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font(Font.FontFamily, 8F, FontStyle.Bold)
            };
            downloadProgress = new ProgressBar
            {
                Dock = DockStyle.Fill,
                Minimum = 0,
                Maximum = 100,
                Style = ProgressBarStyle.Continuous
            };
            progressPanel.Controls.Add(downloadProgress);
            progressPanel.Controls.Add(progressLabel);
            mainLayout.Controls.Add(progressPanel, 0, 3);

            content = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                AutoScroll = true,
                BackColor = Bg,
                Padding = new Padding(0, 28, 0, 0)
            };
            content.Resize += delegate { RenderCurrentSections(); };
            mainLayout.Controls.Add(content, 0, 2);
            BuildRecordsPanel();
            AttachRecordDismissHandlers(this);
        }

        private void BuildStudioShell()
        {
            FormBorderStyle = FormBorderStyle.None;
            BackColor = Color.FromArgb(238, 241, 245);
            ForeColor = Color.FromArgb(17, 24, 39);
            MinimumSize = new Size(980, 640);
            Size = new Size(1200, 800);

            TableLayoutPanel root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 2,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
                BackColor = Color.FromArgb(238, 241, 245)
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 208F));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            Controls.Add(root);

            Panel top = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
            top.MouseDown += DragWindow;
            root.Controls.Add(top, 0, 0);
            root.SetColumnSpan(top, 2);

            Label appName = new Label
            {
                Dock = DockStyle.Left,
                Width = 300,
                Padding = new Padding(14, 0, 0, 0),
                Text = "调音师工具箱",
                ForeColor = Color.FromArgb(15, 23, 42),
                Font = new Font(Font.FontFamily, 10F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            appName.MouseDown += DragWindow;
            top.Controls.Add(appName);

            FlowLayoutPanel windowControls = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                Width = 300,
                Height = 36,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(0, 9, 8, 0),
                Margin = Padding.Empty,
                BackColor = Color.White
            };
            top.Controls.Add(windowControls);

            downloadTasksButton = MakeStudioChromeButton("downloads");
            recordsButton = MakeStudioChromeButton("trash");
            topMostButton = MakeStudioChromeButton("lock");
            contactButton = MakeStudioChromeButton("wechat");
            themeButton = MakeStudioChromeButton("moon");
            Button minButton = MakeStudioChromeButton("min");
            Button maxButton = MakeStudioChromeButton("max");
            Button closeButton = MakeStudioChromeButton("close");
            downloadTasksButton.Click += delegate { ShowStudioSettingsPage(); };
            recordsButton.Click += delegate { DeleteDownloadedFilesFromTopButton(); };
            topMostButton.Click += delegate { ToggleTopMost(); };
            contactButton.Click += delegate { ShowContactWindowFromButton(); };
            themeButton.Click += delegate { ToggleStudioTheme(); };
            minButton.Click += delegate { WindowState = FormWindowState.Minimized; };
            maxButton.Click += delegate { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; };
            closeButton.Click += delegate { Close(); };
            topToolTip = new ToolTip();
            topToolTip.SetToolTip(downloadTasksButton, "下载任务");
            topToolTip.SetToolTip(recordsButton, "删除已下载文件");
            topToolTip.SetToolTip(topMostButton, "窗口置顶");
            topToolTip.SetToolTip(contactButton, "联系方式");
            topToolTip.SetToolTip(themeButton, "浅色 / 深色模式");
            windowControls.Controls.Add(downloadTasksButton);
            windowControls.Controls.Add(recordsButton);
            windowControls.Controls.Add(topMostButton);
            windowControls.Controls.Add(contactButton);
            windowControls.Controls.Add(themeButton);
            windowControls.Controls.Add(minButton);
            windowControls.Controls.Add(maxButton);
            windowControls.Controls.Add(closeButton);

            side = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.White,
                Padding = new Padding(18, 24, 14, 18)
            };
            root.Controls.Add(side, 0, 1);

            TableLayoutPanel sideLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                BackColor = Color.White
            };
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 74F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            side.Controls.Add(sideLayout);

            TableLayoutPanel brandPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                BackColor = Color.White
            };
            brandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44F));
            brandPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            brandIcon = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.CenterImage, BackColor = side.BackColor };
            brandTitle = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.FromArgb(15, 23, 42),
                Font = new Font(Font.FontFamily, 9.5F, FontStyle.Bold),
                Padding = new Padding(6, 0, 0, 0),
                TextAlign = ContentAlignment.MiddleLeft,
                AutoEllipsis = true
            };
            brandTitle.Resize += delegate { FitBrandTitle(brandTitle.Text); };
            brandSubtitle = new Label { Visible = false, Width = 1, Height = 1 };
            brandPanel.Controls.Add(brandIcon, 0, 0);
            brandPanel.Controls.Add(brandTitle, 1, 0);
            AttachBrandPopupEntry(brandPanel);
            sideLayout.Controls.Add(brandPanel, 0, 0);

            nav = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = Color.White,
                Padding = new Padding(0, 8, 0, 0)
            };
            sideLayout.Controls.Add(nav, 0, 1);

            Button bottomSettings = MakeStudioBottomButton("⚙  系统设置");
            bottomSettings.Tag = "studio_bottom_settings";
            bottomSettings.Click += delegate { ShowStudioSettingsPage(); };
            sideLayout.Controls.Add(bottomSettings, 0, 2);

            Panel main = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(238, 241, 245),
                Padding = new Padding(14, 18, 16, 16)
            };
            root.Controls.Add(main, 1, 1);

            content = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = Color.FromArgb(238, 241, 245),
                Padding = new Padding(0, 0, 0, 10)
            };
            content.Resize += delegate
            {
                if (currentPage.Equals("settings", StringComparison.OrdinalIgnoreCase)) RenderStudioSettingsPage();
                else RenderCurrentSections();
            };
            main.Controls.Add(content);

            titleBar = top;
            title = new Label { Visible = false, Width = 1, Height = 1 };
            status = new Label { Visible = false, Text = "同步准备中 v" + Program.BuildStamp };
            gridModeButton = new Button();
            listModeButton = new Button();
            BuildRecordsPanel();
            AttachRecordDismissHandlers(this);
        }

        private void BuildPortalShell()
        {
            Color portalShellBack = Color.White;
            Color portalSideBack = Color.FromArgb(220, 236, 249);
            FormBorderStyle = FormBorderStyle.None;
            BackColor = portalShellBack;
            ForeColor = Color.FromArgb(15, 23, 42);
            MinimumSize = new Size(980, 640);
            Size = new Size(1280, 840);

            TableLayoutPanel root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
                BackColor = portalShellBack
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 236F));
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            Controls.Add(root);

            side = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = portalSideBack,
                Padding = new Padding(8, 0, 8, 16)
            };
            root.Controls.Add(side, 0, 0);

            TableLayoutPanel sideLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 4,
                BackColor = side.BackColor
            };
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 118F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            sideLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            side.Controls.Add(sideLayout);

            TableLayoutPanel userPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 2,
                BackColor = side.BackColor,
                Padding = new Padding(12, 24, 6, 18)
            };
            userPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 42F));
            userPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            userPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
            userPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
            brandIcon = new PictureBox { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.CenterImage, BackColor = side.BackColor };
            brandTitle = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.FromArgb(15, 23, 42),
                Font = new Font(Font.FontFamily, 12F, FontStyle.Bold),
                TextAlign = ContentAlignment.BottomLeft,
                AutoEllipsis = true
            };
            brandSubtitle = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.FromArgb(108, 117, 128),
                Font = new Font(Font.FontFamily, 8F, FontStyle.Regular),
                TextAlign = ContentAlignment.TopLeft,
                AutoEllipsis = true
            };
            userPanel.Controls.Add(brandIcon, 0, 0);
            userPanel.SetRowSpan(brandIcon, 2);
            userPanel.Controls.Add(brandTitle, 1, 0);
            userPanel.Controls.Add(brandSubtitle, 1, 1);
            AttachBrandPopupEntry(userPanel);
            sideLayout.Controls.Add(userPanel, 0, 0);

            nav = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = side.BackColor,
                Padding = new Padding(0, 14, 0, 0)
            };
            sideLayout.Controls.Add(nav, 0, 1);

            Button records = new PortalBadgeSideButton
            {
                Dock = DockStyle.Fill,
                Text = "",
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(20, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                BackColor = portalSideBack,
                ForeColor = Color.FromArgb(15, 23, 42),
                Font = new Font(Font.FontFamily, 8.5F, FontStyle.Regular)
            };
            records.FlatAppearance.BorderColor = portalSideBack;
            records.FlatAppearance.MouseOverBackColor = Color.FromArgb(238, 242, 247);
            records.Click += delegate { ShowTemplateUtilityPage("downloads"); };
            sideLayout.Controls.Add(records, 0, 2);
            Button settings = MakePortalSideButton("");
            settings.Click += delegate { ShowTemplateUtilityPage("settings"); };
            sideLayout.Controls.Add(settings, 0, 3);

            Panel main = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = portalShellBack,
                Padding = new Padding(26, 24, 32, 24)
            };
            root.Controls.Add(main, 1, 0);
            main.MouseDown += DragWindow;

            TableLayoutPanel mainLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
                BackColor = portalShellBack
            };
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            mainLayout.MouseDown += DragWindow;
            main.Controls.Add(mainLayout);

            FlowLayoutPanel windowControls = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                Padding = new Padding(0, 4, 0, 0),
                BackColor = portalShellBack
            };
            mainLayout.Controls.Add(windowControls, 0, 0);
            Button closeButton = MakeTemplateTopButton("×", Color.White, Color.FromArgb(30, 41, 59), Color.FromArgb(214, 224, 238));
            Button maxButton = MakeTemplateTopButton("□", Color.White, Color.FromArgb(30, 41, 59), Color.FromArgb(214, 224, 238));
            Button minButton = MakeTemplateTopButton("−", Color.White, Color.FromArgb(30, 41, 59), Color.FromArgb(214, 224, 238));
            Button enButton = MakeTemplateTopButton("EN", Color.White, Color.FromArgb(30, 41, 59), Color.FromArgb(214, 224, 238), 32);
            Button cnButton = MakeTemplateTopButton("中", Color.FromArgb(232, 242, 255), Color.FromArgb(24, 129, 239), Color.FromArgb(176, 211, 252), 28);
            portalCnButton = cnButton;
            portalEnButton = enButton;
            cnButton.Click += delegate { SetPortalLanguage(false); };
            enButton.Click += delegate { SetPortalLanguage(true); };
            closeButton.Click += delegate { Close(); };
            maxButton.Click += delegate { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; };
            minButton.Click += delegate { WindowState = FormWindowState.Minimized; };
            windowControls.Controls.Add(closeButton);
            windowControls.Controls.Add(maxButton);
            windowControls.Controls.Add(minButton);
            windowControls.Controls.Add(enButton);
            windowControls.Controls.Add(cnButton);

            content = new BufferedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = portalShellBack,
                Padding = new Padding(0, 16, 0, 20)
            };
            content.Resize += delegate { RenderCurrentPortalView(); };
            mainLayout.Controls.Add(content, 0, 1);

            titleBar = main;
            title = new Label { Visible = false, Width = 1, Height = 1 };
            status = new Label { Visible = false, Text = "同步准备中 v" + Program.BuildStamp };
            gridModeButton = new Button();
            listModeButton = new Button();
            recordsButton = records;
            settingsButton = settings;
            topToolTip = new ToolTip();
            UpdatePortalLanguageButtons();
            UpdatePortalChromeLanguage();
            BuildRecordsPanel();
            AttachRecordDismissHandlers(this);
            UpdatePortalWindowRegion();
        }

        private void AttachBrandPopupEntry(Control root)
        {
            root.Cursor = Cursors.Hand;
            root.MouseUp += HandleBrandPopupClick;
            foreach (Control child in root.Controls)
            {
                child.Cursor = Cursors.Hand;
                child.MouseUp += HandleBrandPopupClick;
            }
        }

        private void HandleBrandPopupClick(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            Control source = sender as Control;
            Point screenPoint = source == null ? Control.MousePosition : source.PointToScreen(e.Location);
            DateTime clickNow = DateTime.Now;
            if ((clickNow - lastBrandClickAt).TotalMilliseconds < 90 &&
                Math.Abs(screenPoint.X - lastBrandClickScreenPoint.X) <= 2 &&
                Math.Abs(screenPoint.Y - lastBrandClickScreenPoint.Y) <= 2)
            {
                return;
            }
            lastBrandClickAt = clickNow;
            lastBrandClickScreenPoint = screenPoint;

            ContactPopupConfig cfg = popupConfig;
            if (cfg == null || !cfg.Enabled)
            {
                cfg = LoadPopupConfigNow(true);
            }
            DateTime now = DateTime.Now;
            if ((now - brandClickWindowStart).TotalMilliseconds > 1200)
            {
                brandClickWindowStart = now;
                brandClickCount = 0;
                cfg = LoadPopupConfigNow(true) ?? cfg;
            }
            if (cfg == null || !cfg.Enabled)
            {
                LoadPopupConfigAsync(true);
                return;
            }
            brandClickCount++;
            int required = Math.Max(1, cfg.ClickCount);
            if (brandClickCount >= required)
            {
                brandClickCount = 0;
                ShowContactPopup(cfg);
            }
        }

        private void AttachRecordDismissHandlers(Control root)
        {
            if (root == recordsPanel) return;
            if (root == settingsPanel) return;
            if (root == contactPopupOverlay) return;
            root.MouseDown += HideRecordsPanelWhenClickOutside;
            foreach (Control child in root.Controls)
            {
                if (child == recordsPanel) continue;
                if (child == settingsPanel) continue;
                if (child == contactPopupOverlay) continue;
                AttachRecordDismissHandlers(child);
            }
        }

        private void HideRecordsPanelWhenClickOutside(object sender, MouseEventArgs e)
        {
            bool recordsVisible = recordsPanel != null && recordsPanel.Visible;
            bool settingsVisible = settingsPanel != null && settingsPanel.Visible;
            if (!recordsVisible && !settingsVisible) return;
            if (Object.ReferenceEquals(sender, recordsButton) || Object.ReferenceEquals(sender, settingsButton)) return;
            Point point = PointToClient(Control.MousePosition);
            if (recordsVisible && !recordsPanel.Bounds.Contains(point))
            {
                recordsPanel.Visible = false;
            }
            if (settingsVisible && !settingsPanel.Bounds.Contains(point))
            {
                settingsPanel.Visible = false;
            }
        }

        private Button MakeTopButton(string text)
        {
            return MakeTopButton(text, 31);
        }

        private Button MakeTopButton(string text, int width)
        {
            Button button = new Button
            {
                Width = width,
                Height = 30,
                Margin = new Padding(3, 0, 0, 0),
                Text = text,
                TextAlign = ContentAlignment.MiddleCenter,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(36, 50, 68),
                ForeColor = Muted,
                Font = new Font(Font.FontFamily, 11F, FontStyle.Bold)
            };
            button.FlatAppearance.BorderColor = Color.FromArgb(54, 69, 88);
            return button;
        }

        private Button MakeTemplateTopButton(string text, Color backColor, Color foreColor, Color borderColor)
        {
            return MakeTemplateTopButton(text, backColor, foreColor, borderColor, 31);
        }

        private Button MakeTemplateTopButton(string text, Color backColor, Color foreColor, Color borderColor, int width)
        {
            Button button = new Button
            {
                Width = width,
                Height = 28,
                Margin = new Padding(4, 0, 0, 0),
                Text = text,
                TextAlign = ContentAlignment.MiddleCenter,
                FlatStyle = FlatStyle.Flat,
                BackColor = backColor,
                ForeColor = foreColor,
                Font = new Font(Font.FontFamily, text.Length > 1 ? 8F : 11F, FontStyle.Bold)
            };
            button.FlatAppearance.BorderColor = borderColor;
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(240, 246, 255);
            button.FlatAppearance.MouseDownBackColor = Color.FromArgb(226, 239, 255);
            return button;
        }

        private Button MakeStudioBottomButton(string text)
        {
            Button button = new Button
            {
                Dock = DockStyle.Fill,
                Text = text,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(30, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                BackColor = PanelBg2,
                ForeColor = TextColor,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Bold)
            };
            button.FlatAppearance.BorderColor = Line;
            button.FlatAppearance.MouseOverBackColor = LightTheme ? Color.FromArgb(239, 246, 255) : Color.FromArgb(39, 63, 86);
            button.FlatAppearance.MouseDownBackColor = LightTheme ? Color.FromArgb(226, 239, 255) : Color.FromArgb(48, 75, 101);
            return button;
        }

        private Button MakeStudioChromeButton(string icon)
        {
            StudioChromeButton button = new StudioChromeButton
            {
                Width = icon == "downloads" ? 34 : 29,
                Height = 28,
                Margin = new Padding(1, 0, 5, 0),
                IconKey = icon,
                BackColor = Color.Transparent,
                ForeColor = TextColor,
                FlatStyle = FlatStyle.Flat,
                UseVisualStyleBackColor = false
            };
            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.MouseOverBackColor = Color.Transparent;
            button.FlatAppearance.MouseDownBackColor = Color.Transparent;
            return button;
        }

        private Button MakeStudioSmallButton(string text)
        {
            RoundButton button = new RoundButton
            {
                Width = 88,
                Height = 32,
                Margin = Padding.Empty,
                Text = text,
                BackColor = PanelBg2,
                ForeColor = TextColor,
                BorderColor = Line,
                HoverBackColor = LightTheme ? Color.FromArgb(235, 247, 254) : Color.FromArgb(55, 68, 84),
                Radius = 8,
                FlatStyle = FlatStyle.Flat,
                UseVisualStyleBackColor = false
            };
            button.FlatAppearance.BorderSize = 0;
            return button;
        }

        private Button MakePortalSideButton(string text)
        {
            Button button = new Button
            {
                Dock = DockStyle.Fill,
                Text = text,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(20, 0, 0, 0),
                FlatStyle = FlatStyle.Flat,
                BackColor = SideBg,
                ForeColor = TextColor,
                Font = new Font(Font.FontFamily, 8.5F, FontStyle.Regular)
            };
            button.FlatAppearance.BorderColor = SideBg;
            button.FlatAppearance.MouseOverBackColor = PortalHoverBack();
            button.FlatAppearance.MouseDownBackColor = Blend(PortalHoverBack(), Accent, 0.08);
            return button;
        }

        private sealed class PortalBadgeSideButton : Button
        {
            public string BadgeText = "";

            public PortalBadgeSideButton()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            }

            protected override void OnPaint(PaintEventArgs pevent)
            {
                base.OnPaint(pevent);
                if (String.IsNullOrWhiteSpace(BadgeText)) return;
                string text = BadgeText.Trim();
                if (text.Length > 2) text = "99";
                Graphics g = pevent.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (Font badgeFont = new Font("Microsoft YaHei UI", 7F, FontStyle.Bold))
                {
                    Size textSize = TextRenderer.MeasureText(g, text, badgeFont, Size.Empty, TextFormatFlags.NoPadding);
                    int badgeWidth = Math.Max(15, textSize.Width + 7);
                    int badgeHeight = 15;
                    Rectangle badge = new Rectangle(Width - badgeWidth - 12, 6, badgeWidth, badgeHeight);
                    using (GraphicsPath path = UiRoundRect(badge, 8))
                    using (SolidBrush bg = new SolidBrush(Color.FromArgb(239, 68, 68)))
                    using (Pen border = new Pen(BackColor, 1F))
                    {
                        g.FillPath(bg, path);
                        g.DrawPath(border, path);
                    }
                    TextRenderer.DrawText(g, text, badgeFont, badge, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
            }
        }

        private void UpdateModeButtons()
        {
            if (gridModeButton == null || listModeButton == null) return;
            gridModeButton.ForeColor = listMode ? Muted : TextColor;
            listModeButton.ForeColor = listMode ? TextColor : Muted;
            gridModeButton.BackColor = listMode ? PanelBg2 : PanelBg;
            listModeButton.BackColor = listMode ? PanelBg : PanelBg2;
        }

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr hIcon);

        private void DragWindow(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 0x2, 0);
        }

        private void UpdatePortalWindowRegion()
        {
            if (!portalVariant || IsDisposed) return;
            if (WindowState == FormWindowState.Maximized)
            {
                if (Region != null)
                {
                    Region old = Region;
                    Region = null;
                    old.Dispose();
                }
                portalWindowRegionSize = Size.Empty;
                portalWindowRegionRadius = 0;
                return;
            }
            EnsureRoundedRegion(this, 16, ref portalWindowRegionSize, ref portalWindowRegionRadius);
        }

        private void ApplyAppIcon(string url, string fallbackText)
        {
            Image image = LoadRemoteImage(url, 34, 34);
            if (image == null)
            {
                image = CreateBrandBadge(fallbackText);
            }
            brandIcon.Image = image;

            using (Bitmap iconBitmap = new Bitmap(32, 32))
            using (Graphics g = Graphics.FromImage(iconBitmap))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(image, 0, 0, 32, 32);
                IntPtr handle = iconBitmap.GetHicon();
                try
                {
                    Icon nextIcon = (Icon)Icon.FromHandle(handle).Clone();
                    Icon old = runtimeIcon;
                    runtimeIcon = nextIcon;
                    Icon = runtimeIcon;
                    if (old != null) old.Dispose();
                }
                finally
                {
                    DestroyIcon(handle);
                }
            }
        }

        private void FitBrandTitle(string text)
        {
            int available = brandTitle.ClientSize.Width;
            if (available <= 0) available = studioVariant ? 126 : 154;
            available = Math.Max(64, available - brandTitle.Padding.Left - brandTitle.Padding.Right);
            float[] sizes = studioVariant
                ? new float[] { 10F, 9.5F, 9F, 8.5F, 8F, 7.5F, 7F }
                : (portalVariant ? new float[] { 12F, 11F, 10F, 9F, 8.5F } : new float[] { 15F, 14F, 13F, 12F, 11F });
            for (int i = 0; i < sizes.Length; i++)
            {
                Font candidate = new Font(Font.FontFamily, sizes[i], FontStyle.Bold);
                Size measured = TextRenderer.MeasureText(text ?? "", candidate);
                if (measured.Width <= available + 2 || i == sizes.Length - 1)
                {
                    Font previous = brandTitle.Font;
                    brandTitle.Font = candidate;
                    if (previous != null && !Object.ReferenceEquals(previous, candidate)) previous.Dispose();
                    return;
                }
                candidate.Dispose();
            }
        }

        private Image CreateBrandBadge(string text)
        {
            string value = String.IsNullOrWhiteSpace(text) ? "Y" : text.Trim().Substring(0, 1).ToUpperInvariant();
            Bitmap bitmap = new Bitmap(34, 34);
            using (Graphics g = Graphics.FromImage(bitmap))
            using (GraphicsPath path = RoundRect(new Rectangle(0, 0, 34, 34), 8))
            using (LinearGradientBrush brush = new LinearGradientBrush(new Rectangle(0, 0, 34, 34), Color.FromArgb(84, 198, 184), Color.FromArgb(38, 142, 207), LinearGradientMode.ForwardDiagonal))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.FillPath(brush, path);
                TextRenderer.DrawText(g, value, new Font("Microsoft YaHei UI", 12F, FontStyle.Bold), new Rectangle(0, 0, 34, 34), Color.FromArgb(6, 19, 17), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
            return bitmap;
        }

        private void LoadConfig()
        {
            LoadConfigAsync(true);
        }

        private void LoadConfig(bool showMessage)
        {
            if (loadingConfig) return;
            loadingConfig = true;
            ThreadPool.QueueUserWorkItem(delegate { LoadConfigWorker(showMessage); });
        }

        private void LoadConfigAsync(bool showMessage)
        {
            LoadConfig(showMessage);
        }

        private void LoadConfigWorker(bool showMessage)
        {
            string json = null;
            string statusMessage = null;
            string errorMessage = null;
            try
            {
                TryEnsureRuntimeIntegrity();
                json = DownloadText(WithRuntimeToken(configUrl + (configUrl.IndexOf("?") >= 0 ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks + "&r=" + Guid.NewGuid().ToString("N")));
                EnsureConfigResponse(json);
                SaveCache(json);
                if (json == lastConfigJson)
                {
                    lastSyncText = "已同步 " + DateTime.Now.ToString("HH:mm:ss");
                    statusMessage = lastSyncText;
                    BeginInvoke(new Action(delegate { status.Text = statusMessage; }));
                    return;
                }
                if (showMessage)
                {
                    lastSyncText = "配置已刷新 " + DateTime.Now.ToString("HH:mm:ss");
                    statusMessage = lastSyncText;
                }
                else
                {
                    lastSyncText = "已同步 " + DateTime.Now.ToString("HH:mm:ss");
                    statusMessage = lastSyncText;
                }
            }
            catch (Exception ex)
            {
                if (IsIntegrityFailure(ex))
                {
                    errorMessage = ex.Message;
                    BeginInvoke(new Action(delegate
                    {
                        status.Text = "工具箱校验失败。";
                        title.Text = "工具箱无法加载";
                        if (showMessage) MessageBox.Show(errorMessage, "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }));
                    return;
                }
                if (!runtimeIntegrityChecked)
                {
                    json = null;
                }
                else
                {
                    json = StripPasswordFromCachedConfig(ReadCache());
                }
                if (String.IsNullOrWhiteSpace(json))
                {
                    errorMessage = "连接后台失败：" + ex.Message;
                    BeginInvoke(new Action(delegate
                    {
                        status.Text = "连接后台失败。";
                        title.Text = "工具箱无法加载";
                        if (showMessage) MessageBox.Show(errorMessage, "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }));
                    return;
                }
                if (json == lastConfigJson)
                {
                    string fallback = String.IsNullOrWhiteSpace(lastSyncText) ? "已使用本地缓存" : lastSyncText;
                    BeginInvoke(new Action(delegate { status.Text = fallback + "，等待下次刷新"; }));
                    return;
                }
                statusMessage = "后台连接失败，已使用本地缓存：" + ex.Message;
            }
            finally
            {
                loadingConfig = false;
            }

            try
            {
                object parsed = serializer.DeserializeObject(json);
                Dictionary<string, object> nextConfig = AsDict(parsed);
                BeginInvoke(new Action(delegate
                {
                    config = nextConfig;
                    lastConfigJson = json;
                    if (!String.IsNullOrWhiteSpace(statusMessage)) status.Text = statusMessage;
                    ApplyConfig();
                    LoadPopupConfigAsync(false);
                }));
            }
            catch (Exception ex)
            {
                BeginInvoke(new Action(delegate
                {
                    status.Text = "配置解析失败。";
                    if (showMessage) MessageBox.Show("配置解析失败：" + ex.Message, "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }));
            }
        }

        private void ApplyConfig()
        {
            SuspendLayout();
            side.SuspendLayout();
            nav.SuspendLayout();
            content.SuspendLayout();

            Dictionary<string, object> app = AsDict(Get(config, "app"));
            ApplyTheme(studioVariant ? "银光素白" : CurrentTheme(app));
            ApplyTemplatePalette();
            if (studioVariant)
            {
                ApplyStudioThemeToShell();
                UpdateStudioChromeButtons();
            }
            if (portalVariant)
            {
                ApplyPortalThemeToShell();
            }
            string appTitle = GetText(app, "title", "工具箱");
            portalBrandTitleSource = appTitle;
            portalBrandSubtitleSource = GetText(app, "subtitle", "");
            string displayAppTitle = portalVariant ? PortalLabel(appTitle, "app.title") : appTitle;
            Text = displayAppTitle;
            Text = displayAppTitle + " v" + Program.BuildStamp;
            brandTitle.Text = displayAppTitle;
            brandSubtitle.Text = portalVariant ? PortalLabel(portalBrandSubtitleSource, "app.subtitle") : portalBrandSubtitleSource;
            FitBrandTitle(displayAppTitle);
            BeginInvoke(new Action(delegate { FitBrandTitle(brandTitle.Text); }));
            title.Text = portalVariant ? PortalText("首页", "Home") : (studioVariant ? "系统优化" : appTitle);
            ApplyAppIcon(GetText(app, "icon", GetText(app, "icon_url", "")), GetText(app, "logo_text", "Y"));

            int width = IntValue(app, "window_width", Width);
            int height = IntValue(app, "window_height", Height);
            if (!initialSizeApplied && width >= 860 && height >= 560)
            {
                Size = new Size(width, height);
                initialSizeApplied = true;
            }

            BuildNav();

            string password = GetText(app, "password", "");
            if (String.IsNullOrWhiteSpace(password))
            {
                passwordUnlocked = false;
                lastPasswordHash = "";
            }
            else if (!password.Equals(lastPasswordHash, StringComparison.Ordinal))
            {
                passwordUnlocked = false;
                lastPasswordHash = password;
                if (PromptPassword(password))
                {
                    passwordUnlocked = true;
                }
                else
                {
                    Close();
                }
            }
            else if (!passwordUnlocked && PromptPassword(password))
            {
                passwordUnlocked = true;
            }
            else if (!passwordUnlocked)
            {
                Close();
            }

            content.ResumeLayout();
            nav.ResumeLayout();
            side.ResumeLayout();
            ResumeLayout();
        }

        private void ApplyTheme(string theme)
        {
            string value = (theme ?? "").Trim().ToLowerInvariant();
            if (value == "星夜墨蓝")
            {
                SetTheme(14, 24, 38, 9, 17, 29, 24, 35, 50, 31, 45, 62, 48, 63, 82, 64, 151, 240, 226, 174, 74, 38, 188, 132, 238, 86, 92, 118, 104, 224, 236, 242, 250, 145, 160, 180);
            }
            else if (value == "墨金深空")
            {
                SetTheme(18, 18, 20, 10, 10, 12, 54, 54, 62, 40, 40, 47, 72, 72, 82, 222, 170, 55, 222, 170, 55, 55, 194, 142, 236, 82, 82, 125, 100, 220, 246, 244, 240, 160, 158, 156);
            }
            else if (value == "海雾蓝湖")
            {
                SetTheme(217, 238, 249, 204, 226, 242, 246, 252, 255, 226, 242, 252, 174, 207, 229, 42, 166, 232, 224, 166, 48, 28, 184, 132, 226, 78, 78, 86, 122, 218, 20, 42, 64, 78, 110, 132);
            }
            else if (value == "森境青绿")
            {
                SetTheme(5, 27, 21, 3, 18, 15, 11, 45, 32, 17, 58, 43, 31, 82, 64, 45, 205, 142, 225, 176, 45, 39, 205, 136, 236, 78, 78, 90, 115, 218, 236, 250, 244, 137, 166, 156);
            }
            else if (value == "翡翠冷绿")
            {
                SetTheme(3, 30, 29, 2, 18, 20, 12, 47, 45, 20, 62, 59, 34, 86, 82, 30, 210, 188, 232, 184, 43, 42, 206, 151, 236, 78, 84, 88, 122, 224, 235, 250, 248, 132, 170, 166);
            }
            else if (value == "落日绯红")
            {
                SetTheme(45, 18, 22, 28, 8, 12, 66, 30, 34, 82, 40, 44, 105, 58, 62, 240, 92, 95, 238, 174, 46, 47, 198, 128, 255, 92, 92, 130, 94, 216, 255, 242, 238, 192, 150, 150);
            }
            else if (value == "蓝雾淡紫")
            {
                SetTheme(34, 30, 55, 21, 18, 42, 48, 42, 72, 59, 52, 86, 85, 76, 112, 128, 138, 255, 236, 181, 58, 52, 203, 150, 238, 82, 108, 168, 125, 235, 248, 244, 255, 172, 164, 198);
            }
            else if (value == "暖棕咖啡")
            {
                SetTheme(41, 30, 22, 25, 18, 13, 62, 44, 31, 78, 57, 40, 102, 76, 55, 218, 142, 72, 242, 184, 62, 44, 188, 122, 238, 88, 78, 124, 98, 218, 255, 247, 236, 190, 164, 140);
            }
            else if (value == "午夜靛蓝")
            {
                SetTheme(11, 18, 39, 5, 10, 26, 20, 32, 62, 30, 45, 78, 48, 67, 102, 82, 132, 255, 232, 178, 42, 48, 194, 136, 236, 78, 92, 126, 98, 232, 242, 247, 255, 143, 158, 184);
            }
            else if (value == "极光青碧")
            {
                SetTheme(219, 239, 235, 208, 230, 226, 244, 252, 249, 232, 246, 241, 188, 216, 210, 24, 186, 172, 224, 164, 46, 28, 178, 134, 228, 78, 78, 82, 120, 210, 28, 49, 52, 89, 122, 122);
            }
            else if (value == "玫瑰粉雾")
            {
                SetTheme(252, 235, 241, 244, 222, 232, 255, 248, 251, 250, 236, 244, 222, 194, 208, 226, 96, 142, 224, 154, 54, 38, 172, 124, 228, 82, 112, 145, 92, 210, 58, 42, 54, 132, 96, 112);
            }
            else if (value == "星云紫幕")
            {
                SetTheme(25, 18, 38, 14, 10, 26, 42, 32, 60, 52, 40, 74, 74, 58, 100, 156, 98, 255, 236, 178, 45, 48, 198, 138, 238, 78, 108, 110, 92, 220, 248, 242, 255, 166, 150, 190);
            }
            else if (value == "余烬橙焰")
            {
                SetTheme(47, 25, 16, 28, 13, 8, 68, 36, 24, 84, 48, 32, 110, 65, 44, 242, 118, 58, 246, 190, 44, 46, 190, 120, 238, 80, 72, 122, 92, 218, 255, 242, 232, 196, 154, 132);
            }
            else if (value == "霓虹电缎")
            {
                SetTheme(20, 18, 42, 10, 9, 26, 34, 28, 66, 46, 36, 82, 68, 54, 108, 48, 214, 244, 244, 184, 48, 40, 210, 150, 244, 76, 130, 170, 92, 255, 242, 248, 255, 150, 162, 196);
            }
            else if (value == "沙丘金黄")
            {
                SetTheme(246, 237, 216, 235, 224, 198, 255, 251, 238, 248, 239, 218, 216, 194, 150, 218, 158, 48, 232, 176, 54, 72, 170, 120, 220, 82, 72, 118, 94, 206, 54, 46, 34, 138, 112, 82);
            }
            else if (value == "樱雾浅粉")
            {
                SetTheme(252, 238, 246, 245, 226, 238, 255, 250, 253, 250, 238, 247, 225, 198, 214, 232, 105, 165, 226, 162, 58, 42, 174, 126, 230, 84, 120, 142, 96, 214, 60, 45, 58, 136, 100, 118);
            }
            else if (value == "钻蓝冷辉")
            {
                SetTheme(222, 238, 249, 210, 229, 244, 247, 252, 255, 235, 244, 252, 194, 214, 230, 52, 146, 246, 220, 162, 42, 34, 180, 132, 228, 78, 78, 95, 104, 218, 28, 42, 62, 90, 110, 132);
            }
            else if (value == "银光素白")
            {
                SetTheme(244, 247, 251, 232, 238, 246, 255, 255, 255, 246, 248, 252, 210, 218, 230, 96, 126, 220, 210, 160, 56, 44, 166, 124, 220, 82, 82, 110, 98, 210, 34, 40, 52, 112, 120, 136);
            }
            else if (value == "晴空蓝白")
            {
                SetTheme(233, 244, 253, 220, 235, 248, 250, 253, 255, 239, 247, 254, 198, 218, 234, 54, 152, 240, 222, 166, 48, 32, 180, 126, 226, 78, 78, 100, 110, 218, 30, 46, 66, 92, 112, 132);
            }
            else if (value == "ice_blue" || value == "iceblue" || value == "冰川浅蓝" || value == "晴空蓝白" || value == "冰川蓝莹" || value == "银光素白")
            {
                SetTheme(18, 30, 43, 10, 18, 29, 27, 42, 61, 35, 52, 73, 48, 67, 88, 42, 178, 235, 238, 176, 0, 38, 202, 137, 241, 78, 78, 105, 92, 220, 245, 248, 252, 151, 164, 181);
            }
            else if (value == "ice_white" || value == "icewhite" || value == "冰川白" || value == "极光青碧")
            {
                SetTheme(229, 239, 247, 218, 232, 244, 245, 250, 255, 235, 244, 252, 192, 211, 226, 42, 153, 226, 224, 151, 36, 22, 170, 122, 227, 80, 80, 105, 92, 220, 24, 39, 58, 86, 105, 124);
            }
            else if (value == "aurora_blue" || value == "aurorablue" || value == "极光蓝" || value == "夜莺靛蓝" || value == "午夜靛蓝" || value == "靛蓝冷辉" || value == "钻蓝冷辉")
            {
                SetTheme(14, 28, 50, 7, 16, 33, 21, 43, 70, 28, 57, 88, 42, 76, 112, 54, 145, 255, 244, 180, 42, 43, 205, 145, 239, 82, 88, 135, 98, 235, 242, 248, 255, 142, 160, 183);
            }
            else if (value == "cyber_cyan" || value == "cybercyan" || value == "赛博青" || value == "海雾蓝湖" || value == "翡翠冷绿")
            {
                SetTheme(9, 26, 31, 4, 15, 20, 15, 42, 48, 21, 56, 63, 35, 82, 91, 29, 215, 216, 238, 179, 43, 37, 209, 158, 239, 75, 95, 116, 104, 232, 232, 238, 240, 135, 164, 169);
            }
            else if (value == "midnight" || value == "深海蓝" || value == "墨金深空" || value == "夜莺深蓝")
            {
                SetTheme(13, 22, 33, 7, 13, 22, 18, 30, 45, 28, 42, 60, 42, 58, 78, 67, 133, 255, 229, 174, 22, 48, 188, 126, 233, 74, 74, 123, 99, 226, 239, 244, 250, 137, 151, 170);
            }
            else if (value == "obsidian" || value == "曜石黑")
            {
                SetTheme(18, 19, 24, 10, 11, 15, 27, 29, 36, 36, 39, 48, 62, 66, 78, 79, 147, 255, 234, 178, 38, 56, 190, 126, 236, 76, 76, 135, 105, 235, 242, 244, 248, 145, 151, 164);
            }
            else if (value == "violet" || value == "幻影紫" || value == "星云紫幕" || value == "暮虹电缎" || value == "霓虹电缎" || value == "蓝雾淡紫")
            {
                SetTheme(27, 21, 43, 16, 12, 30, 38, 30, 60, 48, 39, 74, 75, 61, 104, 154, 104, 255, 238, 178, 46, 42, 198, 138, 239, 78, 108, 105, 92, 220, 247, 242, 255, 165, 151, 190);
            }
            else if (value == "rose" || value == "胭脂粉" || value == "落日绯红" || value == "樱雾浅粉" || value == "玫瑰粉雾")
            {
                SetTheme(43, 22, 34, 27, 12, 22, 61, 31, 48, 76, 40, 60, 102, 59, 79, 239, 92, 145, 238, 176, 49, 52, 198, 137, 244, 72, 102, 137, 95, 220, 255, 243, 248, 190, 151, 166);
            }
            else if (value == "emerald" || value == "翡翠绿" || value == "森境青绿" || value == "翡翠冷绿")
            {
                SetTheme(16, 35, 30, 7, 22, 19, 24, 52, 45, 31, 65, 56, 46, 86, 76, 35, 194, 136, 229, 177, 37, 36, 203, 122, 236, 78, 78, 93, 112, 218, 239, 249, 244, 139, 169, 159);
            }
            else if (value == "amber" || value == "暖橙金" || value == "余烬橙焰" || value == "沙丘金黄" || value == "暖棕咖啡")
            {
                SetTheme(40, 29, 20, 24, 17, 12, 58, 41, 28, 72, 52, 36, 96, 72, 50, 239, 154, 60, 246, 190, 49, 43, 188, 119, 238, 77, 77, 116, 98, 216, 255, 246, 236, 184, 158, 137);
            }
            else if (value == "crimson" || value == "熔岩红" || value == "落日绯红")
            {
                SetTheme(42, 20, 22, 25, 10, 12, 60, 29, 32, 78, 39, 42, 103, 55, 58, 236, 81, 84, 235, 172, 43, 45, 196, 122, 255, 86, 86, 129, 91, 220, 255, 241, 241, 188, 147, 150);
            }
            else
            {
                SetTheme(18, 30, 43, 10, 18, 29, 25, 39, 58, 35, 49, 66, 48, 66, 86, 43, 166, 221, 218, 163, 0, 29, 174, 101, 229, 67, 67, 105, 77, 202, 237, 242, 244, 139, 151, 166);
            }

            BackColor = Bg;
            ForeColor = TextColor;
            if (side != null) side.BackColor = SideBg;
            if (nav != null) nav.BackColor = SideBg;
            if (content != null) content.BackColor = Bg;
            if (!studioVariant && !portalVariant) ApplyThemeToControls(this);
            RefreshContactPopupTheme();
            if (recordsPanel != null)
            {
                recordsPanel.Dispose();
                recordsPanel = null;
                recordsList = null;
                activeDownloadsList = null;
                activeDownloadRows.Clear();
            }
            if (settingsPanel != null)
            {
                settingsPanel.Dispose();
                settingsPanel = null;
            }
        }

        private void ApplyTemplatePalette()
        {
            if (studioVariant)
            {
                ClientSettings settings = LoadClientSettings();
                bool dark = IsDarkModeSetting(settings.Theme);
                ApplyStudioPalette(dark);
            }
            else if (portalVariant)
            {
                Bg = Color.White;
                SideBg = Color.FromArgb(220, 236, 249);
                PanelBg = Color.White;
                PanelBg2 = Color.FromArgb(247, 250, 255);
                Line = Color.FromArgb(211, 226, 240);
                Accent = Color.FromArgb(24, 129, 239);
                TextColor = Color.FromArgb(15, 23, 42);
                Muted = Color.FromArgb(88, 103, 124);
                LightTheme = true;
            }
        }

        private void ApplyPortalThemeToShell()
        {
            if (!portalVariant) return;
            BackColor = Bg;
            ForeColor = TextColor;
            ApplyPortalThemeToControlTree(this);
            UpdatePortalChromeLanguage();
        }

        private void ApplyPortalThemeToControlTree(Control root)
        {
            if (root == null) return;
            foreach (Control child in root.Controls)
            {
                if (child == contactPopupOverlay || child == recordsPanel || child == settingsPanel) continue;
                if (child == side || child == nav)
                {
                    child.BackColor = SideBg;
                }
                else if (child is RoundedPanel || child is RoundedFlowLayoutPanel || child is EmptyStateLabel || child is TemplateActionButton || child is TemplateNavButton || child is FlatCheckBox)
                {
                    ApplyPortalSpecialControlTheme(child);
                }
                else if (child is TableLayoutPanel || child is FlowLayoutPanel || child is Panel)
                {
                    child.BackColor = IsInsidePortalSidebar(child) ? SideBg : Bg;
                }
                if (child is Label)
                {
                    child.ForeColor = child == status ? Muted : TextColor;
                    if (child.BackColor != Color.Transparent) child.BackColor = IsInsidePortalSidebar(child) ? SideBg : Bg;
                }
                if (child is PictureBox)
                {
                    child.BackColor = IsInsidePortalSidebar(child) ? SideBg : Bg;
                }
                if (child is TextBox || child is ComboBox || child is ListView)
                {
                    child.BackColor = IsPortalDownloadRecordsList(child) ? PortalRecordTableBack() : PortalFieldBack();
                    child.ForeColor = TextColor;
                }
                if (child is Button)
                {
                    ApplyPortalButtonTheme(child as Button);
                }
                child.Invalidate();
                ApplyPortalThemeToControlTree(child);
            }
        }

        private void ApplyPortalSpecialControlTheme(Control child)
        {
            RoundedPanel rounded = child as RoundedPanel;
            if (rounded != null)
            {
                rounded.BackColor = PanelBg;
                rounded.BorderColor = Color.FromArgb(LightTheme ? 110 : 88, Line);
            }
            RoundedFlowLayoutPanel roundedFlow = child as RoundedFlowLayoutPanel;
            if (roundedFlow != null)
            {
                bool activeDownloads = IsPortalActiveDownloadsList(roundedFlow);
                roundedFlow.BackColor = activeDownloads ? PortalRecordSurfaceBack() : PanelBg;
                roundedFlow.UseCustomBorderColor = true;
                roundedFlow.BorderColor = Color.FromArgb(LightTheme ? 100 : 82, Line);
            }
            EmptyStateLabel empty = child as EmptyStateLabel;
            if (empty != null)
            {
                empty.UseCustomColors = true;
                empty.FillColor = PanelBg;
                empty.BorderColor = Color.FromArgb(LightTheme ? 80 : 65, Line);
                empty.IconBackColor = PortalSoftAccentBack();
                empty.ForeColor = Muted;
            }
        }

        private void ApplyPortalButtonTheme(Button button)
        {
            if (button == null) return;
            bool active = Object.ReferenceEquals(button, portalCnButton) ? !portalEnglish : (Object.ReferenceEquals(button, portalEnButton) && portalEnglish);
            button.BackColor = active ? PortalSoftAccentBack() : (IsInsidePortalSidebar(button) ? SideBg : PanelBg);
            button.ForeColor = active ? Accent : TextColor;
            button.FlatAppearance.BorderColor = active ? Color.FromArgb(LightTheme ? 150 : 110, Accent) : Color.FromArgb(LightTheme ? 95 : 78, Line);
            button.FlatAppearance.MouseOverBackColor = active ? PortalSoftAccentBack() : PortalHoverBack();
            button.FlatAppearance.MouseDownBackColor = Blend(PortalHoverBack(), Accent, 0.08);
        }

        private bool IsInsidePortalSidebar(Control control)
        {
            Control current = control;
            while (current != null)
            {
                if (current == side || current == nav) return true;
                current = current.Parent;
            }
            return false;
        }

        private static bool IsDarkModeSetting(string theme)
        {
            string value = (theme ?? "").Trim().ToLowerInvariant();
            return value == "dark" || value == "深色模式" || value == "dark_mode" || value == "night";
        }

        private void ApplyStudioPalette(bool dark)
        {
            if (dark)
            {
                Bg = Color.FromArgb(29, 36, 45);
                SideBg = Color.FromArgb(20, 27, 36);
                PanelBg = Color.FromArgb(37, 46, 58);
                PanelBg2 = Color.FromArgb(45, 56, 70);
                Line = Color.FromArgb(68, 82, 100);
                Accent = Color.FromArgb(66, 165, 245);
                TextColor = Color.FromArgb(235, 241, 248);
                Muted = Color.FromArgb(159, 173, 190);
                LightTheme = false;
            }
            else
            {
                Bg = Color.FromArgb(238, 241, 245);
                SideBg = Color.White;
                PanelBg = Color.White;
                PanelBg2 = Color.FromArgb(247, 249, 252);
                Line = Color.FromArgb(218, 226, 236);
                Accent = Color.FromArgb(24, 129, 239);
                TextColor = Color.FromArgb(15, 23, 42);
                Muted = Color.FromArgb(96, 111, 128);
                LightTheme = true;
            }
        }

        private void ApplyStudioThemeToShell()
        {
            if (!studioVariant) return;
            BackColor = Bg;
            ForeColor = TextColor;
            ApplyStudioThemeToControlTree(this);
        }

        private void ApplyStudioThemeToControlTree(Control root)
        {
            if (root == null) return;
            foreach (Control child in root.Controls)
            {
                if (child == contactPopupOverlay || child == recordsPanel || child == settingsPanel) continue;
                if (child is TemplateNavButton || child is TemplateActionButton || child is RoundedPanel || child is FlatCheckBox)
                {
                    child.Invalidate();
                    ApplyStudioThemeToControlTree(child);
                    continue;
                }

                if (child is RoundButton)
                {
                    RoundButton round = child as RoundButton;
                    round.BackColor = PanelBg2;
                    round.ForeColor = TextColor;
                    round.BorderColor = Color.FromArgb(LightTheme ? 70 : 95, Line);
                    round.HoverBackColor = LightTheme ? Color.FromArgb(239, 246, 255) : Color.FromArgb(39, 63, 86);
                    round.Invalidate();
                    ApplyStudioThemeToControlTree(round);
                    continue;
                }

                if (child is TableLayoutPanel || child is FlowLayoutPanel || child is Panel)
                {
                    bool studioActiveDownloads = IsStudioActiveDownloadsList(child);
                    child.BackColor = studioActiveDownloads ? StudioRecordSurfaceBack() : (IsInsideStudioSidebar(child) ? SideBg : Bg);
                    RoundedFlowLayoutPanel roundedFlow = child as RoundedFlowLayoutPanel;
                    if (studioActiveDownloads && roundedFlow != null)
                    {
                        roundedFlow.UseCustomBorderColor = true;
                        roundedFlow.BorderColor = Color.FromArgb(LightTheme ? 76 : 62, Line);
                    }
                }
                if (child is Label)
                {
                    child.ForeColor = child == status ? Muted : TextColor;
                    if (child.BackColor != Color.Transparent) child.BackColor = IsInsideStudioSidebar(child) ? SideBg : Bg;
                }
                if (child is PictureBox)
                {
                    child.BackColor = IsInsideStudioSidebar(child) ? SideBg : Bg;
                }
                if (child is TextBox || child is ComboBox || child is ListView)
                {
                    child.BackColor = IsStudioDownloadRecordsList(child) ? StudioRecordTableBack() : PanelBg2;
                    child.ForeColor = TextColor;
                }
                if (child is Button)
                {
                    Button button = child as Button;
                    bool bottomSettings = String.Equals(Convert.ToString(button.Tag), "studio_bottom_settings", StringComparison.Ordinal);
                    button.BackColor = bottomSettings ? PanelBg2 : (IsInsideStudioSidebar(button) ? SideBg : Bg);
                    button.ForeColor = TextColor;
                    button.FlatAppearance.BorderColor = bottomSettings ? Line : button.BackColor;
                    button.FlatAppearance.MouseOverBackColor = bottomSettings ? (LightTheme ? Color.FromArgb(239, 246, 255) : Color.FromArgb(39, 63, 86)) : button.BackColor;
                    button.FlatAppearance.MouseDownBackColor = bottomSettings ? (LightTheme ? Color.FromArgb(226, 239, 255) : Color.FromArgb(48, 75, 101)) : button.BackColor;
                }
                child.Invalidate();
                ApplyStudioThemeToControlTree(child);
            }
        }

        private bool IsInsideStudioSidebar(Control control)
        {
            Control current = control;
            while (current != null)
            {
                if (current == side || current == nav) return true;
                current = current.Parent;
            }
            return false;
        }

        private string CurrentTheme(Dictionary<string, object> app)
        {
            string serverTheme = GetText(app, "theme", "午夜靛蓝");
            if (serverTheme.Equals("glacier", StringComparison.OrdinalIgnoreCase)) serverTheme = "午夜靛蓝";
            IList<ThemeOption> options = VisibleThemeOptions(app);
            bool serverThemeVisible = false;
            foreach (ThemeOption option in options)
            {
                if (option.Value.Equals(serverTheme, StringComparison.OrdinalIgnoreCase))
                {
                    serverThemeVisible = true;
                    break;
                }
            }
            if (!serverThemeVisible) serverTheme = options.Count > 0 ? options[0].Value : "海雾蓝湖";
            bool allowClientTheme = BoolValue(app, "allow_client_theme", true);
            if (!allowClientTheme) return serverTheme;
            ClientSettings settings = LoadClientSettings();
            if (String.IsNullOrWhiteSpace(settings.Theme)) return serverTheme;
            foreach (ThemeOption option in options)
            {
                if (option.Value.Equals(settings.Theme, StringComparison.OrdinalIgnoreCase)) return option.Value;
            }
            foreach (ThemeOption option in options)
            {
                if (option.Value.Equals(serverTheme, StringComparison.OrdinalIgnoreCase)) return option.Value;
            }
            return options.Count > 0 ? options[0].Value : "海雾蓝湖";
        }

        private IList<ThemeOption> VisibleThemeOptions(Dictionary<string, object> app)
        {
            int count = IntValue(app, "theme_count", AllThemeOptions().Count);
            if (count <= 0) count = AllThemeOptions().Count;
            count = Math.Max(1, Math.Min(AllThemeOptions().Count, count));
            List<ThemeOption> visible = new List<ThemeOption>();
            IList<ThemeOption> all = AllThemeOptions();
            for (int i = 0; i < count; i++) visible.Add(all[i]);
            return visible;
        }

        private static IList<ThemeOption> AllThemeOptions()
        {
            return new List<ThemeOption>
            {
                new ThemeOption("星夜墨蓝", "星夜墨蓝"),
                new ThemeOption("海雾蓝湖", "海雾蓝湖"),
                new ThemeOption("钻蓝冷辉", "钻蓝冷辉"),
                new ThemeOption("晴空蓝白", "晴空蓝白"),
                new ThemeOption("玫瑰粉雾", "玫瑰粉雾"),
                new ThemeOption("樱雾浅粉", "樱雾浅粉"),
                new ThemeOption("沙丘金黄", "沙丘金黄"),
                new ThemeOption("银光素白", "银光素白")
            };
        }

        private static void SetTheme(
            int bgR, int bgG, int bgB,
            int sideR, int sideG, int sideB,
            int panelR, int panelG, int panelB,
            int panel2R, int panel2G, int panel2B,
            int lineR, int lineG, int lineB,
            int accentR, int accentG, int accentB,
            int goldR, int goldG, int goldB,
            int greenR, int greenG, int greenB,
            int redR, int redG, int redB,
            int purpleR, int purpleG, int purpleB,
            int textR, int textG, int textB,
            int mutedR, int mutedG, int mutedB)
        {
            Bg = Color.FromArgb(bgR, bgG, bgB);
            SideBg = Color.FromArgb(sideR, sideG, sideB);
            PanelBg = Color.FromArgb(panelR, panelG, panelB);
            PanelBg2 = Color.FromArgb(panel2R, panel2G, panel2B);
            Line = Color.FromArgb(lineR, lineG, lineB);
            Accent = Color.FromArgb(accentR, accentG, accentB);
            Gold = Color.FromArgb(goldR, goldG, goldB);
            Green = Color.FromArgb(greenR, greenG, greenB);
            Red = Color.FromArgb(redR, redG, redB);
            Purple = Color.FromArgb(purpleR, purpleG, purpleB);
            TextColor = Color.FromArgb(textR, textG, textB);
            Muted = Color.FromArgb(mutedR, mutedG, mutedB);
            LightTheme = (bgR * 299 + bgG * 587 + bgB * 114) > 170000;
        }

        private void ApplyThemeToControls(Control root)
        {
            foreach (Control child in root.Controls)
            {
                if (child == side || child == nav)
                {
                    child.BackColor = SideBg;
                }
                else if (child == contactPopupOverlay)
                {
                    continue;
                }
                else if (child is Panel || child is TableLayoutPanel || child is FlowLayoutPanel)
                {
                    if (child.Parent == side || child.Parent == nav) child.BackColor = SideBg;
                    else child.BackColor = Bg;
                }
                if (child is Label) child.ForeColor = child == status ? Muted : TextColor;
                if (child is Button)
                {
                    child.BackColor = PanelBg2;
                    child.ForeColor = TextColor;
                    Button btn = child as Button;
                    if (btn != null) btn.FlatAppearance.BorderColor = Line;
                }
                if (child is TextBox || child is ComboBox || child is ListView)
                {
                    child.BackColor = PanelBg2;
                    child.ForeColor = TextColor;
                }
                child.Invalidate();
                ApplyThemeToControls(child);
            }
        }

        private void BuildNav()
        {
            nav.Controls.Clear();
            navButtons.Clear();

            HashSet<string> added = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            IList<object> sidebar = AsList(Get(config, "sidebar"));
            Dictionary<string, object> pages = AsDict(Get(config, "pages"));
            IList<object> toolboxTabs = AsList(Get(config, "toolbox_tabs"));

            foreach (object item in sidebar)
            {
                Dictionary<string, object> row = AsDict(item);
                string id = GetText(row, "id", "");
                if (String.IsNullOrWhiteSpace(id) || id.Equals("settings", StringComparison.OrdinalIgnoreCase)) continue;
                string label = NavLabel(row, id, pages);
                AddNavButton(id, label);
                added.Add(id);
            }

            foreach (string pageId in pages.Keys)
            {
                if (added.Contains(pageId)) continue;
                Dictionary<string, object> page = AsDict(pages[pageId]);
                AddNavButton(pageId, PageLabel(page, pageId));
                added.Add(pageId);
            }

            if (toolboxTabs.Count > 0 && !added.Contains("toolbox"))
            {
                AddNavButton("toolbox", "系统工具");
                added.Add("toolbox");
            }

            if (navButtons.Count == 0)
            {
                title.Text = portalVariant ? PortalText("暂无内容", "No Content") : "暂无内容";
                content.Controls.Clear();
                return;
            }

            if (studioVariant && currentPage.Equals("settings", StringComparison.OrdinalIgnoreCase))
            {
                RenderStudioSettingsPage();
                return;
            }

            if (!String.IsNullOrWhiteSpace(currentPage) && navButtons.ContainsKey(currentPage))
            {
                ShowPage(currentPage);
                return;
            }

            foreach (string key in navButtons.Keys)
            {
                ShowPage(key);
                break;
            }
        }

        private void AddNavButton(string id, string label)
        {
            if (studioVariant || portalVariant)
            {
                TemplateNavButton templateButton = new TemplateNavButton
                {
                    Width = studioVariant ? 148 : 180,
                    Height = studioVariant ? 36 : 38,
                    Margin = new Padding(0, 0, 0, studioVariant ? 7 : 5),
                    SourceCaption = label,
                    Caption = portalVariant ? PortalLabel(label, id) : label,
                    IconText = TemplateNavIcon(label, id),
                    StudioMode = studioVariant,
                    Tag = id
                };
                templateButton.Click += delegate { ShowPage((string)templateButton.Tag); };
                nav.Controls.Add(templateButton);
                navButtons[id] = templateButton;
                return;
            }

            NavItemControl button = new NavItemControl
            {
                Width = 198,
                Height = portalVariant ? 40 : (studioVariant ? 36 : 48),
                Margin = new Padding(0, 0, 0, 3),
                Caption = portalVariant ? PortalLabel(label, id) : label,
                Tag = id
            };
            button.Click += delegate { ShowPage((string)button.Tag); };
            nav.Controls.Add(button);
            navButtons[id] = button;
        }

        private string TemplateNavIcon(string label, string id)
        {
            string text = (label ?? "") + " " + (id ?? "");
            if (text.IndexOf("首页", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("home", StringComparison.OrdinalIgnoreCase) >= 0) return "⌂";
            if (text.IndexOf("软件", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("资源", StringComparison.OrdinalIgnoreCase) >= 0) return "▦";
            if (text.IndexOf("声卡", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("驱动", StringComparison.OrdinalIgnoreCase) >= 0) return "◉";
            if (text.IndexOf("链接", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("导航", StringComparison.OrdinalIgnoreCase) >= 0) return "✣";
            if (text.IndexOf("工具", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("系统", StringComparison.OrdinalIgnoreCase) >= 0) return "⚙";
            return portalVariant ? "▦" : "✹";
        }

        private void ShowPage(string id)
        {
            currentPage = id;
            foreach (KeyValuePair<string, Control> pair in navButtons)
            {
                bool active = pair.Key.Equals(id, StringComparison.OrdinalIgnoreCase);
                NavItemControl navItem = pair.Value as NavItemControl;
                TemplateNavButton templateItem = pair.Value as TemplateNavButton;
                if (navItem != null) navItem.Active = active;
                if (templateItem != null) templateItem.Active = active;
            }

            if (id.Equals("toolbox", StringComparison.OrdinalIgnoreCase))
            {
                RenderToolbox();
                return;
            }

            Dictionary<string, object> pages = AsDict(Get(config, "pages"));
            if (!pages.ContainsKey(id))
            {
                title.Text = portalVariant ? PortalLabel(FriendlyId(id), id) : FriendlyId(id);
                content.Controls.Clear();
                return;
            }

            Dictionary<string, object> page = AsDict(pages[id]);
            title.Text = portalVariant ? PortalLabel(PageLabel(page, id), id) : PageLabel(page, id);
            RenderSections(AsList(Get(page, "sections")));
        }

        private void ShowTemplateUtilityPage(string id)
        {
            if (!portalVariant)
            {
                if (id == "downloads") ShowDownloadRecords();
                else if (studioVariant) ShowStudioSettingsPage();
                else ShowClientSettings();
                return;
            }
            currentPage = id;
            foreach (KeyValuePair<string, Control> pair in navButtons)
            {
                NavItemControl navItem = pair.Value as NavItemControl;
                TemplateNavButton templateItem = pair.Value as TemplateNavButton;
                if (navItem != null) navItem.Active = false;
                if (templateItem != null) templateItem.Active = false;
            }
            if (id == "downloads") RenderPortalDownloadsPage();
            else RenderPortalSettingsPage();
        }

        private void RenderToolbox()
        {
            title.Text = portalVariant ? PortalLabel("系统工具", "toolbox") : "系统工具";
            List<object> sections = new List<object>();
            IList<object> tabs = AsList(Get(config, "toolbox_tabs"));
            foreach (object tabObj in tabs)
            {
                Dictionary<string, object> tab = AsDict(tabObj);
                string tabName = GetText(tab, "name", "系统工具");
                foreach (object sectionObj in AsList(Get(tab, "sections")))
                {
                    Dictionary<string, object> section = new Dictionary<string, object>(AsDict(sectionObj));
                    string sectionName = GetText(section, "title", "").Trim();
                    section["title"] = String.IsNullOrWhiteSpace(sectionName) ? tabName : tabName + "  " + sectionName;
                    sections.Add(section);
                }
            }
            RenderSections(sections);
        }

        private void RenderSections(IList<object> sections)
        {
            currentSections = sections;
            RenderCurrentSections();
        }

        private void RenderCurrentSections()
        {
            if (content == null) return;
            if (studioVariant)
            {
                RenderStudioSections();
                return;
            }
            if (portalVariant)
            {
                RenderPortalSections();
                return;
            }
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = listMode ? FlowDirection.TopDown : FlowDirection.LeftToRight;
            content.WrapContents = !listMode;

            List<Dictionary<string, object>> buttons = CollectButtons(currentSections);
            buttons.Sort((a, b) =>
            {
                int result = IntValue(a, "sort", 0).CompareTo(IntValue(b, "sort", 0));
                if (result != 0) return result;
                return String.Compare(GetText(a, "name", ""), GetText(b, "name", ""), StringComparison.CurrentCultureIgnoreCase);
            });
            if (buttons.Count == 0)
            {
                AddEmptyMessage("这里还没有按钮。");
                content.ResumeLayout();
                return;
            }

            int available = Math.Max(360, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 10);
            if (portalVariant && !listMode)
            {
                Dictionary<string, object> app = AsDict(Get(config, "app"));
                content.Controls.Add(new PortalHeroControl
                {
                    Width = available,
                    Height = 132,
                    Margin = new Padding(0, 0, 0, 16),
                    TitleText = GetText(app, "title", "工具箱"),
                    SubtitleText = GetText(app, "subtitle", Program.ClientVariantLabel),
                    AccentColor = Accent
                });
            }
            int columns = (portalVariant || studioVariant) ? 3 : 4;
            const int gap = 12;
            int minCardWidth = portalVariant ? 230 : (studioVariant ? 190 : 150);
            int cardWidth = listMode ? available : Math.Max(minCardWidth, (available - gap * (columns - 1)) / columns);
            int cardHeight = listMode ? 52 : (portalVariant ? 118 : (studioVariant ? 42 : 52));
            for (int i = 0; i < buttons.Count; i++)
            {
                Control card = CreateActionButton(buttons[i], i, cardWidth, cardHeight);
                content.Controls.Add(card);
            }

            content.ResumeLayout();
        }

        private void RenderStudioSections()
        {
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = FlowDirection.TopDown;
            content.WrapContents = false;
            content.BackColor = Bg;

            List<Dictionary<string, object>> sections = new List<Dictionary<string, object>>();
            foreach (object sectionObj in currentSections)
            {
                sections.Add(AsDict(sectionObj));
            }
            if (sections.Count == 0)
            {
                AddTemplateEmptyMessage("这里还没有按钮。");
                content.ResumeLayout();
                return;
            }

            int available = Math.Max(640, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 12);
            for (int i = 0; i < sections.Count; i++)
            {
                Dictionary<string, object> section = sections[i];
                List<Dictionary<string, object>> buttons = new List<Dictionary<string, object>>();
                foreach (object buttonObj in AsList(Get(section, "buttons")))
                {
                    buttons.Add(AsDict(buttonObj));
                }
                if (buttons.Count == 0) continue;
                buttons.Sort((a, b) =>
                {
                    int result = IntValue(a, "sort", 0).CompareTo(IntValue(b, "sort", 0));
                    if (result != 0) return result;
                    return String.Compare(GetText(a, "name", ""), GetText(b, "name", ""), StringComparison.CurrentCultureIgnoreCase);
                });

                Panel group = CreateStudioGroup(section, buttons, available, i);
                content.Controls.Add(group);
            }

            if (content.Controls.Count == 0) AddTemplateEmptyMessage("这里还没有按钮。");
            content.ResumeLayout();
        }

        private void ShowStudioSettingsPage()
        {
            if (!studioVariant)
            {
                ShowClientSettings();
                return;
            }
            currentPage = "settings";
            foreach (KeyValuePair<string, Control> pair in navButtons)
            {
                TemplateNavButton templateItem = pair.Value as TemplateNavButton;
                if (templateItem != null) templateItem.Active = false;
            }
            if (recordsPanel != null) recordsPanel.Visible = false;
            if (settingsPanel != null) settingsPanel.Visible = false;
            RenderStudioSettingsPage();
        }

        private void RenderStudioSettingsPage()
        {
            if (content == null) return;
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = FlowDirection.TopDown;
            content.WrapContents = false;
            content.BackColor = Bg;

            int available = Math.Max(640, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 12);
            ClientSettings currentSettings = LoadClientSettings();

            content.Controls.Add(CreateStudioSettingsCard(available, currentSettings));
            content.Controls.Add(CreateStudioDownloadRecordsPanel(available));
            content.ResumeLayout();
            RenderActiveDownloads();
            FillDownloadRecords();
        }

        private Panel CreateStudioGroup(Dictionary<string, object> section, List<Dictionary<string, object>> buttons, int width, int index)
        {
            int columns = Math.Max(2, Math.Min(5, width / 180));
            int gap = 8;
            int buttonHeight = 36;
            int rows = Math.Max(1, (int)Math.Ceiling(buttons.Count / (double)columns));
            int groupHeight = 56 + rows * buttonHeight + Math.Max(0, rows - 1) * gap + 26;

            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = groupHeight,
                Margin = new Padding(0, 0, 0, 18),
                BackColor = PanelBg,
                BorderColor = Color.Transparent,
                Radius = 8
            };

            string titleText = GetText(section, "title", "");
            if (String.IsNullOrWhiteSpace(titleText)) titleText = index == 0 ? CurrentTemplatePageTitle() : "常用工具";
            Label heading = new Label
            {
                Left = 18,
                Top = 16,
                Width = width - 36,
                Height = 28,
                Text = TemplateSectionIcon(titleText) + "  " + titleText,
                ForeColor = TextColor,
                Font = new Font(Font.FontFamily, 15F, FontStyle.Bold),
                BackColor = Color.Transparent
            };
            panel.Controls.Add(heading);

            int innerLeft = 18;
            int top = 56;
            int buttonWidth = Math.Max(118, (width - innerLeft * 2 - gap * (columns - 1)) / columns);
            for (int i = 0; i < buttons.Count; i++)
            {
                int row = i / columns;
                int col = i % columns;
                Control button = CreateStudioActionButton(buttons[i], innerLeft + col * (buttonWidth + gap), top + row * (buttonHeight + gap), buttonWidth, buttonHeight, i);
                panel.Controls.Add(button);
            }
            return panel;
        }

        private Panel CreateStudioSettingsCard(int width, ClientSettings currentSettings)
        {
            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = 238,
                Margin = new Padding(0, 0, 0, 18),
                BackColor = PanelBg,
                BorderColor = Color.Transparent,
                Radius = 8
            };

            Label heading = new Label
            {
                Left = 18,
                Top = 16,
                Width = width - 36,
                Height = 28,
                Text = "⚙  系统设置",
                ForeColor = TextColor,
                Font = new Font(Font.FontFamily, 15F, FontStyle.Bold),
                BackColor = Color.Transparent
            };
            panel.Controls.Add(heading);

            Label pathLabel = new Label
            {
                Left = 18,
                Top = 58,
                Width = 160,
                Height = 22,
                Text = "软件下载保存路径",
                ForeColor = Muted,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Bold)
            };
            TextBox pathBox = new TextBox
            {
                Left = 18,
                Top = 84,
                Width = Math.Max(320, width - 150),
                Height = 28,
                Text = GetDownloadDirectory(),
                BackColor = PanelBg2,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle
            };
            Button browse = MakeStudioSmallButton("选择");
            browse.Left = width - 116;
            browse.Top = 82;
            browse.Width = 86;
            browse.Click += delegate
            {
                using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                {
                    folderDialog.Description = "选择软件下载保存路径";
                    string selected = Environment.ExpandEnvironmentVariables(pathBox.Text.Trim());
                    folderDialog.SelectedPath = Directory.Exists(selected) ? selected : GetDownloadDirectory();
                    if (folderDialog.ShowDialog(this) == DialogResult.OK)
                    {
                        pathBox.Text = folderDialog.SelectedPath;
                        SaveDownloadDirectory(folderDialog.SelectedPath, currentSettings);
                    }
                }
            };
            pathBox.Leave += delegate
            {
                SaveDownloadDirectory(pathBox.Text, currentSettings);
                pathBox.Text = GetDownloadDirectory();
            };

            FlatCheckBox autoStart = new FlatCheckBox
            {
                Left = 18,
                Top = 132,
                Width = 250,
                Height = 26,
                Text = "开机自动启动工具箱",
                ForeColor = TextColor,
                BackColor = PanelBg,
                Checked = currentSettings.AutoStart || IsAutoStartEnabled()
            };
            FlatCheckBox cleanOnExit = new FlatCheckBox
            {
                Left = 292,
                Top = 132,
                Width = 280,
                Height = 26,
                Text = "关闭时自动删除已下载文件",
                ForeColor = TextColor,
                BackColor = PanelBg,
                Checked = currentSettings.DeleteDownloadsOnExit
            };

            Button openFolder = MakeStudioSmallButton("打开目录");
            openFolder.Left = 18;
            openFolder.Top = 180;
            openFolder.Width = 104;
            Button reset = MakeStudioSmallButton("恢复默认");
            reset.Left = 134;
            reset.Top = 180;
            reset.Width = 104;
            openFolder.Click += delegate
            {
                string dir = GetDownloadDirectory();
                try
                {
                    Directory.CreateDirectory(dir);
                    Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    MessageBox.Show("打开目录失败：" + ex.Message, "工具箱设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            };
            reset.Click += delegate
            {
                pathBox.Text = DefaultDownloadDirectory();
                SaveDownloadDirectory(pathBox.Text, currentSettings);
            };
            autoStart.CheckedChanged += delegate
            {
                currentSettings.AutoStart = autoStart.Checked;
                SaveClientSettings(currentSettings);
                SetAutoStart(autoStart.Checked);
                status.Text = autoStart.Checked ? "已开启开机自启" : "已关闭开机自启";
            };
            cleanOnExit.CheckedChanged += delegate
            {
                currentSettings.DeleteDownloadsOnExit = cleanOnExit.Checked;
                SaveClientSettings(currentSettings);
                status.Text = cleanOnExit.Checked ? "关闭时将自动删除已下载文件" : "已关闭退出自动清理";
            };

            panel.Controls.Add(pathLabel);
            panel.Controls.Add(pathBox);
            panel.Controls.Add(browse);
            panel.Controls.Add(autoStart);
            panel.Controls.Add(cleanOnExit);
            panel.Controls.Add(openFolder);
            panel.Controls.Add(reset);
            return panel;
        }

        private Panel CreateStudioDownloadRecordsPanel(int width)
        {
            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = Math.Max(360, Math.Min(520, content.ClientSize.Height - 300)),
                Margin = new Padding(0, 0, 0, 18),
                BackColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 0 : 45, Line),
                Radius = 8
            };
            Label heading = new Label
            {
                Left = 18,
                Top = 16,
                Width = width - 160,
                Height = 26,
                Text = "下载记录",
                ForeColor = TextColor,
                Font = new Font(Font.FontFamily, 12F, FontStyle.Bold),
                BackColor = Color.Transparent
            };

            activeDownloadsList = new RoundedFlowLayoutPanel
            {
                Left = 18,
                Top = 54,
                Width = width - 36,
                Height = 94,
                BackColor = PanelBg,
                UseCustomBorderColor = true,
                BorderColor = Color.Transparent,
                DrawBorder = false,
                Padding = new Padding(0),
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                Tag = StudioActiveDownloadsTag
            };
            activeDownloadRows.Clear();
            recordsProgressLabel = CreateDownloadEmptyState(Math.Max(520, activeDownloadsList.Width), activeDownloadsList.Height, "当前没有下载任务", true);
            activeDownloadsList.Controls.Add(recordsProgressLabel);

            recordsList = CreateStudioDownloadList(width - 36, Math.Max(140, panel.Height - 246));
            recordsList.Left = 18;
            recordsList.Top = 166;

            FlowLayoutPanel actions = new FlowLayoutPanel
            {
                Left = 18,
                Top = panel.Height - 54,
                Width = width - 36,
                Height = 38,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                BackColor = PanelBg,
                Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            Button clear = MakeStudioSmallButton("清空记录");
            clear.Width = 92;
            Button deleteSelected = MakeStudioSmallButton("删除选中");
            deleteSelected.Width = 92;
            Button openFolder = MakeStudioSmallButton("打开目录");
            openFolder.Width = 92;
            Button openFile = MakeStudioSmallButton("打开文件");
            openFile.Width = 92;
            actions.Controls.Add(clear);
            actions.Controls.Add(deleteSelected);
            actions.Controls.Add(openFolder);
            actions.Controls.Add(openFile);
            openFile.Click += delegate { OpenSelectedRecordFile(); };
            openFolder.Click += delegate { OpenSelectedRecordFolder(); };
            deleteSelected.Click += delegate { DeleteSelectedDownloadRecords(); };
            clear.Click += delegate { ClearDownloadRecords(); };

            panel.Controls.Add(heading);
            panel.Controls.Add(activeDownloadsList);
            panel.Controls.Add(recordsList);
            panel.Controls.Add(actions);
            return panel;
        }

        private ListView CreateStudioDownloadList(int width, int height)
        {
            if (recordsList != null)
            {
                try { recordsList.Dispose(); } catch { }
            }
            recordsList = new ListView
            {
                Width = width,
                Height = height,
                View = View.Details,
                FullRowSelect = true,
                MultiSelect = true,
                HideSelection = false,
                BackColor = StudioRecordTableBack(),
                ForeColor = TextColor,
                BorderStyle = BorderStyle.None,
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                ShowItemToolTips = true,
                OwnerDraw = true,
                Tag = StudioRecordsListTag
            };
            recordsList.Columns.Add("时间", 122);
            recordsList.Columns.Add("结果", 86);
            recordsList.Columns.Add("名称", 260);
            recordsList.Columns.Add("保存位置", 300);
            recordsList.DoubleClick += delegate { OpenSelectedRecordFile(); };
            AttachDownloadRecordContextMenu(recordsList);
            recordsList.Resize += delegate { ResizeDownloadRecordColumns(); };
            recordsList.DrawColumnHeader += DrawDownloadRecordHeader;
            recordsList.DrawItem += DrawDownloadRecordItem;
            recordsList.DrawSubItem += DrawDownloadRecordSubItem;
            return recordsList;
        }

        private Control CreateStudioActionButton(Dictionary<string, object> item, int left, int top, int width, int height, int index)
        {
            TemplateActionButton button = CreateTemplateActionButton(item, index);
            button.Left = left;
            button.Top = top;
            button.Width = width;
            button.Height = height;
            button.StudioMode = true;
            return button;
        }

        private void RenderPortalSections()
        {
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = FlowDirection.TopDown;
            content.WrapContents = false;
            content.BackColor = Bg;

            List<Dictionary<string, object>> buttons = CollectButtons(currentSections);
            buttons.Sort((a, b) =>
            {
                int result = IntValue(a, "sort", 0).CompareTo(IntValue(b, "sort", 0));
                if (result != 0) return result;
                return String.Compare(GetText(a, "name", ""), GetText(b, "name", ""), StringComparison.CurrentCultureIgnoreCase);
            });

            Dictionary<string, object> app = AsDict(Get(config, "app"));
            int available = Math.Max(640, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 12);

            content.Controls.Add(new PortalHeroControl
            {
                Width = available,
                Height = Math.Max(190, Math.Min(238, content.ClientSize.Height / 3)),
                Margin = new Padding(0, 0, 0, 20),
                TitleText = PortalLabel(GetText(app, "title", "143"), "app.title"),
                SubtitleText = PortalLabel(GetText(app, "subtitle", ""), "app.subtitle"),
                AccentColor = Color.FromArgb(30, 102, 165)
            });

            string pageTitle = CurrentTemplatePageTitle();
            Label heading = new Label
            {
                Width = available,
                Height = 30,
                Margin = new Padding(0, 0, 0, 0),
                Text = String.IsNullOrWhiteSpace(pageTitle) ? PortalText("远程调试工具12", "Remote Debug Tools") : pageTitle,
                ForeColor = TextColor,
                BackColor = Bg,
                Font = new Font(Font.FontFamily, 14F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            content.Controls.Add(heading);

            Label sub = new Label
            {
                Width = available,
                Height = 24,
                Margin = new Padding(0, 0, 0, 8),
                Text = PortalText("首页推荐资源来自远程配置。", "Recommended resources are loaded from remote configuration."),
                ForeColor = Muted,
                BackColor = Bg,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Regular),
                TextAlign = ContentAlignment.MiddleLeft
            };
            content.Controls.Add(sub);

            FlowLayoutPanel cards = new FlowLayoutPanel
            {
                Width = available,
                Margin = new Padding(0, 0, 0, 10),
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                AutoScroll = false,
                BackColor = Bg
            };
            if (buttons.Count == 0)
            {
                cards.Height = 132;
                cards.Controls.Add(CreatePortalEmptyCard(Math.Min(330, available)));
            }
            else
            {
                int gap = 16;
                int columns = available >= 900 ? 4 : 3;
                int cardWidth = Math.Max(140, (available - gap * columns - 2) / columns);
                int rows = (int)Math.Ceiling(buttons.Count / (double)columns);
                cards.Height = Math.Max(132, rows * 132);
                for (int i = 0; i < buttons.Count; i++)
                {
                    cards.Controls.Add(CreatePortalActionButton(buttons[i], cardWidth, 118, i));
                }
            }
            content.Controls.Add(cards);

            content.ResumeLayout();
            ApplyPortalThemeToShell();
        }

        private void AddPortalSectionGroups(int available)
        {
            List<Dictionary<string, object>> sections = new List<Dictionary<string, object>>();
            foreach (object sectionObj in currentSections)
            {
                sections.Add(AsDict(sectionObj));
            }
            if (sections.Count == 0)
            {
                content.Controls.Add(CreatePortalEmptyGroup(available, PortalText("该分页暂无内容。", "No content on this page.")));
                return;
            }

            bool hasRendered = false;
            for (int sectionIndex = 0; sectionIndex < sections.Count; sectionIndex++)
            {
                Dictionary<string, object> section = sections[sectionIndex];
                List<Dictionary<string, object>> buttons = new List<Dictionary<string, object>>();
                foreach (object buttonObj in AsList(Get(section, "buttons")))
                {
                    buttons.Add(AsDict(buttonObj));
                }
                buttons.Sort((a, b) =>
                {
                    int result = IntValue(a, "sort", 0).CompareTo(IntValue(b, "sort", 0));
                    if (result != 0) return result;
                    return String.Compare(GetText(a, "name", ""), GetText(b, "name", ""), StringComparison.CurrentCultureIgnoreCase);
                });

                string sectionTitle = PortalLabel(GetText(section, "title", ""), "");
                bool showHeading = !String.IsNullOrWhiteSpace(sectionTitle);
                if (showHeading)
                {
                    content.Controls.Add(CreatePortalSectionHeading(sectionTitle, available));
                }

                if (buttons.Count == 0)
                {
                    content.Controls.Add(CreatePortalEmptyGroup(available, PortalText("该分组暂无按钮。", "No buttons in this group.")));
                    hasRendered = true;
                    continue;
                }

                content.Controls.Add(CreatePortalCardsPanel(buttons, available));
                hasRendered = true;
            }

            if (!hasRendered)
            {
                content.Controls.Add(CreatePortalEmptyGroup(available, PortalText("该分页暂无内容。", "No content on this page.")));
            }
        }

        private Control CreatePortalSectionHeading(string text, int width)
        {
            Label heading = new Label
            {
                Width = width,
                Height = 32,
                Margin = new Padding(0, 0, 0, 6),
                Text = text,
                ForeColor = TextColor,
                BackColor = Bg,
                Font = new Font(Font.FontFamily, 15F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            return heading;
        }

        private Control CreatePortalCardsPanel(List<Dictionary<string, object>> buttons, int available)
        {
            FlowLayoutPanel cards = new FlowLayoutPanel
            {
                Width = available,
                Margin = new Padding(0, 0, 0, 20),
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                AutoScroll = false,
                BackColor = Bg
            };
            int gap = 16;
            int columns = available >= 920 ? 3 : (available >= 660 ? 2 : 1);
            int cardWidth = Math.Max(260, (available - gap * columns - 2) / columns);
            int rows = (int)Math.Ceiling(buttons.Count / (double)columns);
            cards.Height = Math.Max(112, rows * 126);
            for (int i = 0; i < buttons.Count; i++)
            {
                cards.Controls.Add(CreatePortalActionButton(buttons[i], cardWidth, 104, i));
            }
            return cards;
        }

        private Control CreatePortalEmptyGroup(int width, string message)
        {
            return new PortalEmptyGroupControl
            {
                Width = width,
                Height = 118,
                Margin = new Padding(0, 0, 0, 20),
                Text = message
            };
        }

        private bool IsPortalHomePage(string pageId)
        {
            string homeId = PortalHomePageId();
            return !String.IsNullOrWhiteSpace(homeId) && pageId.Equals(homeId, StringComparison.OrdinalIgnoreCase);
        }

        private string PortalHomePageId()
        {
            IList<object> sidebar = AsList(Get(config, "sidebar"));
            foreach (object item in sidebar)
            {
                Dictionary<string, object> row = AsDict(item);
                string id = GetText(row, "id", "");
                if (!String.IsNullOrWhiteSpace(id) && !id.Equals("settings", StringComparison.OrdinalIgnoreCase)) return id;
            }
            Dictionary<string, object> pages = AsDict(Get(config, "pages"));
            foreach (string pageId in pages.Keys)
            {
                if (!String.IsNullOrWhiteSpace(pageId)) return pageId;
            }
            return "";
        }

        private void RenderPortalDownloadsPage()
        {
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = FlowDirection.TopDown;
            content.WrapContents = false;
            content.BackColor = Bg;
            int available = Math.Max(640, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 12);

            content.Controls.Add(CreatePortalPageHeading(PortalText("下载管理", "Download Manager"), "", available));

            Label toolbar = new Label
            {
                Width = available,
                Height = 26,
                Margin = new Padding(0, 6, 0, 10),
                Text = PortalText("下载记录会显示在下面的表格里。", "Download history is shown directly in the table below."),
                ForeColor = Muted,
                BackColor = Bg,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Regular),
                TextAlign = ContentAlignment.MiddleLeft
            };
            content.Controls.Add(toolbar);

            BuildPortalDownloadTable(available);
            content.ResumeLayout();
            ApplyPortalThemeToShell();
            RenderActiveDownloads();
        }

        private void RenderPortalSettingsPage()
        {
            content.SuspendLayout();
            content.Controls.Clear();
            content.FlowDirection = FlowDirection.TopDown;
            content.WrapContents = false;
            content.BackColor = Bg;
            int available = Math.Max(640, content.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 12);
            ClientSettings settings = LoadClientSettings();

            content.Controls.Add(CreatePortalPageHeading(PortalText("全局设置", "Global Settings"), "", available));

            BuildPortalSettingsForm(available, settings);
            content.ResumeLayout();
            ApplyPortalThemeToShell();
        }

        private void BuildPortalDownloadTable(int width)
        {
            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = Math.Max(360, content.ClientSize.Height - 180),
                Margin = new Padding(0, 0, 0, 14),
                BackColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 110 : 88, Line),
                Radius = 8
            };

            FlowLayoutPanel actions = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 44,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                BackColor = PanelBg,
                Padding = new Padding(14, 8, 14, 0)
            };
            Button openFolder = MakeTemplateTopButton(PortalText("打开目录", "Open Folder"), PortalSoftAccentBack(), Accent, Color.FromArgb(LightTheme ? 135 : 105, Accent), 72);
            Button deleteAll = MakeTemplateTopButton(PortalText("删除全部下载文件", "Delete All Files"), PanelBg2, TextColor, Color.FromArgb(LightTheme ? 100 : 78, Line), 124);
            Button clear = MakeTemplateTopButton(PortalText("清空记录", "Clear Records"), PanelBg2, TextColor, Color.FromArgb(LightTheme ? 100 : 78, Line), 76);
            openFolder.Click += delegate { OpenDownloadFolderFromSettings(); };
            deleteAll.Click += delegate { DeleteAllDownloadedFilesAndRecords(); };
            clear.Click += delegate { ClearDownloadRecords(); };
            actions.Controls.Add(openFolder);
            actions.Controls.Add(deleteAll);
            actions.Controls.Add(clear);
            panel.Controls.Add(actions);

            activeDownloadsList = new RoundedFlowLayoutPanel
            {
                Left = 12,
                Top = 48,
                Width = width - 24,
                Height = 108,
                BackColor = PortalRecordSurfaceBack(),
                BorderColor = Color.FromArgb(LightTheme ? 100 : 82, Line),
                UseCustomBorderColor = true,
                Padding = new Padding(10),
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                Tag = PortalActiveDownloadsTag
            };
            recordsProgressLabel = new EmptyStateLabel
            {
                Width = Math.Max(520, activeDownloadsList.Width - 20),
                Height = 82,
                Text = PortalText("当前没有下载任务", "No active downloads"),
                UseCustomColors = true,
                FillColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 80 : 65, Line),
                IconBackColor = PortalSoftAccentBack(),
                ForeColor = Muted
            };
            activeDownloadsList.Controls.Add(recordsProgressLabel);
            panel.Controls.Add(activeDownloadsList);

            ListView list = CreatePortalDownloadList(width - 24);
            list.Top = 168;
            list.Left = 12;
            list.Height = Math.Max(190, panel.Height - list.Top - 18);
            panel.Controls.Add(list);
            FillDownloadRecordsIntoList(list);
            content.Controls.Add(panel);
        }

        private void AttachDownloadRecordContextMenu(ListView list)
        {
            if (list == null) return;
            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem run = new ToolStripMenuItem(PortalText("运行", "Run"));
            ToolStripMenuItem openFolder = new ToolStripMenuItem(PortalText("打开目录", "Open Folder"));
            ToolStripMenuItem deleteSelected = new ToolStripMenuItem(PortalText("删除所选下载文件", "Delete Selected Files"));
            menu.Items.Add(run);
            menu.Items.Add(openFolder);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(deleteSelected);
            menu.Opening += delegate(object sender, CancelEventArgs e)
            {
                bool hasRecord = SelectedDownloadRecord(list) != null;
                run.Enabled = hasRecord;
                openFolder.Enabled = hasRecord;
                deleteSelected.Enabled = hasRecord;
                if (!hasRecord) e.Cancel = true;
            };
            run.Click += delegate { OpenSelectedRecordFile(); };
            openFolder.Click += delegate { OpenSelectedRecordFolder(); };
            deleteSelected.Click += delegate { DeleteSelectedDownloadRecords(); };
            list.MouseDown += delegate(object sender, MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Right) return;
                ListViewHitTestInfo hit = list.HitTest(e.Location);
                if (hit.Item == null)
                {
                    list.SelectedItems.Clear();
                    return;
                }
                if (!hit.Item.Selected) list.SelectedItems.Clear();
                hit.Item.Selected = true;
                hit.Item.Focused = true;
            };
            list.ContextMenuStrip = menu;
        }

        private void BuildPortalSettingsForm(int width, ClientSettings settings)
        {
            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = 420,
                Margin = new Padding(0, 0, 0, 14),
                BackColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 110 : 88, Line),
                Radius = 8
            };

            Label header = new Label
            {
                Left = 16,
                Top = 14,
                Width = width - 32,
                Height = 28,
                Text = PortalText("基础设置", "Basic Settings"),
                ForeColor = TextColor,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 11F, FontStyle.Bold)
            };
            panel.Controls.Add(header);

            Label pathLabel = new Label { Left = 16, Top = 56, Width = 120, Height = 20, Text = PortalText("下载路径", "Download Path"), ForeColor = TextColor, BackColor = Color.Transparent };
            TextBox pathBox = new TextBox { Left = 16, Top = 78, Width = width - 160, Text = GetDownloadDirectory(), BackColor = PortalFieldBack(), ForeColor = TextColor, BorderStyle = BorderStyle.FixedSingle };
            Button browse = MakeTemplateTopButton(PortalText("浏览", "Browse"), PortalSoftAccentBack(), Accent, Color.FromArgb(LightTheme ? 135 : 105, Accent), 64);
            browse.Left = width - 128;
            browse.Top = 76;
            browse.Click += delegate { ChooseDownloadFolderFromPortal(); };

            Label themeLabel = new Label { Left = 16, Top = 120, Width = 120, Height = 20, Text = PortalText("界面主题", "Theme"), ForeColor = TextColor, BackColor = Color.Transparent };
            ComboBox themeBox = new ComboBox
            {
                Left = 16,
                Top = 142,
                Width = width - 32,
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = PortalFieldBack(),
                ForeColor = TextColor
            };
            themeBox.DrawMode = DrawMode.OwnerDrawFixed;
            themeBox.ItemHeight = 22;
            themeBox.DrawItem += DrawPortalComboItem;
            ClientSettings currentSettings = LoadClientSettings();
            IList<ThemeOption> themes = VisibleThemeOptions(AsDict(Get(config, "app")));
            foreach (ThemeOption option in themes) themeBox.Items.Add(PortalThemeOption(option));
            int selectedThemeIndex = -1;
            for (int i = 0; i < themeBox.Items.Count; i++)
            {
                ThemeOption option = themeBox.Items[i] as ThemeOption;
                if (option != null && option.Value.Equals(String.IsNullOrWhiteSpace(currentSettings.Theme) ? CurrentTheme(AsDict(Get(config, "app"))) : currentSettings.Theme, StringComparison.OrdinalIgnoreCase))
                {
                    selectedThemeIndex = i;
                    break;
                }
            }
            if (selectedThemeIndex >= 0) themeBox.SelectedIndex = selectedThemeIndex;
            else if (themeBox.Items.Count > 0) themeBox.SelectedIndex = 0;

            FlatCheckBox autoStart = new FlatCheckBox
            {
                Left = 16,
                Top = 188,
                Width = width - 32,
                Text = PortalText("开机自启", "Start with Windows"),
                ForeColor = TextColor,
                BackColor = PanelBg,
                Checked = currentSettings.AutoStart || IsAutoStartEnabled()
            };
            FlatCheckBox cleanOnExit = new FlatCheckBox
            {
                Left = 16,
                Top = 218,
                Width = width - 32,
                Text = PortalText("退出自动清理下载文件", "Delete downloads on exit"),
                ForeColor = TextColor,
                BackColor = PanelBg,
                Checked = currentSettings.DeleteDownloadsOnExit
            };

            Button save = MakeTemplateTopButton(PortalText("保存设置", "Save"), Accent, LightTheme ? Color.White : Color.FromArgb(7, 18, 24), Color.FromArgb(LightTheme ? 135 : 105, Accent), 88);
            save.Left = 16;
            save.Top = 264;
            save.Click += delegate
            {
                currentSettings.DownloadDirectory = pathBox.Text.Trim();
                ThemeOption selectedTheme = themeBox.SelectedItem as ThemeOption;
                if (selectedTheme != null) currentSettings.Theme = selectedTheme.Value;
                currentSettings.AutoStart = autoStart.Checked;
                currentSettings.DeleteDownloadsOnExit = cleanOnExit.Checked;
                SaveClientSettings(currentSettings);
                SaveDownloadDirectory(pathBox.Text, currentSettings);
                SetAutoStart(autoStart.Checked);
                ApplyTheme(currentSettings.Theme);
                ApplyTemplatePalette();
                ApplyPortalThemeToShell();
                currentPage = "settings";
                RenderPortalSettingsPage();
                status.Text = PortalText("设置已保存", "Settings saved");
            };

            panel.Controls.Add(pathLabel);
            panel.Controls.Add(pathBox);
            panel.Controls.Add(browse);
            panel.Controls.Add(themeLabel);
            panel.Controls.Add(themeBox);
            panel.Controls.Add(autoStart);
            panel.Controls.Add(cleanOnExit);
            panel.Controls.Add(save);
            content.Controls.Add(panel);
        }

        private ListView CreatePortalDownloadList(int width)
        {
            if (recordsList != null)
            {
                try { recordsList.Dispose(); } catch { }
            }
            recordsList = new ListView
            {
                Width = width,
                Height = Math.Max(280, content.ClientSize.Height - 260),
                View = View.Details,
                FullRowSelect = true,
                MultiSelect = true,
                HideSelection = false,
                BackColor = PortalRecordTableBack(),
                ForeColor = TextColor,
                BorderStyle = BorderStyle.None,
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                ShowItemToolTips = true,
                OwnerDraw = true,
                Tag = PortalRecordsListTag
            };
            recordsList.Columns.Add(PortalText("时间", "Time"), 122);
            recordsList.Columns.Add(PortalText("结果", "Result"), 86);
            recordsList.Columns.Add(PortalText("名称", "Name"), 260);
            recordsList.Columns.Add(PortalText("保存位置", "Saved Path"), 300);
            recordsList.DoubleClick += delegate { OpenSelectedRecordFile(); };
            AttachDownloadRecordContextMenu(recordsList);
            recordsList.Resize += delegate { ResizeDownloadRecordColumns(); };
            recordsList.DrawColumnHeader += DrawDownloadRecordHeader;
            recordsList.DrawItem += DrawDownloadRecordItem;
            recordsList.DrawSubItem += DrawDownloadRecordSubItem;
            return recordsList;
        }

        private void FillDownloadRecordsIntoList(ListView list)
        {
            if (list == null) return;
            list.BeginUpdate();
            try
            {
                list.Items.Clear();
                List<DownloadRecord> records = LoadDownloadRecords();
                foreach (DownloadRecord record in records)
                {
                    ListViewItem row = new ListViewItem(record.Time);
                    row.SubItems.Add(record.Result);
                    row.SubItems.Add(record.Name);
                    row.SubItems.Add(record.SavedPath);
                    row.Tag = record;
                    list.Items.Add(row);
                }
                ResizeDownloadRecordColumns();
            }
            finally
            {
                list.EndUpdate();
            }
        }

        private Control CreatePortalPageHeading(string heading, string subtitle, int width)
        {
            Panel panel = new Panel
            {
                Width = width,
                Height = String.IsNullOrWhiteSpace(subtitle) ? 48 : 72,
                Margin = new Padding(0, 0, 0, 8),
                BackColor = Bg
            };
            Label h = new Label
            {
                Left = 0,
                Top = 6,
                Width = width,
                Height = 32,
                Text = heading,
                ForeColor = TextColor,
                BackColor = Bg,
                Font = new Font(Font.FontFamily, 16F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            panel.Controls.Add(h);
            if (!String.IsNullOrWhiteSpace(subtitle))
            {
                Label p = new Label
                {
                    Left = 0,
                    Top = 38,
                    Width = width,
                    Height = 24,
                    Text = subtitle,
                    ForeColor = Muted,
                    BackColor = Bg,
                    Font = new Font(Font.FontFamily, 9F, FontStyle.Regular),
                    TextAlign = ContentAlignment.MiddleLeft
                };
                panel.Controls.Add(p);
            }
            return panel;
        }

        private Control CreatePortalInfoPanel(int width, string heading, string text)
        {
            RoundedPanel panel = new RoundedPanel
            {
                Width = width,
                Height = 96,
                Margin = new Padding(0, 0, 0, 14),
                BackColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 110 : 88, Line),
                Radius = 8
            };
            Label h = new Label
            {
                Left = 18,
                Top = 14,
                Width = width - 36,
                Height = 26,
                Text = heading,
                ForeColor = TextColor,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 10.5F, FontStyle.Bold)
            };
            Label p = new Label
            {
                Left = 18,
                Top = 42,
                Width = width - 36,
                Height = 36,
                Text = text,
                ForeColor = Muted,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 9F, FontStyle.Regular)
            };
            panel.Controls.Add(h);
            panel.Controls.Add(p);
            return panel;
        }

        private Control CreatePortalUtilityCard(string titleText, string subtitleText, string iconText, int width, EventHandler click)
        {
            TemplateActionButton card = new TemplateActionButton
            {
                Width = width,
                Height = 112,
                Margin = new Padding(0, 0, 16, 12),
                StudioMode = false,
                Title = titleText,
                Subtitle = subtitleText,
                IconText = iconText,
                ButtonText = PortalText("打开", "Open"),
                AccentColor = Color.FromArgb(24, 129, 239)
            };
            card.Click += click;
            return card;
        }

        private string PortalText(string zh, string en)
        {
            return portalEnglish ? en : zh;
        }

        private string PortalLabel(string text, string id)
        {
            if (!portalVariant || !portalEnglish) return text;
            string value = (text ?? "").Trim();
            if (String.IsNullOrWhiteSpace(value))
            {
                return PortalLabelById(id, value);
            }

            string idLabel = PortalLabelById(id, "");
            if (!String.IsNullOrWhiteSpace(idLabel)) return idLabel;

            string mapped = PortalKnownLabel(value);
            return String.IsNullOrWhiteSpace(mapped) ? value : mapped;
        }

        private string PortalLabelById(string id, string fallback)
        {
            string key = (id ?? "").Trim().ToLowerInvariant();
            if (key == "rack") return "Rack Host";
            if (key == "plugins") return "Plugin Center";
            if (key == "debug") return "Debug Tools";
            if (key == "toolbox") return "System Tools";
            if (key == "driver") return "Audio Drivers";
            if (key == "software") return "Common Software";
            if (key == "websites") return "Common Sites";
            if (key == "settings") return "Package Settings";
            if (key == "downloads") return "Download Manager";
            if (key == "app.title") return PortalKnownLabel(String.IsNullOrWhiteSpace(portalBrandTitleSource) ? fallback : portalBrandTitleSource);
            if (key == "app.subtitle") return String.IsNullOrWhiteSpace(fallback) ? portalBrandSubtitleSource : fallback;
            return fallback;
        }

        private string PortalKnownLabel(string text)
        {
            string value = (text ?? "").Trim();
            if (String.IsNullOrWhiteSpace(value)) return value;
            if (value.IndexOf("www.", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf(".cn", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf(".com", StringComparison.OrdinalIgnoreCase) >= 0) return value;
            string key = value.ToLowerInvariant();
            if (key == "143") return "Audio Resource Hub";
            if (value == "工具箱") return "Toolbox";
            if (value == "首页") return "Home";
            if (value == "暂无内容") return "No Content";
            if (value == "少年音频资源网") return "Teen Audio Resources";
            if (value == "机架宿主") return "Rack Host";
            if (value == "插件中心") return "Plugin Center";
            if (value == "调试工具") return "Debug Tools";
            if (value == "系统工具") return "System Tools";
            if (value == "声卡驱动") return "Audio Drivers";
            if (value == "常用软件") return "Common Software";
            if (value == "常用网站") return "Common Sites";
            if (value == "打包设置") return "Package Settings";
            if (value == "下载管理") return "Download Manager";
            if (value == "全局设置") return "Global Settings";
            if (value == "远程调试工具12") return "Remote Debug Tools";
            if (value == "首页推荐资源来自远程配置。") return "Recommended resources are loaded from remote configuration.";
            if (value == "这里还没有按钮。") return "No items yet.";
            if (value == "未命名") return "Untitled";
            if (value == "下载") return "Download";
            if (value == "网页") return "Web Page";
            if (value == "脚本") return "Script";
            if (value == "命令") return "Command";
            if (value == "安装") return "Install";
            if (value == "已取消") return "Canceled";
            if (value == "下载失败") return "Failed";
            if (value == "下载中") return "Downloading";
            if (value == "下载完成") return "Complete";
            if (value == "已下载并请求管理员启动") return "Downloaded and requested admin launch";
            if (value == "已下载并请求管理员安装") return "Downloaded and requested admin install";
            if (value == "已下载，文件已定位") return "Downloaded and selected in folder";
            if (value == "已下载，用户取消管理员启动") return "Downloaded, admin launch canceled";
            if (value == "已下载，管理员启动失败") return "Downloaded, admin launch failed";
            if (value == "百度") return "Baidu";
            if (value == "常用声卡驱动") return "Common Audio Drivers";
            if (value == "虚拟声卡驱动") return "Virtual Audio Drivers";
            if (value == "驱动管理工具") return "Driver Managers";
            if (value == "主流DAW") return "Mainstream DAWs";
            if (value == "机架与虚拟声卡") return "Rack Hosts and Virtual Audio";
            if (value == "音频编辑工具") return "Audio Editing Tools";
            if (value == "音频素材平台") return "Audio Asset Platforms";
            if (value == "视频教程") return "Video Tutorials";
            if (value == "音频资源网站") return "Audio Resource Sites";
            if (value == "其他实用工具") return "Other Useful Tools";
            if (value == "VST效果器") return "VST Effects";
            if (value == "虚拟乐器") return "Virtual Instruments";
            if (value == "免费插件推荐") return "Free Plugin Picks";
            if (value == "免费音色库") return "Free Sound Libraries";
            if (value == "64位插件包") return "64-bit Plugin Pack";
            if (value == "韵味系统工具箱") return "Yunwei System Toolbox";
            return "";
        }

        private string PortalActionLabel(string action)
        {
            if (!portalVariant || !portalEnglish) return ActionLabel(action);
            string key = (action ?? "").Trim().ToLowerInvariant();
            if (key == "download") return "Download";
            if (key == "cmd") return "Command";
            if (key == "script") return "Script";
            if (key == "winget") return "Install";
            return "Web Page";
        }

        private ThemeOption PortalThemeOption(ThemeOption option)
        {
            if (option == null) return null;
            if (!portalVariant || !portalEnglish) return option;
            return new ThemeOption(option.Value, PortalThemeLabel(option.Label));
        }

        private string PortalThemeLabel(string label)
        {
            string value = (label ?? "").Trim();
            if (value == "星夜墨蓝") return "Starry Ink Blue";
            if (value == "午夜靛蓝") return "Midnight Indigo";
            if (value == "海雾蓝湖") return "Misty Blue Lake";
            if (value == "冰川浅蓝") return "Glacier Blue";
            if (value == "钻蓝冷辉") return "Diamond Blue";
            if (value == "晴空蓝白") return "Sky Blue";
            if (value == "森境青绿") return "Forest Green";
            if (value == "翡翠冷绿") return "Jade Green";
            if (value == "极光青碧") return "Aurora Cyan";
            if (value == "落日绯红") return "Sunset Crimson";
            if (value == "玫瑰粉雾") return "Rose Mist";
            if (value == "樱雾浅粉") return "Sakura Pink";
            if (value == "蓝雾淡紫") return "Blue Lavender";
            if (value == "星云紫幕") return "Nebula Purple";
            if (value == "霓虹电缎") return "Neon Satin";
            if (value == "墨金深空") return "Ink Gold Space";
            if (value == "暖棕咖啡") return "Warm Coffee";
            if (value == "余烬橙焰") return "Ember Orange";
            if (value == "沙丘金黄") return "Dune Gold";
            if (value == "银光素白") return "Silver White";
            return value;
        }

        private void SetPortalLanguage(bool english)
        {
            if (!portalVariant) return;
            portalEnglish = english;
            UpdatePortalLanguageButtons();
            UpdatePortalChromeLanguage();
            RenderCurrentPortalView();
        }

        private void UpdatePortalLanguageButtons()
        {
            if (portalCnButton == null || portalEnButton == null) return;
            ApplyPortalButtonTheme(portalCnButton);
            ApplyPortalButtonTheme(portalEnButton);
        }

        private void UpdatePortalChromeLanguage()
        {
            if (!portalVariant) return;
            if (brandTitle != null)
            {
                string titleText = PortalLabel(portalBrandTitleSource, "app.title");
                brandTitle.Text = titleText;
                FitBrandTitle(titleText);
                Text = titleText + " v" + Program.BuildStamp;
            }
            if (brandSubtitle != null) brandSubtitle.Text = PortalLabel(portalBrandSubtitleSource, "app.subtitle");
            if (recordsButton != null) recordsButton.Text = "↓  " + PortalText("下载管理", "Download Manager");
            if (settingsButton != null) settingsButton.Text = "⚙  " + PortalText("全局设置", "Global Settings");
            UpdateDownloadBadges();
            if (topToolTip != null)
            {
                if (recordsButton != null) topToolTip.SetToolTip(recordsButton, PortalText("下载管理", "Download Manager"));
                if (settingsButton != null) topToolTip.SetToolTip(settingsButton, PortalText("全局设置", "Global Settings"));
            }
            foreach (KeyValuePair<string, Control> pair in navButtons)
            {
                TemplateNavButton templateItem = pair.Value as TemplateNavButton;
                if (templateItem == null) continue;
                templateItem.Caption = PortalLabel(templateItem.SourceCaption, pair.Key);
                templateItem.Invalidate();
            }
        }

        private void RenderCurrentPortalView()
        {
            if (!portalVariant) return;
            if (currentPage == "downloads") RenderPortalDownloadsPage();
            else if (currentPage == "settings") RenderPortalSettingsPage();
            else RenderCurrentSections();
        }

        private void OpenDownloadFolderFromSettings()
        {
            string dir = GetDownloadDirectory();
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
        }

        private void ChooseDownloadFolderFromPortal()
        {
            ClientSettings settings = LoadClientSettings();
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = PortalText("选择下载保存目录", "Choose download folder");
                string selectedPath = GetDownloadDirectory();
                if (Directory.Exists(selectedPath)) dialog.SelectedPath = selectedPath;
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    settings.DownloadDirectory = dialog.SelectedPath;
                    SaveClientSettings(settings);
                    RenderPortalSettingsPage();
                }
            }
        }

        private Control CreatePortalActionButton(Dictionary<string, object> item, int width, int height, int index)
        {
            TemplateActionButton button = CreateTemplateActionButton(item, index);
            button.Width = width;
            button.Height = height;
            button.Margin = new Padding(0, 0, 16, 14);
            button.StudioMode = false;
            return button;
        }

        private Control CreatePortalEmptyCard(int width)
        {
            RoundedPanel empty = new RoundedPanel
            {
                Width = width,
                Height = 112,
                Margin = new Padding(0, 0, 16, 14),
                BackColor = PanelBg,
                BorderColor = Color.FromArgb(LightTheme ? 110 : 88, Line),
                Radius = 8
            };
            Label label = new Label
            {
                Dock = DockStyle.Fill,
                Text = PortalText("这里还没有按钮。", "No items yet."),
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Muted,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 9.5F, FontStyle.Regular)
            };
            empty.Controls.Add(label);
            return empty;
        }

        private TemplateActionButton CreateTemplateActionButton(Dictionary<string, object> item, int index)
        {
            string action = GetText(item, "action", Has(item, "url") ? "link" : "cmd").ToLowerInvariant();
            string target = GetTarget(item, action);
            string customScript = GetText(item, "custom_script", "");
            string iconUrl = GetText(item, "icon", "");
            string description = GetText(item, "description", GetText(item, "intro", GetText(item, "remark", "")));
            Image icon = LoadButtonIcon(iconUrl);
            TemplateActionButton button = new TemplateActionButton
            {
                Title = portalVariant ? PortalLabel(GetText(item, "name", "未命名"), GetText(item, "id", "")) : GetText(item, "name", "未命名"),
                Subtitle = portalVariant ? (String.IsNullOrWhiteSpace(description) ? PortalActionLabel(action) : PortalLabel(description, "")) : (String.IsNullOrWhiteSpace(description) ? ActionLabel(action) : description),
                IconText = TemplateActionIcon(action),
                IconImage = icon,
                ButtonText = portalVariant ? PortalText("打开", "Open") : "打开",
                AccentColor = CardAccent(action, GetText(item, "name", "未命名"), index),
                ActionInfo = new ActionInfo { Action = action, Target = target, CustomScript = customScript, Name = GetText(item, "name", "未命名") }
            };
            if (topToolTip != null) topToolTip.SetToolTip(button, BuildActionTip(button.Title, action, target, description));
            button.Click += delegate
            {
                ActionInfo info = button.ActionInfo;
                RunAction(info.Action, info.Target, info.CustomScript, info.Name);
            };
            return button;
        }

        private string CurrentTemplatePageTitle()
        {
            if (String.IsNullOrWhiteSpace(currentPage)) return portalVariant ? PortalText("远程调试工具12", "Remote Debug Tools") : "系统优化";
            if (currentPage.Equals("toolbox", StringComparison.OrdinalIgnoreCase)) return studioVariant ? "系统优化" : (portalVariant ? PortalLabel("系统工具", "toolbox") : "远程调试工具12");
            Dictionary<string, object> pages = AsDict(Get(config, "pages"));
            if (pages.ContainsKey(currentPage))
            {
                Dictionary<string, object> page = AsDict(pages[currentPage]);
                string label = PageLabel(page, currentPage);
                return portalVariant ? PortalLabel(label, currentPage) : label;
            }
            return portalVariant ? PortalLabel(FriendlyId(currentPage), currentPage) : FriendlyId(currentPage);
        }

        private void AddTemplateEmptyMessage(string message)
        {
            Label empty = new Label
            {
                Width = Math.Max(580, content.ClientSize.Width - 36),
                Height = 64,
                Margin = new Padding(0, 18, 0, 0),
                Text = message,
                ForeColor = Color.FromArgb(100, 116, 139),
                BackColor = Color.Transparent,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font(Font.FontFamily, 10F, FontStyle.Bold)
            };
            content.Controls.Add(empty);
        }

        private string TemplateSectionIcon(string text)
        {
            if ((text ?? "").IndexOf("常用", StringComparison.OrdinalIgnoreCase) >= 0) return "♫";
            if ((text ?? "").IndexOf("软件", StringComparison.OrdinalIgnoreCase) >= 0) return "▦";
            if ((text ?? "").IndexOf("驱动", StringComparison.OrdinalIgnoreCase) >= 0) return "◉";
            return "▣";
        }

        private string TemplateActionIcon(string action)
        {
            if (action == "download") return "↓";
            if (action == "cmd" || action == "script") return "⚙";
            if (action == "winget") return "▦";
            return "⌂";
        }

        private List<Dictionary<string, object>> CollectButtons(IList<object> sections)
        {
            List<Dictionary<string, object>> buttons = new List<Dictionary<string, object>>();
            foreach (object sectionObj in sections)
            {
                Dictionary<string, object> section = AsDict(sectionObj);
                foreach (object buttonObj in AsList(Get(section, "buttons")))
                {
                    buttons.Add(AsDict(buttonObj));
                }
            }
            return buttons;
        }

        private void AddEmptyMessage(string message)
        {
            Label empty = new Label
            {
                Width = Math.Max(580, content.ClientSize.Width - 36),
                Height = 42,
                Margin = new Padding(0, 18, 0, 0),
                Text = message,
                ForeColor = Muted,
                Font = new Font(Font.FontFamily, 11F, FontStyle.Bold)
            };
            content.Controls.Add(empty);
        }

        private Control CreateActionButton(Dictionary<string, object> item, int index, int width, int height)
        {
            string action = GetText(item, "action", Has(item, "url") ? "link" : "cmd").ToLowerInvariant();
            string target = GetTarget(item, action);
            string customScript = GetText(item, "custom_script", "");
            string iconUrl = GetText(item, "icon", "");
            string description = GetText(item, "description", GetText(item, "intro", GetText(item, "remark", "")));
            Image icon = LoadButtonIcon(iconUrl);
            ActionCard card = new ActionCard
            {
                Width = width,
                Height = height,
                Margin = new Padding(0, 0, listMode ? 0 : 12, 8),
                Title = GetText(item, "name", "未命名"),
                Subtitle = ActionLabel(action),
                Description = description,
                IconImage = icon,
                AccentColor = CardAccent(action, GetText(item, "name", "未命名"), index),
                ListMode = listMode,
                PortalMode = portalVariant && !listMode,
                ActionInfo = new ActionInfo { Action = action, Target = target, CustomScript = customScript, Name = GetText(item, "name", "未命名") }
            };
            topToolTip.SetToolTip(card, BuildActionTip(card.Title, action, target, description));
            card.Click += delegate
            {
                ActionInfo info = card.ActionInfo;
                RunAction(info.Action, info.Target, info.CustomScript, info.Name);
            };
            return card;
        }

        private string BuildActionTip(string name, string action, string target, string description)
        {
            StringBuilder tip = new StringBuilder();
            tip.AppendLine(String.IsNullOrWhiteSpace(name) ? PortalText("未命名", "Untitled") : name);
            if (!String.IsNullOrWhiteSpace(description)) tip.AppendLine(description);
            tip.AppendLine(PortalText("类型：", "Type: ") + (portalVariant ? PortalActionLabel(action) : ActionLabel(action)));
            return tip.ToString().Trim();
        }

        private Image LoadButtonIcon(string url)
        {
            return LoadRemoteImage(url, 24, 24);
        }

        private Image LoadRemoteImage(string url, int maxWidth, int maxHeight)
        {
            if (String.IsNullOrWhiteSpace(url)) return null;
            url = ResolveAssetUrl(url);
            string cacheKey = maxWidth + "x" + maxHeight + "|" + url;
            if (iconCache.ContainsKey(cacheKey)) return iconCache[cacheKey];
            if (failedIcons.Contains(cacheKey)) return null;
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 3000;
                request.ReadWriteTimeout = 3000;
                request.UserAgent = "ToolboxClient";
                using (WebResponse response = request.GetResponse())
                using (Stream stream = response.GetResponseStream())
                using (Image original = Image.FromStream(stream))
                {
                    Image resized = ResizeImage(original, maxWidth, maxHeight);
                    iconCache[cacheKey] = resized;
                    return resized;
                }
            }
            catch
            {
                failedIcons.Add(cacheKey);
                return null;
            }
        }

        private string ResolveAssetUrl(string url)
        {
            string value = (url ?? "").Trim();
            if (value.StartsWith("//")) return "https:" + value;
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return value;
            if (!value.StartsWith("/")) return value;
            try
            {
                Uri config = new Uri(configUrl);
                return config.GetLeftPart(UriPartial.Authority) + value;
            }
            catch
            {
                return value;
            }
        }

        private static Image ResizeImage(Image source, int maxWidth, int maxHeight)
        {
            double scale = Math.Min((double)maxWidth / source.Width, (double)maxHeight / source.Height);
            if (scale > 1) scale = 1;
            int width = Math.Max(1, (int)Math.Round(source.Width * scale));
            int height = Math.Max(1, (int)Math.Round(source.Height * scale));
            Bitmap bitmap = new Bitmap(width, height);
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(Color.Transparent);
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.DrawImage(source, new Rectangle(0, 0, width, height));
            }
            return bitmap;
        }

        private static GraphicsPath RoundRect(Rectangle rect, int radius)
        {
            int d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void RunAction(string action, string target, string customScript, string name)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(target) && String.IsNullOrWhiteSpace(customScript))
                {
                    status.Text = "按钮没有配置网址或命令。";
                    return;
                }
                if (action == "download") DownloadFile(target);
                else if (action == "cmd") RunCommand(target, false);
                else if (action == "script") RunScript(target, customScript, name);
                else if (action == "winget") RunCommand("winget install --id " + target + " -e --accept-source-agreements --accept-package-agreements & pause", false);
                else Open(target);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void Open(string target)
        {
            if (String.IsNullOrWhiteSpace(target)) return;
            Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        }

        private void RunCommand(string command, bool hidden)
        {
            if (String.IsNullOrWhiteSpace(command)) return;
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c " + command);
            if (hidden)
            {
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
            }
            else
            {
                psi.UseShellExecute = true;
            }
            Process.Start(psi);
        }

        private void RunScript(string id, string customScript, string name)
        {
            if (!String.IsNullOrWhiteSpace(customScript))
            {
                RunCustomScriptWithLog(String.IsNullOrWhiteSpace(name) ? "自定义内置功能" : name, customScript);
                return;
            }
            if (!scripts.ContainsKey(id) && !String.IsNullOrWhiteSpace(id) && (id.IndexOf(" ") >= 0 || id.IndexOf(".exe", StringComparison.OrdinalIgnoreCase) >= 0 || id.IndexOf("/") >= 0 || id.IndexOf("\\") >= 0))
            {
                RunCustomScriptWithLog(String.IsNullOrWhiteSpace(name) ? "自定义内置功能" : name, id);
                return;
            }
            if (scripts.ContainsKey(id))
            {
                string command = scripts[id];
                if (ShouldShowScriptLog(id))
                {
                    RunScriptWithLog(id, command);
                }
                else if (NeedsElevation(id, command))
                {
                    RunCommandElevated(command);
                }
                else
                {
                    RunCommand(command, !id.Equals("sys_cmd_prompt", StringComparison.OrdinalIgnoreCase));
                }
                return;
            }
            MessageBox.Show("这个内置功能需要正式壳单独适配：" + Environment.NewLine + id, "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void RunCustomScriptWithLog(string name, string command)
        {
            status.Text = PortalText("正在执行：", "Running: ") + name;
            ThreadPool.QueueUserWorkItem(delegate
            {
                CommandRunResult result = NeedsElevation("", command)
                    ? ExecuteElevatedCommandWithLog(command)
                    : ExecuteHiddenCommandWithLog(command);
                result.Name = name;
                BeginInvoke(new Action(delegate { ShowCommandLog(result); }));
            });
        }

        private void RunScriptWithLog(string id, string command)
        {
            string name = ScriptDisplayName(id);
            status.Text = PortalText("正在执行：", "Running: ") + (portalVariant ? PortalLabel(name, id) : name);
            ThreadPool.QueueUserWorkItem(delegate
            {
                CommandRunResult result = NeedsElevation(id, command)
                    ? ExecuteElevatedCommandWithLog(command)
                    : ExecuteHiddenCommandWithLog(command);
                result.Name = name;
                BeginInvoke(new Action(delegate { ShowCommandLog(result); }));
            });
        }

        private static bool ShouldShowScriptLog(string id)
        {
            string key = (id ?? "").ToLowerInvariant();
            return key == "sys_classic_context_menu" ||
                   key == "disable_firewall" ||
                   key == "disable_update" ||
                   key == "disable_uac" ||
                   key == "activate_windows" ||
                   key == "preset_audio_workstation" ||
                   key == "preset_privacy_lockdown" ||
                   key == "preset_pure_activate";
        }

        private static string ScriptDisplayName(string id)
        {
            string key = (id ?? "").ToLowerInvariant();
            if (key == "sys_classic_context_menu") return "Win传统右键";
            if (key == "disable_firewall") return "关闭防火墙";
            if (key == "disable_update") return "禁用系统更新";
            if (key == "disable_uac") return "禁用 UAC";
            if (key == "activate_windows") return "一键激活系统";
            if (key == "preset_audio_workstation") return "音频工站优化";
            if (key == "preset_privacy_lockdown") return "隐私加固";
            if (key == "preset_pure_activate") return "纯净激活套装";
            return String.IsNullOrWhiteSpace(id) ? "内置功能" : id;
        }

        private CommandRunResult ExecuteHiddenCommandWithLog(string command)
        {
            CommandRunResult result = new CommandRunResult { Command = command };
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c " + command);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.Default;
                psi.StandardErrorEncoding = Encoding.Default;
                using (Process process = Process.Start(psi))
                {
                    result.Output = process.StandardOutput.ReadToEnd();
                    result.Error = process.StandardError.ReadToEnd();
                    process.WaitForExit();
                    result.ExitCode = process.ExitCode;
                }
            }
            catch (Exception ex)
            {
                result.ExitCode = -1;
                result.Error = ex.Message;
            }
            return result;
        }

        private CommandRunResult ExecuteElevatedCommandWithLog(string command)
        {
            CommandRunResult result = new CommandRunResult { Command = command };
            string id = Guid.NewGuid().ToString("N");
            string batPath = Path.Combine(Path.GetTempPath(), "toolbox-script-" + id + ".bat");
            string logPath = Path.Combine(Path.GetTempPath(), "toolbox-script-" + id + ".log");
            result.LogPath = logPath;
            try
            {
                StringBuilder bat = new StringBuilder();
                bat.AppendLine("@echo off");
                bat.AppendLine("chcp 65001 > nul");
                bat.AppendLine("echo 正在执行系统修改命令... > \"" + logPath + "\"");
                bat.AppendLine("echo. >> \"" + logPath + "\"");
                bat.AppendLine(command + " >> \"" + logPath + "\" 2>&1");
                bat.AppendLine("set EXITCODE=%errorlevel%");
                bat.AppendLine("echo. >> \"" + logPath + "\"");
                bat.AppendLine("echo 退出码: %EXITCODE% >> \"" + logPath + "\"");
                bat.AppendLine("exit /b %EXITCODE%");
                File.WriteAllText(batPath, bat.ToString(), Encoding.UTF8);

                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + batPath + "\"");
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                using (Process process = Process.Start(psi))
                {
                    if (process != null)
                    {
                        process.WaitForExit();
                        result.ExitCode = process.ExitCode;
                    }
                }
                if (File.Exists(logPath)) result.Output = File.ReadAllText(logPath, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                result.ExitCode = -1;
                result.Error = ex.Message;
            }
            try { if (File.Exists(batPath)) File.Delete(batPath); } catch { }
            return result;
        }

        private void ShowCommandLog(CommandRunResult result)
        {
            bool ok = result.ExitCode == 0;
            status.Text = (ok ? PortalText("执行完成：", "Completed: ") : PortalText("执行失败：", "Failed: ")) + result.Name;
            string text = result.ToMessage();
            MessageBox.Show(text, result.Name + (ok ? " - 运行完成" : " - 运行失败"),
                MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        private static bool NeedsElevation(string id, string command)
        {
            string text = ((id ?? "") + " " + (command ?? "")).ToLowerInvariant();
            return text.Contains("hklm") || text.Contains("netsh") || text.Contains("sc config") || text.Contains("slmgr") || text.Contains("system32\\drivers\\etc\\hosts");
        }

        private void RunCommandElevated(string command)
        {
            if (String.IsNullOrWhiteSpace(command)) return;
            string args = "/c " + command;
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", args);
            psi.UseShellExecute = true;
            psi.Verb = "runas";
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(psi);
        }

        private void DownloadFile(string url)
        {
            if (String.IsNullOrWhiteSpace(url)) return;
            DownloadRequest download = ResolveDownloadRequest(url);
            if (download.BrowserOnly)
            {
                Open(String.IsNullOrWhiteSpace(download.BrowserUrl) ? url : download.BrowserUrl);
                status.Text = String.IsNullOrWhiteSpace(download.Message) ? "该链接需要在浏览器中完成下载。" : download.Message;
                return;
            }
            string fileName = SafeDownloadFileName(download.FileName);

            string dir = GetDownloadDirectory();
            Directory.CreateDirectory(dir);
            string path = Path.Combine(dir, fileName);
            DownloadRecord existingRecord = FindExistingDownloadRecord(url, path);
            if (existingRecord != null && !String.IsNullOrWhiteSpace(existingRecord.SavedPath) && File.Exists(existingRecord.SavedPath))
            {
                string launchStatus = LaunchDownloadedFile(existingRecord.SavedPath);
                status.Text = launchStatus + "：" + Path.GetFileName(existingRecord.SavedPath);
                FillDownloadRecords();
                return;
            }
            if (HasActiveDownload(url, path))
            {
                status.Text = "该文件正在下载中。";
                UpdateDownloadBadges();
                if (!portalVariant) ShowActiveDownloadView();
                return;
            }
            fileName = Path.GetFileName(path);
            DownloadTask task = new DownloadTask(download.Url, fileName, path, url);
            if (File.Exists(path)) task.Received = new FileInfo(path).Length;
            lock (activeDownloadsLock) activeDownloads.Add(task);
            status.Text = PortalText("正在下载：", "Downloading: ") + fileName;
            if (progressPanel != null) progressPanel.Visible = false;
            UpdateDownloadBadges();
            if (!studioVariant && !portalVariant) ShowActiveDownloadView();
            RenderActiveDownloads();

            ThreadPool.QueueUserWorkItem(delegate
            {
                DownloadFileWorker(task);
            });
        }

        private DownloadRequest ResolveDownloadRequest(string url)
        {
            DownloadRequest request = Resolve8UidDownloadRequest(url);
            if (request == null)
            {
                request = new DownloadRequest
                {
                    OriginalUrl = url,
                    Url = url,
                    FileName = FileNameFromUrl(url),
                    BrowserUrl = url
                };
            }
            if (!request.BrowserOnly)
            {
                string remoteName = ProbeRemoteFileName(request.Url);
                if (IsUsefulDownloadFileName(remoteName)) request.FileName = remoteName;
            }
            request.FileName = SafeDownloadFileName(request.FileName);
            return request;
        }

        private DownloadRequest Resolve8UidDownloadRequest(string url)
        {
            Uri uri;
            string token;
            if (!TryParse8UidToken(url, out uri, out token)) return null;
            string origin = uri.GetLeftPart(UriPartial.Authority);
            try
            {
                string api = origin + "/api/link/info/" + Uri.EscapeDataString(token);
                string json = DownloadPlainText(api, "application/json");
                Dictionary<string, object> root = AsDict(serializer.DeserializeObject(json));
                Dictionary<string, object> data = AsDict(Get(root, "data"));
                if (!BoolValue(root, "success", false) || data.Count == 0)
                {
                    return BrowserDownloadRequest(url, "该网盘链接需要在浏览器中确认，已为你打开。");
                }
                if (BoolValue(data, "require_captcha", false))
                {
                    return BrowserDownloadRequest(url, "该网盘链接需要人机验证，已为你打开浏览器。");
                }
                string directUrl = GetText(data, "download_url", "");
                string goToken = GetText(data, "go_token", "");
                string resolvedUrl = directUrl;
                if (String.IsNullOrWhiteSpace(resolvedUrl) && !String.IsNullOrWhiteSpace(goToken))
                {
                    resolvedUrl = origin + "/d/go?sig=" + Uri.EscapeDataString(goToken);
                }
                if (String.IsNullOrWhiteSpace(resolvedUrl))
                {
                    return BrowserDownloadRequest(url, "该网盘链接暂时无法解析真实文件，已为你打开浏览器。");
                }
                return new DownloadRequest
                {
                    OriginalUrl = url,
                    Url = resolvedUrl,
                    FileName = FileNameFromMetadata(data),
                    BrowserUrl = url
                };
            }
            catch
            {
                return BrowserDownloadRequest(url, "该网盘链接需要在浏览器中完成下载，已为你打开。");
            }
        }

        private DownloadRequest BrowserDownloadRequest(string url, string message)
        {
            return new DownloadRequest
            {
                OriginalUrl = url,
                Url = url,
                BrowserUrl = url,
                FileName = FileNameFromUrl(url),
                BrowserOnly = true,
                Message = message
            };
        }

        private static bool TryParse8UidToken(string url, out Uri uri, out string token)
        {
            uri = null;
            token = "";
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri)) return false;
            string host = (uri.Host ?? "").ToLowerInvariant();
            if (!(host.Equals("links.8uid.com", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".8uid.com", StringComparison.OrdinalIgnoreCase))) return false;
            string[] parts = uri.AbsolutePath.Trim(new char[] { '/' }).Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return false;
            string prefix = parts[0].ToLowerInvariant();
            if (prefix != "d" && prefix != "dl") return false;
            token = Uri.UnescapeDataString(parts[1]);
            return !String.IsNullOrWhiteSpace(token);
        }

        private string DownloadPlainText(string url, string accept)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 8000;
            request.ReadWriteTimeout = 8000;
            request.UserAgent = "Mozilla/5.0 ToolboxClient";
            request.Accept = String.IsNullOrWhiteSpace(accept) ? "*/*" : accept;
            request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
            request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
            using (WebResponse response = request.GetResponse())
            using (Stream stream = response.GetResponseStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private string ProbeRemoteFileName(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "HEAD";
                request.AllowAutoRedirect = true;
                request.UserAgent = "Mozilla/5.0 ToolboxClient";
                request.Timeout = 6000;
                request.ReadWriteTimeout = 6000;
                request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if (ResponseLooksLikeWebPage(response)) return "";
                    string dispositionName = FileNameFromContentDisposition(response.Headers["Content-Disposition"]);
                    if (IsUsefulDownloadFileName(dispositionName)) return dispositionName;
                    if (response.ResponseUri != null) return FileNameFromUrl(response.ResponseUri.ToString());
                }
            }
            catch
            {
            }
            return "";
        }

        private static bool ResponseLooksLikeWebPage(HttpWebResponse response)
        {
            string contentType = ((response == null ? "" : response.ContentType) ?? "").ToLowerInvariant();
            return contentType.IndexOf("text/html", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   contentType.IndexOf("application/json", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string FileNameFromMetadata(Dictionary<string, object> data)
        {
            string[] keys = new string[] { "filename", "fileName", "file_name", "originalName", "original_name", "name", "title" };
            foreach (string key in keys)
            {
                string value = GetText(data, key, "");
                if (IsUsefulDownloadFileName(value)) return value;
            }
            return "";
        }

        private static string FileNameFromContentDisposition(string disposition)
        {
            if (String.IsNullOrWhiteSpace(disposition)) return "";
            string encoded = ContentDispositionValue(disposition, "filename*");
            if (!String.IsNullOrWhiteSpace(encoded))
            {
                int marker = encoded.IndexOf("''", StringComparison.Ordinal);
                if (marker >= 0) encoded = encoded.Substring(marker + 2);
                try { return Uri.UnescapeDataString(encoded); } catch { return encoded; }
            }
            return ContentDispositionValue(disposition, "filename");
        }

        private static string ContentDispositionValue(string disposition, string key)
        {
            int index = disposition.IndexOf(key, StringComparison.OrdinalIgnoreCase);
            if (index < 0) return "";
            int equals = disposition.IndexOf('=', index);
            if (equals < 0) return "";
            int end = disposition.IndexOf(';', equals + 1);
            string value = end >= 0 ? disposition.Substring(equals + 1, end - equals - 1) : disposition.Substring(equals + 1);
            value = value.Trim();
            if (value.StartsWith("\"", StringComparison.Ordinal) && value.EndsWith("\"", StringComparison.Ordinal) && value.Length >= 2)
            {
                value = value.Substring(1, value.Length - 2);
            }
            return value.Replace("\\\"", "\"").Trim();
        }

        private static string FileNameFromUrl(string url)
        {
            try
            {
                Uri uri;
                if (Uri.TryCreate(url, UriKind.Absolute, out uri))
                {
                    return Uri.UnescapeDataString(Path.GetFileName(uri.LocalPath));
                }
            }
            catch
            {
            }
            string value = (url ?? "").Split(new char[] { '?' }, 2)[0].TrimEnd(new char[] { '/' });
            return Path.GetFileName(value);
        }

        private static string SafeDownloadFileName(string fileName)
        {
            string value = (fileName ?? "").Trim();
            try { value = Uri.UnescapeDataString(value); } catch { }
            foreach (char c in Path.GetInvalidFileNameChars()) value = value.Replace(c, '_');
            value = value.Trim().TrimEnd(new char[] { '.' });
            if (!IsUsefulDownloadFileName(value)) value = "download.bin";
            return value;
        }

        private static bool IsUsefulDownloadFileName(string fileName)
        {
            string value = (fileName ?? "").Trim();
            if (String.IsNullOrWhiteSpace(value)) return false;
            if (value.Equals("d", StringComparison.OrdinalIgnoreCase) || value.Equals("dl", StringComparison.OrdinalIgnoreCase) || value.Equals("go", StringComparison.OrdinalIgnoreCase)) return false;
            string stem = Path.GetFileNameWithoutExtension(value);
            string ext = Path.GetExtension(value);
            if (String.IsNullOrWhiteSpace(ext) && stem.Length >= 24)
            {
                bool hex = true;
                for (int i = 0; i < stem.Length; i++)
                {
                    char ch = stem[i];
                    if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')))
                    {
                        hex = false;
                        break;
                    }
                }
                if (hex) return false;
            }
            return true;
        }

        private void ShowActiveDownloadView()
        {
            if (studioVariant) ShowStudioSettingsPage();
            else if (portalVariant) ShowTemplateUtilityPage("downloads");
            else ShowDownloadRecordsPanel();
        }

        private DownloadRecord FindExistingDownloadRecord(string url, string defaultPath)
        {
            foreach (DownloadRecord record in LoadDownloadRecords())
            {
                if (record == null) continue;
                if (!String.Equals(record.Url ?? "", url ?? "", StringComparison.OrdinalIgnoreCase)) continue;
                if (!IsCompletedDownloadResult(record.Result)) continue;
                if (String.IsNullOrWhiteSpace(record.SavedPath) || !File.Exists(record.SavedPath)) continue;
                return record;
            }
            if (!String.IsNullOrWhiteSpace(defaultPath) && File.Exists(defaultPath) && (HasCompletedRecordForPath(defaultPath) || ExistingFileLooksComplete(url, defaultPath)))
            {
                return new DownloadRecord { Url = url, SavedPath = defaultPath, Name = Path.GetFileName(defaultPath), Result = "已下载" };
            }
            return null;
        }

        private bool HasCompletedRecordForPath(string path)
        {
            foreach (DownloadRecord record in LoadDownloadRecords())
            {
                if (record == null) continue;
                if (!String.Equals(record.SavedPath ?? "", path ?? "", StringComparison.OrdinalIgnoreCase)) continue;
                if (IsCompletedDownloadResult(record.Result)) return true;
            }
            return false;
        }

        private static bool IsCompletedDownloadResult(string result)
        {
            string text = result ?? "";
            return text.IndexOf("已下载", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   text.IndexOf("Downloaded", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private bool ExistingFileLooksComplete(string url, string path)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(url) || String.IsNullOrWhiteSpace(path) || !File.Exists(path)) return false;
                long localSize = new FileInfo(path).Length;
                if (localSize <= 0) return false;
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "HEAD";
                request.UserAgent = "Mozilla/5.0 ToolboxClient";
                request.Timeout = 4000;
                request.ReadWriteTimeout = 4000;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    long remoteSize = response.ContentLength;
                    return remoteSize > 0 && localSize == remoteSize;
                }
            }
            catch
            {
                return false;
            }
        }

        private bool HasActiveDownload(string url, string path)
        {
            lock (activeDownloadsLock)
            {
                foreach (DownloadTask task in activeDownloads)
                {
                    if (String.Equals(task.OriginalUrl ?? "", url ?? "", StringComparison.OrdinalIgnoreCase)) return true;
                    if (String.Equals(task.Url ?? "", url ?? "", StringComparison.OrdinalIgnoreCase)) return true;
                    if (String.Equals(task.Path ?? "", path ?? "", StringComparison.OrdinalIgnoreCase)) return true;
                }
            }
            return false;
        }

        private string UniqueDownloadPath(string path)
        {
            if (!File.Exists(path)) return path;
            string dir = Path.GetDirectoryName(path);
            string name = Path.GetFileNameWithoutExtension(path);
            string ext = Path.GetExtension(path);
            for (int i = 1; i < 1000; i++)
            {
                string candidate = Path.Combine(dir, name + " (" + i + ")" + ext);
                if (!File.Exists(candidate)) return candidate;
            }
            return Path.Combine(dir, name + "-" + DateTime.Now.ToString("yyyyMMddHHmmss") + ext);
        }

        private void DownloadFileWorker(DownloadTask task)
        {
            Exception failure = null;
            long received = 0;
            long total = -1;
            try
            {
                long resumeFrom = 0;
                if (File.Exists(task.Path)) resumeFrom = new FileInfo(task.Path).Length;
                received = resumeFrom;
                if (resumeFrom > 0)
                {
                    task.Received = resumeFrom;
                    task.StateText = "继续下载";
                }
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(task.Url);
                task.ActiveRequest = request;
                request.UserAgent = "Mozilla/5.0 ToolboxClient";
                request.Timeout = 15000;
                request.ReadWriteTimeout = 15000;
                if (resumeFrom > 0) request.AddRange(resumeFrom);
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    bool resumed = resumeFrom > 0 && response.StatusCode == HttpStatusCode.PartialContent;
                    if (resumeFrom > 0 && !resumed)
                    {
                        resumeFrom = 0;
                        received = 0;
                        task.Received = 0;
                    }
                    total = response.ContentLength;
                    if (resumed && total > 0) total += resumeFrom;
                    using (Stream input = response.GetResponseStream())
                    using (FileStream output = new FileStream(task.Path, resumed ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.Read))
                    {
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        DateTime lastUi = DateTime.MinValue;
                        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            task.PauseEvent.WaitOne();
                            if (task.CancelRequested) throw new OperationCanceledException();
                            output.Write(buffer, 0, read);
                            received += read;
                            task.Received = received;
                            task.Total = total;
                            task.StateText = PortalText("下载中", "Downloading");
                            task.UpdateSpeed();
                            if ((DateTime.Now - lastUi).TotalMilliseconds > 60)
                            {
                                lastUi = DateTime.Now;
                                BeginInvoke(new Action(delegate { RenderActiveDownloads(); }));
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                failure = ex;
            }

            BeginInvoke(new Action(delegate
            {
                task.ActiveRequest = null;
                FinishControlledDownload(task, failure);
            }));
        }

        private void FinishControlledDownload(DownloadTask task, Exception failure)
        {
            bool cancelled = failure is OperationCanceledException || task.CancelRequested;
            task.PauseEvent.Set();

            if (cancelled)
            {
                status.Text = PortalText("下载已取消：", "Download canceled: ") + task.FileName;
                AddDownloadRecord(task.FileName, task.OriginalUrl, File.Exists(task.Path) ? task.Path : "", PortalText("已取消", "Canceled"), "已保留未完成文件，下次点击会继续下载。");
                RemoveActiveDownload(task);
                FillDownloadRecords();
                return;
            }

            if (failure == null)
            {
                task.Received = task.Total > 0 ? task.Total : Math.Max(1, task.Received);
                task.StateText = PortalText("下载完成", "Complete");
                RenderActiveDownloads();
                string launchStatus = LaunchDownloadedFile(task.Path);
                status.Text = launchStatus + "：" + task.FileName;
                AddDownloadRecord(task.FileName, task.OriginalUrl, task.Path, launchStatus, "");
                RemoveActiveDownload(task);
                FillDownloadRecords();
                return;
            }

            status.Text = PortalText("下载失败，请检查网络或文件地址。", "Download failed. Please check the network or file URL.");
            AddDownloadRecord(task.FileName, task.OriginalUrl, File.Exists(task.Path) ? task.Path : "", PortalText("下载失败", "Failed"), CleanDownloadError(failure.Message));
            RemoveActiveDownload(task);
            FillDownloadRecords();
        }

        private void RemoveActiveDownload(DownloadTask task)
        {
            lock (activeDownloadsLock) activeDownloads.Remove(task);
            UpdateDownloadBadges();
            RenderActiveDownloads();
        }

        private string LaunchDownloadedFile(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            try
            {
                if (ext == ".exe")
                {
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true, Verb = "runas" });
                    return PortalText("已下载并请求管理员启动", "Downloaded and requested admin launch");
                }
                if (ext == ".msi")
                {
                    Process.Start(new ProcessStartInfo("msiexec.exe", "/i \"" + path + "\"") { UseShellExecute = true, Verb = "runas" });
                    return PortalText("已下载并请求管理员安装", "Downloaded and requested admin install");
                }
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"") { UseShellExecute = true });
                return PortalText("已下载，文件已定位", "Downloaded and selected in folder");
            }
            catch (Win32Exception ex)
            {
                if (ex.NativeErrorCode == 1223) return PortalText("已下载，用户取消管理员启动", "Downloaded, admin launch canceled");
                return PortalText("已下载，管理员启动失败", "Downloaded, admin launch failed");
            }
            catch
            {
                return PortalText("已下载，管理员启动失败", "Downloaded, admin launch failed");
            }
        }

        private string DefaultDownloadDirectory()
        {
            string brand = GetText(AsDict(Get(config, "app")), "title", "工具箱").Trim();
            if (String.IsNullOrWhiteSpace(brand)) brand = "工具箱";
            brand = SafeFolderName(brand);
            string driveRoot = Directory.Exists(@"D:\") ? @"D:\" : @"C:\";
            return Path.Combine(driveRoot, brand);
        }

        private static string SafeFolderName(string name)
        {
            string value = (name ?? "").Trim();
            foreach (char c in Path.GetInvalidFileNameChars()) value = value.Replace(c, '_');
            foreach (char c in Path.GetInvalidPathChars()) value = value.Replace(c, '_');
            value = value.Trim().TrimEnd(new char[] { '.' });
            return String.IsNullOrWhiteSpace(value) ? "工具箱" : value;
        }

        private string GetDownloadDirectory()
        {
            ClientSettings settings = LoadClientSettings();
            string dir = settings.DownloadDirectory;
            if (String.IsNullOrWhiteSpace(dir) || IsLegacyDownloadsDirectory(dir)) dir = DefaultDownloadDirectory();
            return Environment.ExpandEnvironmentVariables(dir);
        }

        private static bool IsLegacyDownloadsDirectory(string dir)
        {
            try
            {
                string value = Environment.ExpandEnvironmentVariables((dir ?? "").Trim()).TrimEnd(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar });
                string legacy = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads").TrimEnd(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar });
                return value.Equals(legacy, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private string ClientDataDir()
        {
            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ToolboxClient");
            Directory.CreateDirectory(appDir);
            return appDir;
        }

        private string ClientKey()
        {
            return Sha256Hex(configUrl).Substring(0, 16);
        }

        private string ClientSettingsPath()
        {
            return Path.Combine(ClientDataDir(), "settings-" + ClientKey() + ".json");
        }

        private ClientSettings LoadClientSettings()
        {
            try
            {
                string path = ClientSettingsPath();
                if (!File.Exists(path)) return new ClientSettings();
                string json = File.ReadAllText(path, Encoding.UTF8);
                ClientSettings settings = serializer.Deserialize<ClientSettings>(json);
                return settings ?? new ClientSettings();
            }
            catch
            {
                return new ClientSettings();
            }
        }

        private void SaveClientSettings(ClientSettings settings)
        {
            File.WriteAllText(ClientSettingsPath(), serializer.Serialize(settings), Encoding.UTF8);
        }

        private void AddDownloadRecord(string name, string url, string savedPath, string result, string message)
        {
            try
            {
                List<DownloadRecord> records = LoadDownloadRecords();
                records.Insert(0, new DownloadRecord
                {
                    Time = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    Name = name,
                    Url = url,
                    SavedPath = savedPath,
                    Result = result,
                    Message = message
                });
                while (records.Count > 100) records.RemoveAt(records.Count - 1);
                SaveDownloadRecords(records);
            }
            catch
            {
            }
        }

        private string DownloadRecordsPath()
        {
            return Path.Combine(ClientDataDir(), "downloads-" + ClientKey() + ".json");
        }

        private List<DownloadRecord> LoadDownloadRecords()
        {
            try
            {
                string path = DownloadRecordsPath();
                if (!File.Exists(path)) return new List<DownloadRecord>();
                string json = File.ReadAllText(path, Encoding.UTF8);
                List<DownloadRecord> records = serializer.Deserialize<List<DownloadRecord>>(json);
                return records ?? new List<DownloadRecord>();
            }
            catch
            {
                return new List<DownloadRecord>();
            }
        }

        private void SaveDownloadRecords(List<DownloadRecord> records)
        {
            string path = DownloadRecordsPath();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, serializer.Serialize(records), Encoding.UTF8);
        }

        private void ShowDownloadRecords()
        {
            if (recordsPanel == null) BuildRecordsPanel();
            FillDownloadRecords();
            recordsPanel.Visible = !recordsPanel.Visible;
            if (recordsPanel.Visible)
            {
                if (settingsPanel != null) settingsPanel.Visible = false;
                recordsPanel.BringToFront();
                recordsList.Focus();
            }
        }

        private void ShowDownloadRecordsPanel()
        {
            if (recordsPanel == null) BuildRecordsPanel();
            FillDownloadRecords();
            if (settingsPanel != null) settingsPanel.Visible = false;
            recordsPanel.Visible = true;
            recordsPanel.BringToFront();
        }

        private void DeleteDownloadedFilesFromTopButton()
        {
            DeleteAllDownloadedFilesAndRecords();
        }

        private void DeleteAllDownloadedFilesAndRecords()
        {
            List<DownloadRecord> records = LoadDownloadRecords();
            if (records.Count == 0)
            {
                MessageBox.Show(PortalText("当前没有下载记录。", "There are no download records."), PortalText("下载记录", "Download Records"), MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (MessageBox.Show(PortalText("确定删除全部下载文件并同时清空下载记录吗？", "Delete all downloaded files and clear download records?"), PortalText("下载记录", "Download Records"), MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            int deletedFiles = 0;
            foreach (DownloadRecord record in records)
            {
                if (DeleteDownloadedFile(record)) deletedFiles++;
            }
            SaveDownloadRecords(new List<DownloadRecord>());
            FillDownloadRecords();
            if (currentPage.Equals("settings", StringComparison.OrdinalIgnoreCase) && studioVariant) RenderStudioSettingsPage();
            if (currentPage.Equals("downloads", StringComparison.OrdinalIgnoreCase) && portalVariant) RenderPortalDownloadsPage();
            status.Text = PortalText("已删除下载文件 " + deletedFiles + " 个，并清空下载记录", "Deleted " + deletedFiles + " downloaded file(s) and cleared records");
            MessageBox.Show(PortalText("删除完毕。", "Done."), PortalText("下载记录", "Download Records"), MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void ToggleTopMost()
        {
            portalTopMost = !portalTopMost;
            TopMost = portalTopMost;
            UpdateStudioChromeButtons();
            status.Text = portalTopMost ? "窗口已置顶" : "已取消窗口置顶";
        }

        private void ToggleStudioTheme()
        {
            ClientSettings settings = LoadClientSettings();
            bool nextDark = !IsDarkModeSetting(settings.Theme);
            settings.Theme = nextDark ? "dark" : "light";
            SaveClientSettings(settings);
            ApplyStudioPalette(nextDark);
            ApplyStudioThemeToShell();
            BuildNav();
            if (currentPage.Equals("settings", StringComparison.OrdinalIgnoreCase)) RenderStudioSettingsPage();
            else RenderCurrentSections();
            UpdateStudioChromeButtons();
            status.Text = nextDark ? "已切换深色模式" : "已切换浅色模式";
        }

        private void UpdateStudioChromeButtons()
        {
            if (!studioVariant) return;
            UpdateDownloadBadges();
            if (topMostButton != null)
            {
                topMostButton.ForeColor = TextColor;
                if (topToolTip != null) topToolTip.SetToolTip(topMostButton, portalTopMost ? "取消置顶" : "窗口置顶");
                topMostButton.Invalidate();
            }
            if (themeButton != null)
            {
                themeButton.ForeColor = TextColor;
                StudioChromeButton chrome = themeButton as StudioChromeButton;
                if (chrome != null) chrome.IconKey = LightTheme ? "moon" : "sun";
                themeButton.Invalidate();
            }
            if (downloadTasksButton != null) downloadTasksButton.Invalidate();
            if (recordsButton != null) recordsButton.Invalidate();
            if (contactButton != null) contactButton.Invalidate();
        }

        private int ActiveDownloadCount()
        {
            lock (activeDownloadsLock) return activeDownloads.Count;
        }

        private void UpdateDownloadBadges()
        {
            int count = ActiveDownloadCount();
            if (studioVariant)
            {
                StudioChromeButton chrome = downloadTasksButton as StudioChromeButton;
                if (chrome != null)
                {
                    chrome.BadgeText = count > 0 ? Math.Min(99, count).ToString() : "";
                    if (topToolTip != null)
                    {
                        topToolTip.SetToolTip(downloadTasksButton, count > 0 ? "正在下载 " + count + " 个任务" : "下载任务");
                    }
                    chrome.Invalidate();
                }
            }
            if (portalVariant)
            {
                PortalBadgeSideButton portalRecords = recordsButton as PortalBadgeSideButton;
                if (portalRecords != null)
                {
                    portalRecords.BadgeText = count > 0 ? Math.Min(99, count).ToString() : "";
                    portalRecords.Invalidate();
                }
            }
        }

        private void ShowContactWindowFromButton()
        {
            ContactPopupConfig cfg = LoadPopupConfigNow(true) ?? popupConfig;
            if (cfg == null)
            {
                LoadPopupConfigAsync(true);
                MessageBox.Show("正在加载联系方式，请稍后再试。", "联系方式", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            ShowContactWindow(cfg);
        }

        private void ShowContactPopup(ContactPopupConfig cfg)
        {
            if (cfg == null || !cfg.Enabled) return;
            if (recordsPanel != null) recordsPanel.Visible = false;
            if (settingsPanel != null) settingsPanel.Visible = false;
            if (contactPopupOverlay != null)
            {
                Controls.Remove(contactPopupOverlay);
                contactPopupOverlay.Dispose();
                contactPopupOverlay = null;
            }

            Panel overlay = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(LightTheme ? 70 : 115, Color.Black)
            };
            contactPopupOverlay = overlay;
            Controls.Add(overlay);
            overlay.BringToFront();

            PopupPanel dialog = new PopupPanel
            {
                BackColor = DialogBodyBack(),
                Padding = new Padding(22, 18, 22, 18)
            };
            overlay.Controls.Add(dialog);

            Action position = delegate
            {
                int width = Math.Min(760, Math.Max(520, (int)(ClientSize.Width * 0.86)));
                int height = Math.Min(720, Math.Max(420, (int)(ClientSize.Height * 0.82)));
                if (ClientSize.Width < 720) width = Math.Max(320, ClientSize.Width - 28);
                if (ClientSize.Height < 560) height = Math.Max(360, ClientSize.Height - 28);
                dialog.Size = new Size(width, height);
                dialog.Left = Math.Max(8, (overlay.ClientSize.Width - dialog.Width) / 2);
                dialog.Top = Math.Max(8, (overlay.ClientSize.Height - dialog.Height) / 2);
            };
            position();
            overlay.Resize += delegate { position(); LayoutContactPopup(dialog); SelectContactPopupTab(dialog, cfg, activeContactPopupTab); };

            BuildContactPopupContent(dialog, cfg);
            LayoutContactPopup(dialog);
        }

        private void ShowContactWindow(ContactPopupConfig cfg)
        {
            if (cfg == null || !cfg.Enabled)
            {
                MessageBox.Show("后台暂未启用联系方式。", "联系方式", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (contactPopupWindow != null && !contactPopupWindow.IsDisposed)
            {
                contactPopupWindow.Activate();
                return;
            }

            Form window = new Form
            {
                Text = String.IsNullOrWhiteSpace(cfg.Title) ? "联系方式" : cfg.Title,
                StartPosition = FormStartPosition.CenterParent,
                Size = new Size(560, 620),
                MinimumSize = new Size(420, 460),
                BackColor = DialogBodyBack(),
                ForeColor = TextColor,
                Font = Font,
                ShowIcon = false
            };
            contactPopupWindow = window;

            Panel host = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = DialogBodyBack(),
                AutoScroll = true,
                Padding = new Padding(18)
            };
            window.Controls.Add(host);

            Label caption = new Label
            {
                Dock = DockStyle.Top,
                Height = 38,
                Text = String.IsNullOrWhiteSpace(cfg.Title) ? "联系方式" : cfg.Title,
                ForeColor = TextColor,
                BackColor = DialogBodyBack(),
                Font = new Font(Font.FontFamily, 13F, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            window.Controls.Add(caption);
            caption.BringToFront();

            window.Shown += delegate
            {
                FillPopupQrGrid(host, cfg.Contacts, "后台暂未配置联系方式。");
            };
            window.Resize += delegate
            {
                FillPopupQrGrid(host, cfg.Contacts, "后台暂未配置联系方式。");
            };
            window.FormClosed += delegate { contactPopupWindow = null; };
            window.Show(this);
        }

        private void CloseContactPopup()
        {
            if (contactPopupOverlay == null) return;
            Controls.Remove(contactPopupOverlay);
            contactPopupOverlay.Dispose();
            contactPopupOverlay = null;
        }

        private void BuildContactPopupContent(PopupPanel dialog, ContactPopupConfig cfg)
        {
            dialog.Controls.Clear();
            Label caption = new Label
            {
                Left = 24,
                Top = 18,
                Width = dialog.Width - 92,
                Height = 34,
                Text = String.IsNullOrWhiteSpace(cfg.Title) ? "联系我们 / 支持作者" : cfg.Title,
                ForeColor = TextColor,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 14F, FontStyle.Bold),
                AutoEllipsis = true
            };
            Button close = MakeCloseButton();
            close.Left = dialog.Width - 58;
            close.Top = 18;
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            close.Click += delegate { CloseContactPopup(); };

            FlowLayoutPanel tabs = new FlowLayoutPanel
            {
                Left = 24,
                Top = 62,
                Width = dialog.Width - 48,
                Height = 42,
                BackColor = DialogCardBack(),
                Padding = new Padding(4),
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };
            Panel contentHost = new Panel
            {
                Left = 24,
                Top = 116,
                Width = dialog.Width - 48,
                Height = dialog.Height - 142,
                BackColor = DialogBodyBack(),
                AutoScroll = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
            };
            dialog.Controls.Add(caption);
            dialog.Controls.Add(close);
            dialog.Controls.Add(tabs);
            dialog.Controls.Add(contentHost);

            string[] tabNames = new string[] { "联系我", "支持作者", "相关链接" };
            for (int i = 0; i < tabNames.Length; i++)
            {
                int tabIndex = i;
                Button tab = MakeDialogButton(tabNames[i]);
                tab.Width = 108;
                tab.Height = 32;
                tab.Margin = new Padding(0, 0, 8, 0);
                tab.Tag = tabIndex;
                tab.Click += delegate { SelectContactPopupTab(dialog, cfg, tabIndex); };
                tabs.Controls.Add(tab);
            }
            SelectContactPopupTab(dialog, cfg, 0);
        }

        private void SelectContactPopupTab(PopupPanel dialog, ContactPopupConfig cfg, int index)
        {
            activeContactPopupTab = index;
            FlowLayoutPanel tabs = dialog.Controls.Count > 2 ? dialog.Controls[2] as FlowLayoutPanel : null;
            Panel contentHost = dialog.Controls.Count > 3 ? dialog.Controls[3] as Panel : null;
            if (tabs == null || contentHost == null) return;
            dialog.BackColor = DialogBodyBack();
            tabs.BackColor = DialogCardBack();
            contentHost.BackColor = DialogBodyBack();
            foreach (Control child in tabs.Controls)
            {
                Button tab = child as Button;
                if (tab == null) continue;
                bool active = Convert.ToInt32(tab.Tag) == index;
                tab.BackColor = active ? Accent : (LightTheme ? PanelBg2 : Color.FromArgb(35, 53, 74));
                tab.ForeColor = active && !LightTheme ? Color.White : TextColor;
            }
            contentHost.Controls.Clear();
            if (index == 0) FillPopupQrGrid(contentHost, cfg.Contacts, "后台暂未配置联系方式。");
            else if (index == 1) FillPopupPaymentGrid(contentHost, cfg);
            else FillPopupLinks(contentHost, cfg.Links);
        }

        private void FillPopupPaymentGrid(Panel host, ContactPopupConfig cfg)
        {
            FillPopupQrGrid(host, cfg.Payments, "后台暂未配置收款码。");
            if (!String.IsNullOrWhiteSpace(cfg.ThanksText))
            {
                Label thanks = new Label
                {
                    Left = 2,
                    Top = host.Controls.Count > 0 ? host.Controls[host.Controls.Count - 1].Bottom + 12 : 0,
                    Width = Math.Max(200, host.ClientSize.Width - 24),
                    Height = 48,
                    Text = cfg.ThanksText,
                    ForeColor = DialogSubText(),
                    BackColor = Color.Transparent,
                    AutoEllipsis = false
                };
                host.Controls.Add(thanks);
            }
        }

        private void FillPopupQrGrid(Panel host, List<ContactPopupItem> rows, string emptyText)
        {
            host.SuspendLayout();
            host.Controls.Clear();
            int contentWidth = Math.Max(260, host.ClientSize.Width - 22);
            if (rows == null || rows.Count == 0)
            {
                EmptyStateLabel empty = new EmptyStateLabel
                {
                    Left = 2,
                    Top = 2,
                    Width = contentWidth,
                    Height = 92,
                    Text = emptyText
                };
                host.Controls.Add(empty);
                host.ResumeLayout();
                return;
            }
            int gap = 14;
            int columns = contentWidth >= 620 ? 2 : 1;
            int cardWidth = columns == 2 ? (contentWidth - gap) / 2 : contentWidth;
            int x = 0;
            int y = 0;
            int rowHeight = 0;
            for (int i = 0; i < rows.Count; i++)
            {
                RoundedPanel card = CreatePopupQrCard(rows[i], cardWidth);
                card.Left = x;
                card.Top = y;
                host.Controls.Add(card);
                rowHeight = Math.Max(rowHeight, card.Height);
                if (columns == 1 || x > 0)
                {
                    x = 0;
                    y += rowHeight + gap;
                    rowHeight = 0;
                }
                else
                {
                    x += cardWidth + gap;
                }
            }
            host.ResumeLayout();
        }

        private RoundedPanel CreatePopupQrCard(ContactPopupItem item, int width)
        {
            RoundedPanel card = new RoundedPanel
            {
                Width = width,
                Height = 310,
                Radius = 12,
                BackColor = DialogCardBack(),
                BorderColor = Color.FromArgb(78, Line)
            };
            Label titleLabel = new Label
            {
                Left = 14,
                Top = 12,
                Width = width - 28,
                Height = 24,
                Text = String.IsNullOrWhiteSpace(item.Title) ? "未命名" : item.Title,
                ForeColor = TextColor,
                BackColor = Color.Transparent,
                Font = new Font(Font.FontFamily, 10.5F, FontStyle.Bold),
                AutoEllipsis = true
            };
            Label desc = new Label
            {
                Left = 14,
                Top = 38,
                Width = width - 28,
                Height = 42,
                Text = item.Description,
                ForeColor = DialogSubText(),
                BackColor = Color.Transparent
            };
            Panel qrHost = new Panel
            {
                Left = Math.Max(14, (width - 184) / 2),
                Top = 88,
                Width = 184,
                Height = 184,
                BackColor = Color.White
            };
            PictureBox qr = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.White,
                Padding = new Padding(8)
            };
            Image image = LoadRemoteImage(item.Image, 168, 168);
            if (image == null)
            {
                Label failed = new Label
                {
                    Dock = DockStyle.Fill,
                    Text = "二维码加载失败",
                    ForeColor = Color.FromArgb(100, 116, 139),
                    BackColor = Color.White,
                    TextAlign = ContentAlignment.MiddleCenter
                };
                qrHost.Controls.Add(failed);
            }
            else
            {
                qr.Image = image;
                qrHost.Controls.Add(qr);
            }
            card.Controls.Add(titleLabel);
            card.Controls.Add(desc);
            card.Controls.Add(qrHost);
            if (!String.IsNullOrWhiteSpace(item.ButtonText) && IsHttpUrl(item.ButtonUrl))
            {
                FlowLayoutPanel actionWrap = new FlowLayoutPanel
                {
                    Left = 14,
                    Top = 278,
                    Width = width - 28,
                    Height = 34,
                    BackColor = Color.Transparent,
                    FlowDirection = FlowDirection.LeftToRight,
                    WrapContents = true
                };
                Button open = MakeDialogButton(item.ButtonText);
                open.Width = Math.Min(width - 28, Math.Max(96, item.ButtonText.Length * 16));
                open.Margin = new Padding(0);
                open.Click += delegate { Open(item.ButtonUrl); };
                actionWrap.Controls.Add(open);
                card.Controls.Add(actionWrap);
            }
            return card;
        }

        private void FillPopupLinks(Panel host, List<ContactPopupLink> rows)
        {
            host.SuspendLayout();
            host.Controls.Clear();
            int contentWidth = Math.Max(260, host.ClientSize.Width - 22);
            if (rows == null || rows.Count == 0)
            {
                EmptyStateLabel empty = new EmptyStateLabel { Left = 2, Top = 2, Width = contentWidth, Height = 92, Text = "后台暂未配置相关链接。" };
                host.Controls.Add(empty);
                host.ResumeLayout();
                return;
            }
            int y = 0;
            foreach (ContactPopupLink item in rows)
            {
                RoundedPanel row = new RoundedPanel
                {
                    Left = 0,
                    Top = y,
                    Width = contentWidth,
                    Height = 86,
                    Radius = 12,
                    BackColor = DialogCardBack(),
                    BorderColor = Color.FromArgb(78, Line)
                };
                Label titleLabel = new Label
                {
                    Left = 14,
                    Top = 12,
                    Width = Math.Max(120, contentWidth - 148),
                    Height = 22,
                    Text = String.IsNullOrWhiteSpace(item.Title) ? item.Url : item.Title,
                    ForeColor = TextColor,
                    BackColor = Color.Transparent,
                    Font = new Font(Font.FontFamily, 10F, FontStyle.Bold),
                    AutoEllipsis = true
                };
                Label desc = new Label
                {
                    Left = 14,
                    Top = 38,
                    Width = Math.Max(120, contentWidth - 148),
                    Height = 34,
                    Text = String.IsNullOrWhiteSpace(item.Description) ? item.Url : item.Description,
                    ForeColor = DialogSubText(),
                    BackColor = Color.Transparent,
                    AutoEllipsis = true
                };
                Button open = MakeDialogButton(String.IsNullOrWhiteSpace(item.ButtonText) ? "打开链接" : item.ButtonText);
                open.Left = contentWidth - 124;
                open.Top = 24;
                open.Width = 110;
                open.Click += delegate { Open(item.Url); };
                row.Controls.Add(titleLabel);
                row.Controls.Add(desc);
                row.Controls.Add(open);
                host.Controls.Add(row);
                y += row.Height + 12;
            }
            host.ResumeLayout();
        }

        private void LayoutContactPopup(PopupPanel dialog)
        {
            if (dialog == null || dialog.Controls.Count < 4) return;
            Control caption = dialog.Controls[0];
            Control close = dialog.Controls[1];
            Control tabs = dialog.Controls[2];
            Control host = dialog.Controls[3];
            caption.Width = dialog.Width - 92;
            close.Left = dialog.Width - 58;
            tabs.Width = dialog.Width - 48;
            host.Width = dialog.Width - 48;
            host.Height = dialog.Height - 142;
        }

        private void RefreshContactPopupTheme()
        {
            if (contactPopupOverlay == null) return;
            contactPopupOverlay.BackColor = Color.FromArgb(LightTheme ? 70 : 115, Color.Black);
            PopupPanel dialog = contactPopupOverlay.Controls.Count > 0 ? contactPopupOverlay.Controls[0] as PopupPanel : null;
            if (dialog == null || popupConfig == null || !popupConfig.Enabled) return;
            dialog.BackColor = DialogBodyBack();
            LayoutContactPopup(dialog);
            SelectContactPopupTab(dialog, popupConfig, activeContactPopupTab);
        }

        private void BuildRecordsPanel()
        {
            recordsPanel = new PopupPanel
            {
                Width = 660,
                Height = 470,
                Visible = false,
                BackColor = DialogBodyBack(),
                Padding = new Padding(18),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            Controls.Add(recordsPanel);
            PositionRecordsPanel();
            Resize += delegate { PositionRecordsPanel(); };

            TableLayoutPanel layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 5,
                BackColor = DialogBodyBack(),
                Margin = Padding.Empty,
                Padding = new Padding(4, 2, 12, 10)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 116F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 10F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54F));
            recordsPanel.Controls.Add(layout);

            Button close = MakeCloseButton();
            close.Text = "×";
            close.Width = 34;
            close.Height = 30;
            close.Top = 16;
            close.Left = recordsPanel.Width - 52;
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            close.Click += delegate { recordsPanel.Visible = false; };
            recordsPanel.Controls.Add(close);
            close.BringToFront();

            activeDownloadsList = new RoundedFlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                BackColor = DialogCardBack(),
                Padding = new Padding(10, 10, 10, 10),
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true
            };
            recordsProgressLabel = new EmptyStateLabel { Width = 590, Height = 82, Text = PortalText("当前没有下载任务", "No active downloads") };
            activeDownloadsList.Controls.Add(recordsProgressLabel);
            layout.Controls.Add(activeDownloadsList, 0, 0);

            Label caption = new Label
            {
                Dock = DockStyle.Fill,
                Text = PortalText("下载记录", "Download Records"),
                ForeColor = TextColor,
                BackColor = DialogBodyBack(),
                TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font(Font.FontFamily, 12F, FontStyle.Bold),
                Padding = new Padding(4, 0, 0, 0)
            };
            layout.Controls.Add(caption, 0, 1);

            recordsList = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                MultiSelect = true,
                HideSelection = false,
                BackColor = DialogFieldBack(),
                ForeColor = TextColor,
                BorderStyle = BorderStyle.None,
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                ShowItemToolTips = true,
                OwnerDraw = true
            };
            recordsList.Columns.Add(PortalText("时间", "Time"), 122);
            recordsList.Columns.Add(PortalText("结果", "Result"), 86);
            recordsList.Columns.Add(PortalText("名称", "Name"), 260);
            recordsList.Columns.Add(PortalText("保存位置", "Saved Path"), 300);
            recordsList.DoubleClick += delegate { OpenSelectedRecordFile(); };
            recordsList.Resize += delegate { ResizeDownloadRecordColumns(); };
            recordsList.DrawColumnHeader += DrawDownloadRecordHeader;
            recordsList.DrawItem += DrawDownloadRecordItem;
            recordsList.DrawSubItem += DrawDownloadRecordSubItem;
            AttachDownloadRecordContextMenu(recordsList);
            RoundedPanel tableHost = new RoundedPanel
            {
                Dock = DockStyle.Fill,
                BackColor = DialogFieldBack(),
                BorderColor = Color.FromArgb(82, Line),
                Radius = 12,
                Padding = new Padding(1)
            };
            tableHost.Controls.Add(recordsList);
            layout.Controls.Add(tableHost, 0, 2);

            Panel separator = new Panel { Dock = DockStyle.Fill, BackColor = DialogBodyBack() };
            layout.Controls.Add(separator, 0, 3);

            FlowLayoutPanel actions = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                Padding = new Padding(0, 10, 4, 0),
                BackColor = DialogBodyBack()
            };
            Button clear = MakeDialogButton(PortalText("清空记录", "Clear Records"));
            Button deleteSelected = MakeDialogButton(PortalText("删除选中", "Delete Selected"));
            Button openFolder = MakeDialogButton(PortalText("打开目录", "Open Folder"));
            Button openFile = MakeDialogButton(PortalText("打开文件", "Open File"));
            actions.Controls.Add(clear);
            actions.Controls.Add(deleteSelected);
            actions.Controls.Add(openFolder);
            actions.Controls.Add(openFile);

            openFile.Click += delegate { OpenSelectedRecordFile(); };
            openFolder.Click += delegate { OpenSelectedRecordFolder(); };
            deleteSelected.Click += delegate { DeleteSelectedDownloadRecords(); };
            clear.Click += delegate { ClearDownloadRecords(); };
            layout.Controls.Add(actions, 0, 4);
        }

        private void PositionRecordsPanel()
        {
            if (recordsPanel == null) return;
            recordsPanel.Left = Math.Max(12, ClientSize.Width - recordsPanel.Width - 22);
            recordsPanel.Top = 74;
        }

        private void RenderActiveDownloads()
        {
            if (activeDownloadsList == null) return;
            List<DownloadTask> tasks;
            lock (activeDownloadsLock) tasks = new List<DownloadTask>(activeDownloads);
            activeDownloadsList.SuspendLayout();
            bool studioInline = IsStudioActiveDownloadsList(activeDownloadsList);
            activeDownloadsList.AutoScroll = !studioInline || tasks.Count > 1;
            if (tasks.Count == 0)
            {
                activeDownloadsList.Controls.Clear();
                activeDownloadRows.Clear();
                int emptyHeight = studioInline ? Math.Max(62, activeDownloadsList.ClientSize.Height) : 82;
                recordsProgressLabel = CreateDownloadEmptyState(
                    Math.Max(520, studioInline ? activeDownloadsList.ClientSize.Width : activeDownloadsList.ClientSize.Width - 20),
                    emptyHeight,
                    PortalText("当前没有下载任务", "No active downloads"),
                    studioInline);
                if (portalVariant)
                {
                    EmptyStateLabel portalEmpty = recordsProgressLabel as EmptyStateLabel;
                    if (portalEmpty != null)
                    {
                        portalEmpty.UseCustomColors = true;
                        portalEmpty.FillColor = PanelBg;
                        portalEmpty.BorderColor = Color.FromArgb(LightTheme ? 80 : 65, Line);
                        portalEmpty.IconBackColor = PortalSoftAccentBack();
                        portalEmpty.ForeColor = Muted;
                    }
                }
                activeDownloadsList.Controls.Add(recordsProgressLabel);
                activeDownloadsList.ResumeLayout();
                return;
            }

            if (recordsProgressLabel != null && activeDownloadsList.Controls.Contains(recordsProgressLabel))
            {
                activeDownloadsList.Controls.Remove(recordsProgressLabel);
            }

            HashSet<string> liveIds = new HashSet<string>();
            foreach (DownloadTask task in tasks)
            {
                liveIds.Add(task.Id);
                Panel row;
                if (!activeDownloadRows.TryGetValue(task.Id, out row) || row.IsDisposed)
                {
                    row = CreateDownloadTaskRow(task);
                    activeDownloadRows[task.Id] = row;
                }
                if (row.Parent != activeDownloadsList)
                {
                    if (row.Parent != null) row.Parent.Controls.Remove(row);
                    activeDownloadsList.Controls.Add(row);
                }
                UpdateDownloadTaskRow(task, row);
            }

            List<string> deadIds = new List<string>();
            foreach (KeyValuePair<string, Panel> pair in activeDownloadRows)
            {
                if (!liveIds.Contains(pair.Key))
                {
                    activeDownloadsList.Controls.Remove(pair.Value);
                    pair.Value.Dispose();
                    deadIds.Add(pair.Key);
                }
            }
            foreach (string id in deadIds)
            {
                activeDownloadRows.Remove(id);
            }
            activeDownloadsList.ResumeLayout();
        }

        private Panel CreateDownloadTaskRow(DownloadTask task)
        {
            bool studioInline = IsStudioActiveDownloadsList(activeDownloadsList);
            Panel row = new RoundedPanel
            {
                Width = Math.Max(540, activeDownloadsList.ClientSize.Width - 24),
                Height = 84,
                Margin = new Padding(0, 0, 0, 8),
                BackColor = studioInline ? StudioRecordCardBack() : DialogCardBack(),
                Padding = Padding.Empty
            };
            int buttonWidth = 72;
            int buttonGap = 8;
            int buttonTop = 25;
            int reservedRight = (buttonWidth * 3) + (buttonGap * 2) + 26;
            Label label = new Label
            {
                Name = "taskFileLabel",
                Left = 16,
                Top = 12,
                Width = Math.Max(220, row.Width - reservedRight - 18),
                Height = 22,
                ForeColor = TextColor,
                BackColor = Color.Transparent,
                AutoEllipsis = true
            };
            Label meta = new Label
            {
                Name = "taskMetaLabel",
                Left = 16,
                Top = 34,
                Width = Math.Max(220, row.Width - reservedRight - 18),
                Height = 20,
                ForeColor = Muted,
                BackColor = Color.Transparent,
                AutoEllipsis = true
            };
            SmoothProgressBar bar = new SmoothProgressBar
            {
                Name = "taskBar",
                Left = 16,
                Top = 64,
                Width = Math.Max(220, row.Width - reservedRight - 18),
                Height = 10,
                BackColor = studioInline ? StudioRecordTableBack() : DialogFieldBack(),
                FillColor = Accent
            };
            Button cancel = MakeDialogButton(PortalText("取消", "Cancel"));
            Button resume = MakeDialogButton(PortalText("继续", "Resume"));
            Button pause = MakeDialogButton(PortalText("暂停", "Pause"));
            cancel.Name = "taskCancel";
            resume.Name = "taskResume";
            pause.Name = "taskPause";
            cancel.Width = resume.Width = pause.Width = buttonWidth;
            cancel.Height = resume.Height = pause.Height = 34;
            cancel.Left = row.Width - buttonWidth - 16;
            resume.Left = cancel.Left - buttonWidth - buttonGap;
            pause.Left = resume.Left - buttonWidth - buttonGap;
            cancel.Top = resume.Top = pause.Top = buttonTop;
            pause.Click += delegate { task.PauseEvent.Reset(); task.StateText = PortalText("已暂停", "Paused"); UpdateDownloadTaskRow(task, row); RenderActiveDownloads(); };
            resume.Click += delegate { task.PauseEvent.Set(); task.StateText = PortalText("下载中", "Downloading"); UpdateDownloadTaskRow(task, row); RenderActiveDownloads(); };
            cancel.Click += delegate { task.Cancel(); task.StateText = PortalText("正在取消", "Canceling"); UpdateDownloadTaskRow(task, row); RenderActiveDownloads(); };
            row.Resize += delegate
            {
                int rightSpace = (buttonWidth * 3) + (buttonGap * 2) + 26;
                label.Width = meta.Width = bar.Width = Math.Max(220, row.Width - rightSpace - 18);
                cancel.Left = row.Width - buttonWidth - 16;
                resume.Left = cancel.Left - buttonWidth - buttonGap;
                pause.Left = resume.Left - buttonWidth - buttonGap;
            };
            row.Controls.Add(label);
            row.Controls.Add(meta);
            row.Controls.Add(bar);
            row.Controls.Add(cancel);
            row.Controls.Add(resume);
            row.Controls.Add(pause);
            return row;
        }

        private void UpdateDownloadTaskRow(DownloadTask task, Panel row)
        {
            int percent = task.Total > 0 ? Math.Max(0, Math.Min(100, (int)(task.Received * 100L / task.Total))) : 0;
            Label label = row.Controls["taskFileLabel"] as Label;
            Label meta = row.Controls["taskMetaLabel"] as Label;
            SmoothProgressBar bar = row.Controls["taskBar"] as SmoothProgressBar;
            Button pause = row.Controls["taskPause"] as Button;
            Button resume = row.Controls["taskResume"] as Button;
            Button cancel = row.Controls["taskCancel"] as Button;
            if (label != null)
            {
                label.Text = task.FileName;
                if (topToolTip != null) topToolTip.SetToolTip(label, task.FileName);
            }
            if (meta != null)
            {
                meta.Text = task.StateText + "  " + (task.Total > 0 ? percent + "%" : "--") + "  " + FormatBytes(task.Received) + (task.Total > 0 ? " / " + FormatBytes(task.Total) : "") + "  " + FormatSpeed(task.SpeedBytesPerSecond);
            }
            if (bar != null)
            {
                bar.Value = percent;
                bar.FillColor = Accent;
                bar.BackColor = LightTheme ? Color.FromArgb(226, 236, 246) : Color.FromArgb(31, 45, 68);
            }
            bool paused = !task.PauseEvent.WaitOne(0);
            if (pause != null) pause.Enabled = !paused && !task.CancelRequested;
            if (resume != null) resume.Enabled = paused && !task.CancelRequested;
            if (cancel != null) cancel.Enabled = !task.CancelRequested;
            if (pause != null) pause.Invalidate();
            if (resume != null) resume.Invalidate();
            if (cancel != null) cancel.Invalidate();
        }

        private void FillDownloadRecords()
        {
            if (recordsList == null) return;
            recordsList.BeginUpdate();
            try
            {
                recordsList.Items.Clear();
                List<DownloadRecord> records = LoadDownloadRecords();
                foreach (DownloadRecord record in records)
                {
                    ListViewItem row = new ListViewItem(record.Time ?? "");
                    string resultText = record.Result ?? "";
                    if (portalVariant && portalEnglish)
                    {
                        string translatedResult = PortalKnownLabel(resultText);
                        if (!String.IsNullOrWhiteSpace(translatedResult)) resultText = translatedResult;
                    }
                    row.SubItems.Add(resultText);
                    row.SubItems.Add(record.Name ?? "");
                    row.SubItems.Add(record.SavedPath ?? "");
                    row.Tag = record;
                    row.ToolTipText = (record.Name ?? "") + Environment.NewLine + (record.SavedPath ?? "");
                    recordsList.Items.Add(row);
                }
                ResizeDownloadRecordColumns();
            }
            finally
            {
                recordsList.EndUpdate();
            }
        }

        private void ResizeDownloadRecordColumns()
        {
            if (recordsList == null || recordsList.Columns.Count < 4) return;
            int width = recordsList.ClientSize.Width;
            if (width <= 0) return;
            recordsList.Columns[0].Width = 122;
            recordsList.Columns[1].Width = 86;
            recordsList.Columns[2].Width = Math.Max(220, width - 122 - 86 - 170);
            recordsList.Columns[3].Width = Math.Max(170, width - recordsList.Columns[0].Width - recordsList.Columns[1].Width - recordsList.Columns[2].Width);
        }

        private static Color DialogBodyBack()
        {
            return LightTheme ? Color.FromArgb(255, 248, 252) : Color.FromArgb(18, 31, 47);
        }

        private static Color DialogCardBack()
        {
            return LightTheme ? Color.FromArgb(255, 244, 250) : Color.FromArgb(25, 41, 61);
        }

        private static Color DialogFieldBack()
        {
            return LightTheme ? Color.FromArgb(255, 252, 254) : Color.FromArgb(18, 31, 47);
        }

        private static Color DialogHeaderBack()
        {
            return LightTheme ? Color.FromArgb(247, 225, 237) : Color.FromArgb(27, 43, 63);
        }

        private static Color DialogRowBack(int index, bool selected)
        {
            if (selected) return LightTheme ? Color.FromArgb(232, 132, 180) : Color.FromArgb(37, 82, 112);
            if (LightTheme) return index % 2 == 0 ? Color.FromArgb(255, 250, 253) : Color.FromArgb(252, 239, 247);
            return index % 2 == 0 ? Color.FromArgb(18, 31, 47) : Color.FromArgb(21, 35, 52);
        }

        private static Color DialogSubText()
        {
            return LightTheme ? Color.FromArgb(116, 76, 96) : Color.FromArgb(190, 206, 222);
        }

        private static Color PortalFieldBack()
        {
            return LightTheme ? PanelBg2 : Blend(PanelBg, Color.Black, 0.08);
        }

        private static Color PortalHoverBack()
        {
            return LightTheme ? Blend(PanelBg2, Accent, 0.06) : Blend(PanelBg2, Color.White, 0.06);
        }

        private static Color PortalSoftAccentBack()
        {
            return LightTheme ? Blend(PanelBg2, Accent, 0.11) : Blend(PanelBg2, Accent, 0.18);
        }

        private static Color PortalRecordSurfaceBack()
        {
            return LightTheme ? PanelBg : Blend(PanelBg, Color.White, 0.03);
        }

        private static Color PortalRecordTableBack()
        {
            return LightTheme ? PanelBg2 : Blend(PanelBg, Color.Black, 0.08);
        }

        private static Color PortalRecordHeaderBack()
        {
            return LightTheme ? Blend(PanelBg2, Line, 0.16) : Blend(PanelBg2, Color.White, 0.05);
        }

        private static Color PortalRecordRowBack(int index, bool selected)
        {
            if (selected) return LightTheme ? Blend(Accent, Color.White, 0.38) : Blend(Accent, PanelBg, 0.30);
            Color even = PortalRecordTableBack();
            Color odd = LightTheme ? Blend(even, Line, 0.08) : Blend(even, Color.White, 0.035);
            return index % 2 == 0 ? even : odd;
        }

        private static Color Blend(Color a, Color b, double amount)
        {
            amount = Math.Max(0D, Math.Min(1D, amount));
            int r = (int)Math.Round(a.R + (b.R - a.R) * amount);
            int g = (int)Math.Round(a.G + (b.G - a.G) * amount);
            int bl = (int)Math.Round(a.B + (b.B - a.B) * amount);
            return Color.FromArgb(r, g, bl);
        }

        private static Color StudioRecordSurfaceBack()
        {
            return LightTheme ? PanelBg2 : Color.FromArgb(45, 56, 70);
        }

        private static Color StudioRecordCardBack()
        {
            return LightTheme ? Color.White : Color.FromArgb(39, 50, 63);
        }

        private static Color StudioRecordTableBack()
        {
            return LightTheme ? Color.FromArgb(248, 250, 252) : Color.FromArgb(31, 40, 52);
        }

        private static Color StudioRecordHeaderBack()
        {
            return LightTheme ? Color.FromArgb(241, 245, 249) : Color.FromArgb(40, 51, 64);
        }

        private static Color StudioRecordRowBack(int index, bool selected)
        {
            if (selected) return LightTheme ? Color.FromArgb(219, 234, 254) : Color.FromArgb(47, 95, 126);
            if (LightTheme) return index % 2 == 0 ? Color.White : Color.FromArgb(248, 250, 252);
            return index % 2 == 0 ? Color.FromArgb(31, 40, 52) : Color.FromArgb(34, 44, 56);
        }

        private static Color StudioRecordIconBack()
        {
            return LightTheme ? Color.FromArgb(232, 242, 255) : Color.FromArgb(43, 58, 72);
        }

        private bool IsStudioDownloadRecordsList(object sender)
        {
            ListView list = sender as ListView;
            return studioVariant && list != null && String.Equals(Convert.ToString(list.Tag), StudioRecordsListTag, StringComparison.Ordinal);
        }

        private bool IsStudioActiveDownloadsList(Control control)
        {
            return studioVariant && control != null && String.Equals(Convert.ToString(control.Tag), StudioActiveDownloadsTag, StringComparison.Ordinal);
        }

        private bool IsPortalDownloadRecordsList(object sender)
        {
            ListView list = sender as ListView;
            return portalVariant && list != null && String.Equals(Convert.ToString(list.Tag), PortalRecordsListTag, StringComparison.Ordinal);
        }

        private bool IsPortalActiveDownloadsList(Control control)
        {
            return portalVariant && control != null && String.Equals(Convert.ToString(control.Tag), PortalActiveDownloadsTag, StringComparison.Ordinal);
        }

        private EmptyStateLabel CreateDownloadEmptyState(int width, int height, string text, bool studioInline)
        {
            EmptyStateLabel label = new EmptyStateLabel
            {
                Width = width,
                Height = height,
                Text = text,
                ForeColor = Muted
            };
            if (studioInline)
            {
                label.UseCustomColors = true;
                label.DrawCard = false;
                label.FillColor = StudioRecordCardBack();
                label.BorderColor = Color.FromArgb(LightTheme ? 68 : 56, Line);
                label.IconBackColor = StudioRecordIconBack();
            }
            return label;
        }

        private void DrawDownloadRecordHeader(object sender, DrawListViewColumnHeaderEventArgs e)
        {
            bool studioRecords = IsStudioDownloadRecordsList(sender);
            bool portalRecords = IsPortalDownloadRecordsList(sender);
            Color headerBack = studioRecords ? StudioRecordHeaderBack() : (portalRecords ? PortalRecordHeaderBack() : DialogHeaderBack());
            ListView list = sender as ListView;
            if (e.ColumnIndex == 0 && list != null)
            {
                using (SolidBrush bg = new SolidBrush(headerBack))
                {
                    e.Graphics.FillRectangle(bg, new Rectangle(0, e.Bounds.Top, list.ClientSize.Width, e.Bounds.Height));
                }
            }
            using (SolidBrush bg = new SolidBrush(headerBack))
            using (Pen border = new Pen(Color.FromArgb(78, Line)))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
                e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
                if (e.ColumnIndex > 0) e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Top + 6, e.Bounds.Left, e.Bounds.Bottom - 6);
            }
            Rectangle textRect = new Rectangle(e.Bounds.Left + 10, e.Bounds.Top, e.Bounds.Width - 18, e.Bounds.Height);
            using (Font headerFont = new Font(Font.FontFamily, 9F, FontStyle.Bold))
            {
                TextRenderer.DrawText(e.Graphics, e.Header.Text, headerFont, textRect, TextColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private void DrawDownloadRecordItem(object sender, DrawListViewItemEventArgs e)
        {
        }

        private void DrawDownloadRecordSubItem(object sender, DrawListViewSubItemEventArgs e)
        {
            bool selected = e.Item.Selected;
            bool studioRecords = IsStudioDownloadRecordsList(sender);
            bool portalRecords = IsPortalDownloadRecordsList(sender);
            Color rowBack = studioRecords ? StudioRecordRowBack(e.ItemIndex, selected) : (portalRecords ? PortalRecordRowBack(e.ItemIndex, selected) : DialogRowBack(e.ItemIndex, selected));
            using (SolidBrush bg = new SolidBrush(rowBack))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
            }
            using (Pen line = new Pen(Color.FromArgb(50, Line)))
            {
                e.Graphics.DrawLine(line, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
            }
            Color text = selected ? Color.White : (e.ColumnIndex == 1 ? Accent : TextColor);
            Rectangle textRect = new Rectangle(e.Bounds.Left + 10, e.Bounds.Top + 1, e.Bounds.Width - 16, e.Bounds.Height - 2);
            TextRenderer.DrawText(e.Graphics, e.SubItem.Text, Font, textRect, text, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private void DrawDarkComboItem(object sender, DrawItemEventArgs e)
        {
            ComboBox combo = sender as ComboBox;
            if (combo == null || e.Index < 0) return;
            bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
            Color back = selected ? (LightTheme ? Color.FromArgb(232, 132, 180) : Color.FromArgb(39, 84, 112)) : DialogFieldBack();
            using (SolidBrush bg = new SolidBrush(back))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
            }
            string text = Convert.ToString(combo.Items[e.Index]);
            TextRenderer.DrawText(e.Graphics, text, combo.Font, new Rectangle(e.Bounds.Left + 8, e.Bounds.Top, e.Bounds.Width - 12, e.Bounds.Height), selected ? Color.White : TextColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private void DrawPortalComboItem(object sender, DrawItemEventArgs e)
        {
            ComboBox combo = sender as ComboBox;
            if (combo == null || e.Index < 0) return;
            bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
            Color back = selected ? PortalSoftAccentBack() : PortalFieldBack();
            using (SolidBrush bg = new SolidBrush(back))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
            }
            string text = Convert.ToString(combo.Items[e.Index]);
            Color fore = selected ? Accent : TextColor;
            TextRenderer.DrawText(e.Graphics, text, combo.Font, new Rectangle(e.Bounds.Left + 8, e.Bounds.Top, e.Bounds.Width - 12, e.Bounds.Height), fore, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private void OpenSelectedRecordFile()
        {
            DownloadRecord record = SelectedDownloadRecord(recordsList);
            if (record == null || String.IsNullOrWhiteSpace(record.SavedPath))
            {
                DownloadTask task = FirstActiveDownloadTask();
                if (task == null) return;
                if (!File.Exists(task.Path))
                {
                    MessageBox.Show("文件还在下载中，下载完成后再打开。", "下载记录", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Process.Start(new ProcessStartInfo(task.Path) { UseShellExecute = true });
                return;
            }
            if (!File.Exists(record.SavedPath)) return;
            Process.Start(new ProcessStartInfo(record.SavedPath) { UseShellExecute = true });
        }

        private void OpenSelectedRecordFolder()
        {
            DownloadRecord record = SelectedDownloadRecord(recordsList);
            string filePath = record == null ? "" : record.SavedPath;
            if (String.IsNullOrWhiteSpace(filePath))
            {
                DownloadTask task = FirstActiveDownloadTask();
                if (task == null) return;
                filePath = task.Path;
            }
            if (File.Exists(filePath))
            {
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + filePath + "\"") { UseShellExecute = true });
                return;
            }
            string folder = Path.GetDirectoryName(filePath);
            if (!String.IsNullOrWhiteSpace(folder) && Directory.Exists(folder))
            {
                Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
            }
        }

        private void ClearDownloadRecords()
        {
            if (MessageBox.Show(PortalText("确定清空下载记录吗？", "Clear download records?"), PortalText("下载记录", "Download Records"), MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            try
            {
                string path = DownloadRecordsPath();
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
            }
            FillDownloadRecords();
        }

        private void DeleteSelectedDownloadRecords()
        {
            if (recordsList == null || recordsList.SelectedItems.Count == 0)
            {
                MessageBox.Show(PortalText("请先选择要删除的下载记录。", "Please select a download record first."), PortalText("下载记录", "Download Records"), MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            int selectedCount = recordsList.SelectedItems.Count;
            if (MessageBox.Show(PortalText("确定删除选中的 " + selectedCount + " 条下载文件并同时删除下载记录吗？", "Delete the selected " + selectedCount + " downloaded file(s) and their records?"), PortalText("下载记录", "Download Records"), MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            int deletedFiles = 0;
            HashSet<string> selected = new HashSet<string>();
            foreach (ListViewItem item in recordsList.SelectedItems)
            {
                DownloadRecord record = item.Tag as DownloadRecord;
                if (record != null) selected.Add((record.Time ?? "") + "|" + (record.Name ?? "") + "|" + (record.SavedPath ?? ""));
                if (DeleteDownloadedFile(record)) deletedFiles++;
            }

            List<DownloadRecord> records = LoadDownloadRecords();
            records.RemoveAll(delegate (DownloadRecord record)
            {
                return selected.Contains((record.Time ?? "") + "|" + (record.Name ?? "") + "|" + (record.SavedPath ?? ""));
            });
            SaveDownloadRecords(records);
            FillDownloadRecords();
            if (currentPage.Equals("settings", StringComparison.OrdinalIgnoreCase) && studioVariant) RenderStudioSettingsPage();
            if (currentPage.Equals("downloads", StringComparison.OrdinalIgnoreCase) && portalVariant) RenderPortalDownloadsPage();
            status.Text = PortalText("已删除所选下载文件 " + deletedFiles + " 个，并删除对应记录", "Deleted " + deletedFiles + " selected downloaded file(s) and their records");
            MessageBox.Show(PortalText("删除完毕。", "Done."), PortalText("下载记录", "Download Records"), MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private bool DeleteDownloadedFile(DownloadRecord record)
        {
            try
            {
                if (record == null || String.IsNullOrWhiteSpace(record.SavedPath)) return false;
                if (!File.Exists(record.SavedPath)) return false;
                File.Delete(record.SavedPath);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void ShowClientSettings()
        {
            if (settingsPanel == null) BuildSettingsPanel();
            FillSettingsPanel();
            settingsPanel.Visible = !settingsPanel.Visible;
            if (settingsPanel.Visible)
            {
                if (recordsPanel != null) recordsPanel.Visible = false;
                settingsPanel.BringToFront();
            }
        }

        private void BuildSettingsPanel()
        {
            settingsPanel = new PopupPanel
            {
                Width = 650,
                Height = 430,
                Visible = false,
                BackColor = PanelBg,
                Padding = new Padding(18),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            Controls.Add(settingsPanel);
            PositionSettingsPanel();
            Resize += delegate { PositionSettingsPanel(); };
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            CleanupDownloadedFilesOnExit();
            base.OnFormClosing(e);
        }

        private void PositionSettingsPanel()
        {
            if (settingsPanel == null) return;
            settingsPanel.Left = Math.Max(12, ClientSize.Width - settingsPanel.Width - 22);
            settingsPanel.Top = 84;
        }

        private void FillSettingsPanel()
        {
            Dictionary<string, object> app = AsDict(Get(config, "app"));
            ClientSettings currentSettings = LoadClientSettings();
            settingsPanel.Controls.Clear();
            settingsPanel.BackColor = DialogBodyBack();

            Button close = MakeCloseButton();
            close.Text = "×";
            close.Left = settingsPanel.Width - 52;
            close.Top = 16;
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            close.Click += delegate { settingsPanel.Visible = false; };

            Label caption = new Label { Left = 24, Top = 20, Width = 560, Height = 28, Text = "工具箱设置", ForeColor = TextColor, Font = new Font(Font.FontFamily, 12F, FontStyle.Bold), BackColor = Color.Transparent };

            Color cardBack = DialogCardBack();
            Color fieldBack = DialogFieldBack();
            Color labelColor = DialogSubText();

            RoundedPanel pathCard = new RoundedPanel
            {
                Left = 22,
                Top = 62,
                Width = 590,
                Height = 96,
                Radius = 14,
                BackColor = cardBack,
                BorderColor = Color.FromArgb(70, Line)
            };
            Label label = new Label { Left = 16, Top = 12, Width = 540, Height = 22, Text = "软件下载保存路径", ForeColor = labelColor, BackColor = Color.Transparent };
            TextBox pathBox = new TextBox
            {
                Left = 18,
                Top = 48,
                Width = 454,
                Height = 28,
                Text = GetDownloadDirectory(),
                BackColor = fieldBack,
                ForeColor = TextColor,
                BorderStyle = BorderStyle.FixedSingle
            };
            Button browse = MakeDialogButton("选择");
            browse.Left = 486;
            browse.Top = 45;
            browse.Width = 82;

            RoundedPanel optionCard = new RoundedPanel
            {
                Left = 22,
                Top = 172,
                Width = 590,
                Height = 78,
                Radius = 14,
                BackColor = cardBack,
                BorderColor = Color.FromArgb(70, Line)
            };
            Label optionLabel = new Label
            {
                Left = 16,
                Top = 12,
                Width = 540,
                Height = 22,
                Text = "启动与清理",
                ForeColor = labelColor,
                BackColor = Color.Transparent
            };
            CheckBox autoStart = new FlatCheckBox
            {
                Left = 16,
                Top = 42,
                Width = 250,
                Height = 26,
                Text = "开机自动启动工具箱",
                ForeColor = TextColor,
                BackColor = optionCard.BackColor,
                Checked = currentSettings.AutoStart || IsAutoStartEnabled()
            };
            CheckBox cleanOnExit = new FlatCheckBox
            {
                Left = 292,
                Top = 42,
                Width = 280,
                Height = 26,
                Text = "关闭时自动删除已下载文件",
                ForeColor = TextColor,
                BackColor = optionCard.BackColor,
                Checked = currentSettings.DeleteDownloadsOnExit
            };

            FlowLayoutPanel actions = new FlowLayoutPanel
            {
                Left = 22,
                Top = 270,
                Width = 590,
                Height = 42,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                BackColor = Color.Transparent,
                Padding = new Padding(0, 2, 0, 0)
            };
            Button records = MakeDialogButton("下载记录");
            Button openFolder = MakeDialogButton("打开目录");
            actions.Controls.Add(records);
            actions.Controls.Add(openFolder);

            browse.Click += delegate
            {
                using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                {
                    folderDialog.Description = "选择软件下载保存路径";
                    string selected = Environment.ExpandEnvironmentVariables(pathBox.Text.Trim());
                    folderDialog.SelectedPath = Directory.Exists(selected) ? selected : GetDownloadDirectory();
                    if (folderDialog.ShowDialog(this) == DialogResult.OK)
                    {
                        pathBox.Text = folderDialog.SelectedPath;
                        SaveDownloadDirectory(folderDialog.SelectedPath, currentSettings);
                    }
                }
            };
            pathBox.Leave += delegate
            {
                SaveDownloadDirectory(pathBox.Text, currentSettings);
                pathBox.Text = GetDownloadDirectory();
            };
            records.Click += delegate { ShowDownloadRecordsPanel(); };
            openFolder.Click += delegate
            {
                string dir = GetDownloadDirectory();
                try
                {
                    Directory.CreateDirectory(dir);
                    Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    MessageBox.Show("打开目录失败：" + ex.Message, "工具箱设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            };
            autoStart.CheckedChanged += delegate
            {
                currentSettings.AutoStart = autoStart.Checked;
                SaveClientSettings(currentSettings);
                SetAutoStart(autoStart.Checked);
                status.Text = autoStart.Checked ? "已开启开机自启" : "已关闭开机自启";
            };
            cleanOnExit.CheckedChanged += delegate
            {
                currentSettings.DeleteDownloadsOnExit = cleanOnExit.Checked;
                SaveClientSettings(currentSettings);
                status.Text = cleanOnExit.Checked ? "关闭时将自动删除已下载文件" : "已关闭退出自动清理";
            };

            pathCard.Controls.Add(label);
            pathCard.Controls.Add(pathBox);
            pathCard.Controls.Add(browse);
            optionCard.Controls.Add(optionLabel);
            optionCard.Controls.Add(autoStart);
            optionCard.Controls.Add(cleanOnExit);
            settingsPanel.Controls.Add(caption);
            settingsPanel.Controls.Add(close);
            settingsPanel.Controls.Add(pathCard);
            settingsPanel.Controls.Add(optionCard);
            settingsPanel.Controls.Add(actions);
            close.BringToFront();
        }

        private void SaveDownloadDirectory(string dir, ClientSettings settings)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(dir) || IsLegacyDownloadsDirectory(dir)) dir = DefaultDownloadDirectory();
                dir = Environment.ExpandEnvironmentVariables(dir.Trim());
                Directory.CreateDirectory(dir);
                settings.DownloadDirectory = dir;
                SaveClientSettings(settings);
                status.Text = "下载路径已保存：" + dir;
            }
            catch (Exception ex)
            {
                MessageBox.Show("保存下载路径失败：" + ex.Message, "工具箱设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private string AutoStartName()
        {
            string name = GetText(AsDict(Get(config, "app")), "title", "ToolboxClient");
            foreach (char c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return "ToolboxClient-" + ClientKey() + "-" + name;
        }

        private bool IsAutoStartEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    return key != null && key.GetValue(AutoStartName()) != null;
                }
            }
            catch
            {
                return false;
            }
        }

        private void SetAutoStart(bool enabled)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                {
                    if (key == null) return;
                    string name = AutoStartName();
                    if (enabled) key.SetValue(name, "\"" + Application.ExecutablePath + "\"");
                    else key.DeleteValue(name, false);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("设置开机自启失败：" + ex.Message, "工具箱设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void CleanupDownloadedFilesOnExit()
        {
            ClientSettings settings = LoadClientSettings();
            if (!settings.DeleteDownloadsOnExit) return;
            List<DownloadRecord> records = LoadDownloadRecords();
            foreach (DownloadRecord record in records) DeleteDownloadedFile(record);
            SaveDownloadRecords(new List<DownloadRecord>());
        }

        private Button MakeCloseButton()
        {
            RoundButton button = new RoundButton();
            button.Width = 34;
            button.Height = 30;
            button.Radius = 12;
            button.Text = "×";
            button.BackColor = LightTheme ? DialogFieldBack() : Color.FromArgb(30, 47, 68);
            button.ForeColor = TextColor;
            button.BorderColor = Color.FromArgb(LightTheme ? 85 : 90, Line);
            button.HoverBackColor = LightTheme ? Color.FromArgb(235, 247, 254) : Color.FromArgb(47, 75, 101);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.UseVisualStyleBackColor = false;
            return button;
        }

        private Button MakeDialogButton(string text)
        {
            Color buttonBack = LightTheme ? PanelBg2 : Color.FromArgb(35, 53, 74);
            Color buttonText = LightTheme ? TextColor : TextColor;
            Color border = LightTheme ? Color.FromArgb(
                Math.Max(0, Accent.R - 15),
                Math.Max(0, Accent.G - 10),
                Math.Max(0, Accent.B - 5)) : Line;
            RoundButton button = new RoundButton
            {
                Width = text.Length > 3 ? 92 : 72,
                Height = 34,
                Margin = new Padding(8, 0, 0, 0),
                Text = text,
                FlatStyle = FlatStyle.Flat,
                BackColor = buttonBack,
                ForeColor = buttonText,
                UseVisualStyleBackColor = false,
                BorderColor = Color.FromArgb(LightTheme ? 105 : 95, border),
                HoverBackColor = LightTheme ? Color.FromArgb(235, 247, 254) : Color.FromArgb(44, 84, 112),
                Radius = 13
            };
            button.FlatAppearance.BorderSize = 0;
            return button;
        }

        private static Color EffectiveBackColor(Control control)
        {
            Control current = control;
            while (current != null)
            {
                Color color = current.BackColor;
                if (color != Color.Transparent && color.A > 0) return color;
                current = current.Parent;
            }
            return SystemColors.Control;
        }

        private static GraphicsPath UiRoundRect(Rectangle rect, int radius)
        {
            int d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static void EnsureRoundedRegion(Control control, int radius, ref Size regionSize, ref int regionRadius)
        {
            if (control.Width <= 0 || control.Height <= 0) return;
            Size size = control.ClientSize;
            if (control.Region != null && regionSize == size && regionRadius == radius) return;
            Rectangle rect = new Rectangle(0, 0, control.Width - 1, control.Height - 1);
            using (GraphicsPath path = UiRoundRect(rect, radius))
            {
                Region old = control.Region;
                control.Region = new Region(path);
                if (old != null) old.Dispose();
            }
            regionSize = size;
            regionRadius = radius;
        }

        private static DownloadRecord SelectedDownloadRecord(ListView list)
        {
            if (list == null) return null;
            if (list.SelectedItems.Count == 0) return null;
            return list.SelectedItems[0].Tag as DownloadRecord;
        }

        private DownloadTask FirstActiveDownloadTask()
        {
            lock (activeDownloadsLock)
            {
                return activeDownloads.Count == 0 ? null : activeDownloads[0];
            }
        }

        private static string CleanDownloadError(string message)
        {
            if (message.IndexOf("SSL", StringComparison.OrdinalIgnoreCase) >= 0 || message.IndexOf("TLS", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "资源站 HTTPS 握手失败，已启用 TLS 1.2 后仍未连接成功。";
            }
            return message;
        }

        private static string FormatBytes(long bytes)
        {
            double value = bytes;
            string[] units = new string[] { "B", "KB", "MB", "GB" };
            int unit = 0;
            while (value >= 1024 && unit < units.Length - 1)
            {
                value /= 1024;
                unit++;
            }
            return value.ToString(unit == 0 ? "0" : "0.0") + units[unit];
        }

        private static string FormatSpeed(double bytesPerSecond)
        {
            if (bytesPerSecond <= 0) return "--/s";
            return FormatBytes((long)bytesPerSecond) + "/s";
        }

        private bool PromptPassword(string stored)
        {
            while (true)
            {
                using (PasswordDialog dialog = new PasswordDialog())
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK) return false;
                    if (VerifyPassword(dialog.Password, stored)) return true;
                    MessageBox.Show("密码不正确。", "工具箱", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        private bool VerifyPassword(string password, string stored)
        {
            if (!stored.StartsWith("sha256$", StringComparison.OrdinalIgnoreCase)) return password == stored;
            string[] parts = stored.Split(new char[] { '$' });
            if (parts.Length != 3) return false;
            return Sha256Hex(parts[1] + password).Equals(parts[2], StringComparison.OrdinalIgnoreCase);
        }

        private string DownloadText(string url)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 10000;
            request.ReadWriteTimeout = 10000;
            request.UserAgent = "ToolboxClient";
            request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
            request.Headers[HttpRequestHeader.CacheControl] = "no-cache, no-store, must-revalidate";
            request.Headers[HttpRequestHeader.Pragma] = "no-cache";
            request.Headers[HttpRequestHeader.Expires] = "0";
            ApplyIntegrityHeaders(request);
            using (WebResponse response = request.GetResponse())
            using (Stream stream = response.GetResponseStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private string RuntimeExecutableSha256()
        {
            if (String.IsNullOrWhiteSpace(runtimeExecutableSha256))
            {
                runtimeExecutableSha256 = CurrentExecutableSha256();
            }
            return runtimeExecutableSha256;
        }

        private void ApplyIntegrityHeaders(HttpWebRequest request)
        {
            try
            {
                request.Headers["X-Client-Api-Key"] = ApiKeyFromConfigUrl();
                if (!String.IsNullOrWhiteSpace(runtimeIntegrityToken)) request.Headers["X-Client-Integrity"] = runtimeIntegrityToken;
                request.Headers["X-Client-Build-Id"] = Program.BuildId;
                request.Headers["X-Client-Build-Stamp"] = Program.BuildStamp;
                request.Headers["X-Client-Integrity-Seed"] = Program.IntegritySeed;
                request.Headers["X-Client-Build-Signature"] = Program.BuildSignature;
                request.Headers["X-Client-Exe-Sha256"] = RuntimeExecutableSha256();
            }
            catch
            {
            }
        }
        private void EnsureRuntimeIntegrity()
        {
            if (runtimeIntegrityChecked && !String.IsNullOrWhiteSpace(runtimeIntegrityToken) && runtimeIntegrityExpiresAt > DateTime.UtcNow) return;
            lock (this)
            {
                if (runtimeIntegrityChecked && !String.IsNullOrWhiteSpace(runtimeIntegrityToken) && runtimeIntegrityExpiresAt > DateTime.UtcNow) return;
                if (runtimeIntegrityChecked && runtimeIntegrityExpiresAt <= DateTime.UtcNow)
                {
                    runtimeIntegrityChecked = false;
                    runtimeIntegrityToken = "";
                    runtimeIntegrityExpiresAt = DateTime.MinValue;
                }
                if (String.IsNullOrWhiteSpace(Program.BuildId) || Program.BuildId.StartsWith("__", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("工具箱编译信息缺失，请从后台重新下载最新版。");
                }
                string apiKey = ApiKeyFromConfigUrl();
                string exeHash = RuntimeExecutableSha256();
                string json = serializer.Serialize(new Dictionary<string, object>
                {
                    { "apiKey", apiKey },
                    { "buildId", Program.BuildId },
                    { "buildStamp", Program.BuildStamp },
                    { "integritySeed", Program.IntegritySeed },
                    { "buildSignature", Program.BuildSignature },
                    { "exeSha256", exeHash }
                });
                string response = PostJson(VerifyBuildUrl(), json);
                Dictionary<string, object> dict = AsDict(serializer.DeserializeObject(response));
                if (dict.ContainsKey("error"))
                {
                    runtimeIntegrityError = GetText(dict, "error", "工具箱编译校验失败，请从后台重新下载最新版。");
                    throw new InvalidOperationException(runtimeIntegrityError);
                }
                string token = GetText(dict, "runtimeToken", "");
                if (String.IsNullOrWhiteSpace(token))
                {
                    runtimeIntegrityError = "工具箱编译校验未返回有效凭证，请重新下载。";
                    throw new InvalidOperationException(runtimeIntegrityError);
                }
                runtimeIntegrityToken = token;
                runtimeIntegrityExpiresAt = DateTime.UtcNow.AddSeconds(Math.Max(60, IntValue(dict, "expiresIn", 86400)));
                runtimeIntegrityChecked = true;
                runtimeIntegrityError = "";
            }
        }

        private void TryEnsureRuntimeIntegrity()
        {
            try
            {
                EnsureRuntimeIntegrity();
            }
            catch
            {
                runtimeIntegrityChecked = false;
                runtimeIntegrityToken = "";
                runtimeIntegrityExpiresAt = DateTime.MinValue;
            }
        }

        private bool IsIntegrityFailure(Exception ex)
        {
            string message = (ex == null ? "" : ex.Message) ?? "";
            return message.IndexOf("编译校验", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   message.IndexOf("对接密钥无效", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   message.IndexOf("文件已被修改", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   message.IndexOf("校验失败", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   message.IndexOf("重新下载", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   message.IndexOf("已被管理员停用", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private string VerifyBuildUrl()
        {
            Uri uri = new Uri(configUrl);
            return uri.GetLeftPart(UriPartial.Authority) + "/api/toolbox/verify-build";
        }

        private string ApiKeyFromConfigUrl()
        {
            Uri uri = new Uri(configUrl);
            string query = uri.Query;
            if (query.StartsWith("?")) query = query.Substring(1);
            foreach (string part in query.Split(new char[] { '&' }))
            {
                if (String.IsNullOrWhiteSpace(part)) continue;
                string[] kv = part.Split(new char[] { '=' }, 2);
                string key = Uri.UnescapeDataString(kv[0] ?? "");
                if (key.Equals("key", StringComparison.OrdinalIgnoreCase))
                {
                    return kv.Length > 1 ? Uri.UnescapeDataString(kv[1] ?? "") : "";
                }
            }
            return "";
        }

        private string WithRuntimeToken(string url)
        {
            if (String.IsNullOrWhiteSpace(runtimeIntegrityToken)) return url;
            return url + (url.IndexOf("?") >= 0 ? "&" : "?") + "runtimeToken=" + Uri.EscapeDataString(runtimeIntegrityToken);
        }
        private string PostJson(string url, string json)
        {
            byte[] payload = Encoding.UTF8.GetBytes(json ?? "{}");
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "POST";
            request.Timeout = 10000;
            request.ReadWriteTimeout = 10000;
            request.UserAgent = "ToolboxClient";
            request.ContentType = "application/json; charset=utf-8";
            request.ContentLength = payload.Length;
            request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
            ApplyIntegrityHeaders(request);
            using (Stream stream = request.GetRequestStream())
            {
                stream.Write(payload, 0, payload.Length);
            }
            try
            {
                using (WebResponse response = request.GetResponse())
                using (Stream stream = response.GetResponseStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
                {
                    return reader.ReadToEnd();
                }
            }
            catch (WebException ex)
            {
                if (ex.Response != null)
                {
                    using (WebResponse response = ex.Response)
                    using (Stream stream = response.GetResponseStream())
                    using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
                    {
                        string errorJson = reader.ReadToEnd();
                        if (!String.IsNullOrWhiteSpace(errorJson)) return errorJson;
                    }
                }
                throw;
            }
        }

        private static string CurrentExecutableSha256()
        {
            string path = Assembly.GetExecutingAssembly().Location;
            using (FileStream stream = File.OpenRead(path))
            using (SHA256 sha = SHA256.Create())
            {
                byte[] bytes = sha.ComputeHash(stream);
                StringBuilder sb = new StringBuilder(bytes.Length * 2);
                foreach (byte b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private string PopupConfigUrl()
        {
            try
            {
                Uri uri = new Uri(configUrl);
                string apiKey = Uri.EscapeDataString(ApiKeyFromConfigUrl());
                return uri.GetLeftPart(UriPartial.Authority) + "/api/toolbox/popup-config?key=" + apiKey;
            }
            catch
            {
                return "";
            }
        }

        private string PopupCachePath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ToolboxClient");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, Sha256Hex(PopupConfigUrl()) + ".popup.json");
        }

        private void LoadPopupConfigAsync(bool force)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    ContactPopupConfig cached = ReadPopupConfigCache();
                    if (cached != null && !force)
                    {
                        TimeSpan age = DateTime.Now - popupCacheLoadedAt;
                        int cacheMinutes = cached.CacheMinutes > 0 ? cached.CacheMinutes : PopupDefaultCacheMinutes;
                        BeginInvoke(new Action(delegate { popupConfig = cached; }));
                        if (age.TotalMinutes < cacheMinutes) return;
                    }
                    string url = PopupConfigUrl();
                    if (String.IsNullOrWhiteSpace(url)) return;
                    if (!runtimeIntegrityChecked) TryEnsureRuntimeIntegrity();
                    string json = DownloadText(WithRuntimeToken(url + (url.IndexOf("?") >= 0 ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks));
                    ContactPopupConfig parsed = ParsePopupConfig(json);
                    SavePopupConfigCache(json);
                    BeginInvoke(new Action(delegate { popupConfig = parsed; }));
                }
                catch
                {
                    ContactPopupConfig cached = ReadPopupConfigCache();
                    if (cached != null)
                    {
                        try { BeginInvoke(new Action(delegate { popupConfig = cached; })); } catch { }
                    }
                }
            });
        }

        private ContactPopupConfig LoadPopupConfigNow(bool force)
        {
            try
            {
                ContactPopupConfig cached = ReadPopupConfigCache();
                if (cached != null && !force)
                {
                    TimeSpan age = DateTime.Now - popupCacheLoadedAt;
                    int cacheMinutes = cached.CacheMinutes > 0 ? cached.CacheMinutes : PopupDefaultCacheMinutes;
                    popupConfig = cached;
                    if (age.TotalMinutes < cacheMinutes) return cached;
                }
                string url = PopupConfigUrl();
                if (String.IsNullOrWhiteSpace(url)) return cached;
                if (!runtimeIntegrityChecked) TryEnsureRuntimeIntegrity();
                string json = DownloadText(WithRuntimeToken(url + (url.IndexOf("?") >= 0 ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks + "&r=" + Guid.NewGuid().ToString("N")));
                ContactPopupConfig parsed = ParsePopupConfig(json);
                SavePopupConfigCache(json);
                popupConfig = parsed;
                return parsed;
            }
            catch
            {
                ContactPopupConfig cached = ReadPopupConfigCache();
                if (cached != null) popupConfig = cached;
                return cached;
            }
        }

        private ContactPopupConfig ReadPopupConfigCache()
        {
            try
            {
                string path = PopupCachePath();
                if (!File.Exists(path)) return null;
                popupCacheLoadedAt = File.GetLastWriteTime(path);
                return ParsePopupConfig(File.ReadAllText(path, Encoding.UTF8));
            }
            catch
            {
                return null;
            }
        }

        private void SavePopupConfigCache(string json)
        {
            try
            {
                File.WriteAllText(PopupCachePath(), json, Encoding.UTF8);
                popupCacheLoadedAt = DateTime.Now;
            }
            catch
            {
            }
        }

        private ContactPopupConfig ParsePopupConfig(string json)
        {
            object parsed = serializer.DeserializeObject(json);
            Dictionary<string, object> dict = AsDict(parsed);
            ContactPopupConfig cfg = new ContactPopupConfig();
            cfg.Enabled = BoolValue(dict, "enabled", false);
            cfg.ClickCount = Math.Max(1, IntValue(dict, "clickCount", 3));
            cfg.Title = GetText(dict, "title", "联系我们 / 支持作者");
            cfg.ThanksText = GetText(dict, "thanksText", "");
            cfg.CacheMinutes = Math.Max(0, IntValue(dict, "cacheMinutes", PopupDefaultCacheMinutes));
            cfg.Contacts = ParsePopupQrItems(Get(dict, "contacts"));
            cfg.Payments = ParsePopupQrItems(Get(dict, "payments"));
            cfg.Links = ParsePopupLinks(Get(dict, "links"));
            return cfg;
        }

        private List<ContactPopupItem> ParsePopupQrItems(object value)
        {
            List<ContactPopupItem> rows = new List<ContactPopupItem>();
            foreach (object itemObj in AsList(value))
            {
                Dictionary<string, object> item = AsDict(itemObj);
                if (!BoolValue(item, "enabled", true)) continue;
                ContactPopupItem row = new ContactPopupItem();
                row.Title = GetText(item, "title", "");
                row.Description = GetText(item, "description", "");
                row.Image = GetText(item, "image", "");
                row.ButtonText = GetText(item, "buttonText", "");
                row.ButtonUrl = GetText(item, "buttonUrl", "");
                row.Sort = IntValue(item, "sort", rows.Count + 1);
                rows.Add(row);
            }
            rows.Sort(delegate(ContactPopupItem a, ContactPopupItem b)
            {
                int result = a.Sort.CompareTo(b.Sort);
                return result != 0 ? result : String.Compare(a.Title, b.Title, StringComparison.CurrentCultureIgnoreCase);
            });
            return rows;
        }

        private List<ContactPopupLink> ParsePopupLinks(object value)
        {
            List<ContactPopupLink> rows = new List<ContactPopupLink>();
            foreach (object itemObj in AsList(value))
            {
                Dictionary<string, object> item = AsDict(itemObj);
                if (!BoolValue(item, "enabled", true)) continue;
                string url = GetText(item, "url", "");
                if (!IsHttpUrl(url)) continue;
                ContactPopupLink row = new ContactPopupLink();
                row.Title = GetText(item, "title", "");
                row.Description = GetText(item, "description", "");
                row.Url = url;
                row.ButtonText = GetText(item, "buttonText", "打开链接");
                row.Sort = IntValue(item, "sort", rows.Count + 1);
                rows.Add(row);
            }
            rows.Sort(delegate(ContactPopupLink a, ContactPopupLink b)
            {
                int result = a.Sort.CompareTo(b.Sort);
                return result != 0 ? result : String.Compare(a.Title, b.Title, StringComparison.CurrentCultureIgnoreCase);
            });
            return rows;
        }

        private static bool IsHttpUrl(string value)
        {
            return !String.IsNullOrWhiteSpace(value) &&
                   (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                    value.StartsWith("https://", StringComparison.OrdinalIgnoreCase));
        }

        private void EnsureConfigResponse(string json)
        {
            object parsed = serializer.DeserializeObject(json);
            Dictionary<string, object> dict = AsDict(parsed);
            if (dict.ContainsKey("error"))
            {
                throw new InvalidOperationException(GetText(dict, "error", "工具箱授权校验失败。"));
            }
            if (!dict.ContainsKey("app") && !dict.ContainsKey("pages") && !dict.ContainsKey("toolbox_tabs"))
            {
                throw new InvalidOperationException("后台返回的配置不完整。");
            }
        }

        private string CachePath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ToolboxClient");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, Sha256Hex(configUrl) + ".json");
        }

        private void SaveCache(string json)
        {
            File.WriteAllText(CachePath(), StripPasswordFromCachedConfig(json), Encoding.UTF8);
        }

        private string ReadCache()
        {
            string path = CachePath();
            return File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8) : null;
        }

        private string StripPasswordFromCachedConfig(string json)
        {
            if (String.IsNullOrWhiteSpace(json)) return json;
            try
            {
                object parsed = serializer.DeserializeObject(json);
                Dictionary<string, object> dict = AsDict(parsed);
                Dictionary<string, object> app = AsDict(Get(dict, "app"));
                if (app.ContainsKey("password")) app["password"] = "";
                return serializer.Serialize(dict);
            }
            catch
            {
                return json;
            }
        }

        private static object Get(Dictionary<string, object> dict, string key)
        {
            object value;
            return dict != null && dict.TryGetValue(key, out value) ? value : null;
        }

        private static bool Has(Dictionary<string, object> dict, string key)
        {
            return dict != null && dict.ContainsKey(key);
        }

        private static Dictionary<string, object> AsDict(object value)
        {
            Dictionary<string, object> dict = value as Dictionary<string, object>;
            return dict ?? new Dictionary<string, object>();
        }

        private static IList<object> AsList(object value)
        {
            List<object> list = new List<object>();
            if (value == null || value is string) return list;
            IEnumerable enumerable = value as IEnumerable;
            if (enumerable == null) return list;
            foreach (object item in enumerable) list.Add(item);
            return list;
        }

        private static string GetText(Dictionary<string, object> dict, string key, string fallback)
        {
            object value = Get(dict, key);
            return value == null ? fallback : Convert.ToString(value);
        }

        private static int IntValue(Dictionary<string, object> dict, string key, int fallback)
        {
            object value = Get(dict, key);
            if (value == null) return fallback;
            int parsed;
            return Int32.TryParse(Convert.ToString(value), out parsed) ? parsed : fallback;
        }

        private static bool BoolValue(Dictionary<string, object> dict, string key, bool fallback)
        {
            object value = Get(dict, key);
            if (value == null) return fallback;
            bool parsed;
            if (Boolean.TryParse(Convert.ToString(value), out parsed)) return parsed;
            string text = Convert.ToString(value);
            if (text == "1" || text.Equals("yes", StringComparison.OrdinalIgnoreCase) || text.Equals("on", StringComparison.OrdinalIgnoreCase)) return true;
            if (text == "0" || text.Equals("no", StringComparison.OrdinalIgnoreCase) || text.Equals("off", StringComparison.OrdinalIgnoreCase)) return false;
            return fallback;
        }

        private static string GetTarget(Dictionary<string, object> item, string action)
        {
            if (action == "script") return GetText(item, "script", GetText(item, "custom_script", GetText(item, "target", "")));
            if (action == "cmd") return GetText(item, "command", GetText(item, "target", ""));
            if (action == "winget") return GetText(item, "winget", GetText(item, "package", GetText(item, "command", GetText(item, "target", ""))));
            if (action == "download") return GetText(item, "download_url", GetText(item, "url", GetText(item, "target", "")));
            return GetText(item, "url", GetText(item, "command", GetText(item, "target", "")));
        }

        private static string NavLabel(Dictionary<string, object> row, string id, Dictionary<string, object> pages)
        {
            string label = GetText(row, "name", "");
            if (!String.IsNullOrWhiteSpace(label)) return label;
            label = GetText(row, "title", "");
            if (!String.IsNullOrWhiteSpace(label)) return label;
            if (pages.ContainsKey(id)) return PageLabel(AsDict(pages[id]), id);
            return FriendlyId(id);
        }

        private static string PageLabel(Dictionary<string, object> page, string id)
        {
            string label = GetText(page, "title", "");
            if (!String.IsNullOrWhiteSpace(label)) return label;
            label = GetText(page, "name", "");
            if (!String.IsNullOrWhiteSpace(label)) return label;
            return FriendlyId(id);
        }

        private static string FriendlyId(string id)
        {
            string key = (id ?? "").ToLowerInvariant();
            if (key == "rack") return "机架宿主";
            if (key == "plugins") return "插件中心";
            if (key == "debug") return "调试工具";
            if (key == "toolbox") return "系统工具";
            if (key == "driver") return "声卡驱动";
            if (key == "software") return "常用软件";
            if (key == "websites") return "常用网站";
            if (key == "settings") return "打包设置";
            return String.IsNullOrWhiteSpace(id) ? "未命名" : id;
        }

        private static string ActionLabel(string action)
        {
            if (action == "download") return "下载";
            if (action == "cmd") return "命令";
            if (action == "script") return "脚本";
            if (action == "winget") return "安装";
            return "网页";
        }

        private static Color CardAccent(string action, string title, int index)
        {
            string text = ((title ?? "") + " " + (action ?? "")).ToLowerInvariant();
            if (text.IndexOf("删除", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("清理", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("禁用", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("关闭", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("防火墙", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("uac", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return Red;
            }

            Color orange = Color.FromArgb(236, 118, 59);
            Color cyan = Color.FromArgb(31, 180, 172);
            Color pink = Color.FromArgb(220, 86, 148);
            Color lime = Color.FromArgb(133, 185, 48);
            Color[] palette = new Color[] { Gold, Green, Accent, orange, Purple, cyan, pink, lime };
            int seed = StableHash(text) + Math.Max(0, index) * 37;
            if (action == "cmd") seed += 5;
            if (action == "download") seed += 11;
            if (action == "winget") seed += 17;
            int colorIndex = seed & 0x7fffffff;
            return palette[colorIndex % palette.Length];
        }

        private static int StableHash(string value)
        {
            unchecked
            {
                int hash = 23;
                for (int i = 0; i < value.Length; i++) hash = hash * 31 + value[i];
                if (hash == Int32.MinValue) return 0;
                return Math.Abs(hash);
            }
        }

        private static string Sha256Hex(string value)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
                StringBuilder sb = new StringBuilder(bytes.Length * 2);
                foreach (byte b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private sealed class NavItemControl : Control
        {
            private readonly System.Windows.Forms.Timer timer;
            private double glow;
            private double targetGlow;
            private double pulse;
            private bool active;
            private bool hovered;
            public string Caption = "";

            public bool Active
            {
                get { return active; }
                set
                {
                    active = value;
                    targetGlow = active ? 1.0 : (hovered ? 0.45 : 0.0);
                    timer.Start();
                    Invalidate();
                }
            }

            public NavItemControl()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold);
                timer = new System.Windows.Forms.Timer();
                timer.Interval = 24;
                timer.Tick += delegate
                {
                    glow += (targetGlow - glow) * 0.25;
                    if (Math.Abs(targetGlow - glow) < 0.01)
                    {
                        glow = targetGlow;
                        timer.Stop();
                    }
                    Invalidate();
                };
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                targetGlow = active ? 1.0 : 0.45;
                timer.Start();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                targetGlow = active ? 1.0 : 0.0;
                timer.Start();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(0, 2, Width - 1, Height - 5);
                int alpha = Math.Max(0, Math.Min(255, (int)(glow * 210)));

                if (alpha > 0)
                {
                    Color navStart = LightTheme ? Color.FromArgb(alpha, Math.Max(0, Accent.R - 20), Math.Max(0, Accent.G - 10), Accent.B) : Color.FromArgb(alpha, 58, 58, 64);
                    Color navEnd = LightTheme ? Color.FromArgb(Math.Max(35, alpha / 2), PanelBg2) : Color.FromArgb(alpha, 28, 31, 39);
                    using (GraphicsPath path = RoundRect(rect, 10))
                    using (LinearGradientBrush bg = new LinearGradientBrush(rect, navStart, navEnd, LinearGradientMode.Horizontal))
                    {
                        e.Graphics.FillPath(bg, path);
                    }

                    int beamAlpha = Math.Min(255, (int)(90 + 110 * glow));
                    using (GraphicsPath beam = RoundRect(new Rectangle(0, 7, 5, Height - 15), 3))
                    using (SolidBrush beamBrush = new SolidBrush(Color.FromArgb(beamAlpha, 56, 207, 255)))
                    {
                        e.Graphics.FillPath(beamBrush, beam);
                    }

                    using (GraphicsPath halo = RoundRect(new Rectangle(-18, 5, 58, Height - 10), 18))
                    using (PathGradientBrush haloBrush = new PathGradientBrush(halo))
                    {
                        haloBrush.CenterColor = Color.FromArgb((int)(80 * glow), 56, 207, 255);
                        haloBrush.SurroundColors = new Color[] { Color.FromArgb(0, 56, 207, 255) };
                        e.Graphics.FillPath(haloBrush, halo);
                    }
                }

                Color shadow = Color.FromArgb((int)(120 * glow), Accent);
                Rectangle textRect = new Rectangle(0, 0, Width, Height);
                if (glow > 0.15)
                {
                    TextRenderer.DrawText(e.Graphics, Caption, Font, new Rectangle(1, 1, Width, Height), shadow, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                    TextRenderer.DrawText(e.Graphics, Caption, Font, new Rectangle(-1, -1, Width, Height), shadow, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                }
                TextRenderer.DrawText(e.Graphics, Caption, Font, textRect, active ? TextColor : Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private sealed class TemplateNavButton : Control
        {
            private bool active;
            private bool hovered;
            public bool StudioMode;
            public string SourceCaption = "";
            public string Caption = "";
            public string IconText = "";

            public bool Active
            {
                get { return active; }
                set { active = value; Invalidate(); }
            }

            public TemplateNavButton()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(0, 1, Width - 1, Height - 2);
                Color fill = StudioMode
                    ? (active ? (LightTheme ? Color.FromArgb(215, 235, 255) : Color.FromArgb(42, 65, 90)) : (hovered ? PanelBg2 : SideBg))
                    : (active ? PortalSoftAccentBack() : (hovered ? PortalHoverBack() : SideBg));
                int radius = StudioMode ? 8 : 4;
                using (GraphicsPath path = RoundRect(rect, radius))
                using (SolidBrush bg = new SolidBrush(fill))
                {
                    e.Graphics.FillPath(bg, path);
                }
                if (!StudioMode && active)
                {
                    using (SolidBrush beam = new SolidBrush(Accent))
                    {
                        e.Graphics.FillRectangle(beam, new Rectangle(0, 6, 3, Height - 12));
                    }
                }
                Color iconColor = active ? Accent : Muted;
                Color textColor = active ? (StudioMode ? Accent : TextColor) : TextColor;
                int iconWidth = StudioMode ? 34 : 30;
                TextRenderer.DrawText(e.Graphics, IconText, new Font(Font.FontFamily, 10F, FontStyle.Bold), new Rectangle(8, 0, iconWidth, Height), iconColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(e.Graphics, Caption, Font, new Rectangle(8 + iconWidth, 0, Width - iconWidth - 14, Height), textColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class StudioChromeButton : Button
        {
            private bool hovered;
            public string IconKey = "";
            public string BadgeText = "";

            public StudioChromeButton()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                FlatStyle = FlatStyle.Flat;
                FlatAppearance.BorderSize = 0;
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.Clear(EffectiveBackColor(Parent));
                using (SolidBrush clear = new SolidBrush(EffectiveBackColor(Parent)))
                {
                    e.Graphics.FillRectangle(clear, ClientRectangle);
                }

                Rectangle rect = new Rectangle(1, 1, Width - 3, Height - 3);
                Color fill = LightTheme ? Color.FromArgb(240, 244, 249) : Color.FromArgb(42, 51, 63);
                if (hovered)
                {
                    using (GraphicsPath path = RoundRect(rect, 5))
                    using (SolidBrush bg = new SolidBrush(fill))
                    {
                        e.Graphics.FillPath(bg, path);
                    }
                }
                DrawIcon(e.Graphics);
                DrawBadge(e.Graphics);
            }

            private void DrawBadge(Graphics g)
            {
                if (String.IsNullOrWhiteSpace(BadgeText)) return;
                string text = BadgeText.Trim();
                if (text.Length > 2) text = "99";
                using (Font badgeFont = new Font("Microsoft YaHei UI", 7F, FontStyle.Bold))
                {
                    Size textSize = TextRenderer.MeasureText(g, text, badgeFont, Size.Empty, TextFormatFlags.NoPadding);
                    int badgeWidth = Math.Max(14, textSize.Width + 6);
                    int badgeHeight = 14;
                    Rectangle badge = new Rectangle(Width - badgeWidth - 1, 0, badgeWidth, badgeHeight);
                    using (GraphicsPath path = RoundRect(badge, 7))
                    using (SolidBrush bg = new SolidBrush(LightTheme ? Color.FromArgb(239, 68, 68) : Color.FromArgb(255, 96, 96)))
                    using (Pen border = new Pen(EffectiveBackColor(Parent), 1F))
                    {
                        g.FillPath(bg, path);
                        g.DrawPath(border, path);
                    }
                    TextRenderer.DrawText(g, text, badgeFont, badge, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
            }

            private void DrawIcon(Graphics g)
            {
                Color icon = ForeColor == Color.Empty ? Color.FromArgb(45, 58, 79) : ForeColor;
                Rectangle box = new Rectangle(5, 5, Width - 10, Height - 10);
                switch ((IconKey ?? "").ToLowerInvariant())
                {
                    case "downloads":
                        using (Pen pen = new Pen(icon, 1.65F))
                        {
                            g.DrawLine(pen, box.Left + 10, box.Top + 3, box.Left + 10, box.Top + 12);
                            g.DrawLine(pen, box.Left + 6, box.Top + 9, box.Left + 10, box.Top + 13);
                            g.DrawLine(pen, box.Left + 14, box.Top + 9, box.Left + 10, box.Top + 13);
                            g.DrawLine(pen, box.Left + 5, box.Top + 16, box.Left + 15, box.Top + 16);
                            g.DrawLine(pen, box.Left + 4, box.Top + 13, box.Left + 4, box.Top + 16);
                            g.DrawLine(pen, box.Left + 16, box.Top + 13, box.Left + 16, box.Top + 16);
                        }
                        break;
                    case "trash":
                        using (Pen pen = new Pen(icon, 1.6F))
                        {
                            pen.StartCap = LineCap.Round;
                            pen.EndCap = LineCap.Round;
                            g.DrawLine(pen, box.Left + 4, box.Top + 5, box.Left + 16, box.Top + 5);
                            g.DrawLine(pen, box.Left + 8, box.Top + 2, box.Left + 12, box.Top + 2);
                            g.DrawLine(pen, box.Left + 7, box.Top + 2, box.Left + 13, box.Top + 2);
                            g.DrawLine(pen, box.Left + 6, box.Top + 7, box.Left + 7, box.Top + 17);
                            g.DrawLine(pen, box.Left + 14, box.Top + 7, box.Left + 13, box.Top + 17);
                            g.DrawLine(pen, box.Left + 7, box.Top + 17, box.Left + 13, box.Top + 17);
                            g.DrawLine(pen, box.Left + 9, box.Top + 9, box.Left + 9, box.Top + 15);
                            g.DrawLine(pen, box.Left + 11, box.Top + 9, box.Left + 11, box.Top + 15);
                        }
                        break;
                    case "lock":
                        using (Pen pen = new Pen(icon, 1.6F))
                        {
                            g.DrawArc(pen, box.Left + 5, box.Top + 1, 8, 8, 180, 180);
                            g.DrawRectangle(pen, box.Left + 4, box.Top + 8, 10, 8);
                        }
                        break;
                    case "wechat":
                        using (Pen pen = new Pen(icon, 1.45F))
                        {
                            g.DrawEllipse(pen, box.Left + 1, box.Top + 5, 11, 9);
                            g.DrawEllipse(pen, box.Left + 8, box.Top + 8, 10, 8);
                            using (SolidBrush dot = new SolidBrush(icon))
                            {
                                g.FillEllipse(dot, box.Left + 5, box.Top + 9, 1.8F, 1.8F);
                                g.FillEllipse(dot, box.Left + 9, box.Top + 9, 1.8F, 1.8F);
                                g.FillEllipse(dot, box.Left + 12, box.Top + 12, 1.6F, 1.6F);
                                g.FillEllipse(dot, box.Left + 15, box.Top + 12, 1.6F, 1.6F);
                            }
                        }
                        break;
                    case "moon":
                        using (GraphicsPath moon = new GraphicsPath())
                        using (SolidBrush moonBrush = new SolidBrush(icon))
                        using (SolidBrush cutBrush = new SolidBrush(EffectiveBackColor(this)))
                        {
                            RectangleF outer = new RectangleF(box.Left + 4, box.Top + 3, 12, 12);
                            RectangleF inner = new RectangleF(box.Left + 8, box.Top + 1, 12, 12);
                            g.FillEllipse(moonBrush, outer);
                            g.FillEllipse(cutBrush, inner);
                        }
                        break;
                    case "sun":
                        using (Pen pen = new Pen(icon, 1.55F))
                        using (SolidBrush sunBrush = new SolidBrush(Color.FromArgb(55, icon)))
                        {
                            Rectangle core = new Rectangle(box.Left + 7, box.Top + 7, 6, 6);
                            g.FillEllipse(sunBrush, core);
                            g.DrawEllipse(pen, core);
                            g.DrawLine(pen, box.Left + 10, box.Top + 1, box.Left + 10, box.Top + 4);
                            g.DrawLine(pen, box.Left + 10, box.Top + 16, box.Left + 10, box.Top + 19);
                            g.DrawLine(pen, box.Left + 1, box.Top + 10, box.Left + 4, box.Top + 10);
                            g.DrawLine(pen, box.Left + 16, box.Top + 10, box.Left + 19, box.Top + 10);
                            g.DrawLine(pen, box.Left + 4, box.Top + 4, box.Left + 6, box.Top + 6);
                            g.DrawLine(pen, box.Left + 14, box.Top + 14, box.Left + 16, box.Top + 16);
                            g.DrawLine(pen, box.Left + 16, box.Top + 4, box.Left + 14, box.Top + 6);
                            g.DrawLine(pen, box.Left + 6, box.Top + 14, box.Left + 4, box.Top + 16);
                        }
                        break;
                    case "min":
                        using (Pen pen = new Pen(icon, 1.7F))
                        {
                            g.DrawLine(pen, box.Left + 4, box.Top + 12, box.Left + 16, box.Top + 12);
                        }
                        break;
                    case "max":
                        using (Pen pen = new Pen(icon, 1.6F))
                        {
                            g.DrawRectangle(pen, box.Left + 4, box.Top + 7, 9, 9);
                            g.DrawRectangle(pen, box.Left + 8, box.Top + 3, 9, 9);
                        }
                        break;
                    case "close":
                        using (Pen pen = new Pen(icon, 1.8F))
                        {
                            g.DrawLine(pen, box.Left + 5, box.Top + 5, box.Left + 15, box.Top + 15);
                            g.DrawLine(pen, box.Left + 15, box.Top + 5, box.Left + 5, box.Top + 15);
                        }
                        break;
                }
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class PortalHeroControl : Control
        {
            public string TitleText = "";
            public string SubtitleText = "";
            public Color AccentColor = Accent;

            public PortalHeroControl()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Font = new Font("Microsoft YaHei UI", 22F, FontStyle.Bold);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                Color start = Color.FromArgb(Math.Max(0, AccentColor.R - 35), Math.Max(0, AccentColor.G - 25), Math.Max(0, AccentColor.B - 5));
                Color end = Color.FromArgb(18, 43, 82);
                using (GraphicsPath path = RoundRect(rect, 16))
                using (LinearGradientBrush bg = new LinearGradientBrush(rect, start, end, LinearGradientMode.ForwardDiagonal))
                {
                    e.Graphics.FillPath(bg, path);
                }
                string title = String.IsNullOrWhiteSpace(TitleText) ? "工具箱" : TitleText;
                float titleSize = 24F;
                while (titleSize > 13F && TextRenderer.MeasureText(title, new Font("Microsoft YaHei UI", titleSize, FontStyle.Bold)).Width > Width - 72)
                {
                    titleSize -= 1F;
                }
                int titleHeight = 42;
                int titleTop = Math.Max(34, (Height - 72) / 2);
                TextRenderer.DrawText(e.Graphics, title, new Font("Microsoft YaHei UI", titleSize, FontStyle.Bold), new Rectangle(28, titleTop, Width - 56, titleHeight), Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(e.Graphics, SubtitleText, new Font("Microsoft YaHei UI", 10F, FontStyle.Regular), new Rectangle(28, titleTop + 44, Width - 56, 24), Color.FromArgb(235, 255, 255, 255), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class PortalEmptyGroupControl : Control
        {
            public PortalEmptyGroupControl()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath path = UiRoundRect(rect, 8))
                using (Pen border = new Pen(Color.FromArgb(150, Line), 1F))
                {
                    border.DashStyle = DashStyle.Dash;
                    e.Graphics.DrawPath(border, path);
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, rect, Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private sealed class ActionCard : Control
        {
            private bool hovered;
            public string Title = "";
            public string Subtitle = "";
            public string Description = "";
            public Image IconImage;
            public Color AccentColor = Accent;
            public bool ListMode;
            public bool PortalMode;
            public ActionInfo ActionInfo;

            public ActionCard()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 9.5F, FontStyle.Bold);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(1, 1, Width - 3, Height - 3);
                Color cardTop = hovered ? PanelBg2 : PanelBg;
                Color cardBottom = LightTheme ? Color.FromArgb(Math.Max(0, PanelBg.R - 10), Math.Max(0, PanelBg.G - 10), Math.Max(0, PanelBg.B - 10)) : PanelBg2;
                using (GraphicsPath path = RoundRect(rect, 10))
                using (LinearGradientBrush brush = new LinearGradientBrush(rect, cardTop, cardBottom, LinearGradientMode.Vertical))
                using (Pen border = new Pen(AccentColor, hovered ? 2.4F : 1.8F))
                {
                    e.Graphics.FillPath(brush, path);
                    e.Graphics.DrawPath(border, path);
                }

                using (GraphicsPath stripePath = RoundRect(new Rectangle(1, 1, 5, Height - 3), 7))
                using (SolidBrush stripe = new SolidBrush(AccentColor))
                {
                    e.Graphics.FillPath(stripe, stripePath);
                }

                if (PortalMode)
                {
                    int iconSize = 28;
                    Rectangle iconRect = new Rectangle(18, 20, iconSize, iconSize);
                    if (IconImage != null)
                    {
                        e.Graphics.DrawImage(IconImage, iconRect);
                    }
                    else
                    {
                        using (GraphicsPath dotPath = RoundRect(iconRect, 8))
                        using (SolidBrush dotBrush = new SolidBrush(Color.FromArgb(35, AccentColor)))
                        using (Pen dotPen = new Pen(AccentColor, 1F))
                        {
                            e.Graphics.FillPath(dotBrush, dotPath);
                            e.Graphics.DrawPath(dotPen, dotPath);
                        }
                    }
                    Rectangle portalTitle = new Rectangle(58, 16, Width - 78, 28);
                    TextRenderer.DrawText(e.Graphics, Title, new Font(Font.FontFamily, 10.5F, FontStyle.Bold), portalTitle, TextColor, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
                    Rectangle portalDesc = new Rectangle(58, 44, Width - 78, 24);
                    string desc = String.IsNullOrWhiteSpace(Description) ? Subtitle : Description;
                    TextRenderer.DrawText(e.Graphics, desc, new Font(Font.FontFamily, 8.5F, FontStyle.Regular), portalDesc, Muted, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
                    Rectangle actionBadge = new Rectangle(18, Height - 38, 52, 24);
                    using (GraphicsPath badgePath = RoundRect(actionBadge, 6))
                    using (SolidBrush badgeBrush = new SolidBrush(AccentColor))
                    {
                        e.Graphics.FillPath(badgeBrush, badgePath);
                    }
                    TextRenderer.DrawText(e.Graphics, "打开", new Font(Font.FontFamily, 8.5F, FontStyle.Bold), actionBadge, LightTheme ? Color.White : Color.FromArgb(7, 18, 24), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                    return;
                }

                int textX = 18;
                if (IconImage != null)
                {
                    const int iconBox = 24;
                    double scale = Math.Min((double)iconBox / Math.Max(1, IconImage.Width), (double)iconBox / Math.Max(1, IconImage.Height));
                    scale = Math.Min(1D, scale);
                    int drawW = Math.Max(1, (int)Math.Round(IconImage.Width * scale));
                    int drawH = Math.Max(1, (int)Math.Round(IconImage.Height * scale));
                    int iconY = (Height - drawH) / 2;
                    int iconX = textX + (iconBox - drawW) / 2;
                    e.Graphics.DrawImage(IconImage, iconX, iconY, drawW, drawH);
                    textX += iconBox + 10;
                }

                Rectangle titleRect = new Rectangle(textX, 0, Width - textX - (ListMode ? 92 : 12), Height);
                TextRenderer.DrawText(e.Graphics, Title, Font, titleRect, TextColor, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);

                if (ListMode)
                {
                    Rectangle badge = new Rectangle(Width - 76, (Height - 22) / 2, 40, 22);
                    using (GraphicsPath badgePath = RoundRect(badge, 5))
                    using (SolidBrush badgeBrush = new SolidBrush(Color.FromArgb(LightTheme ? 30 : 55, Purple)))
                    {
                        e.Graphics.FillPath(badgeBrush, badgePath);
                    }
                    TextRenderer.DrawText(e.Graphics, Subtitle, new Font("Microsoft YaHei UI", 8F, FontStyle.Bold), badge, Purple, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                    TextRenderer.DrawText(e.Graphics, "›", new Font("Microsoft YaHei UI", 18F, FontStyle.Bold), new Rectangle(Width - 34, 0, 24, Height), Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                }
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        private sealed class TemplateActionButton : Control
        {
            private bool hovered;
            public bool StudioMode = true;
            public string Title = "";
            public string Subtitle = "";
            public string IconText = "";
            public string ButtonText = "打开";
            public Image IconImage;
            public Color AccentColor = Color.FromArgb(24, 129, 239);
            public ActionInfo ActionInfo;

            public TemplateActionButton()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                if (StudioMode) PaintStudio(e.Graphics);
                else PaintPortal(e.Graphics);
            }

            private void PaintStudio(Graphics g)
            {
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                Color fill = hovered
                    ? (LightTheme ? Color.FromArgb(248, 251, 255) : Color.FromArgb(50, 63, 78))
                    : (LightTheme ? Color.FromArgb(250, 252, 255) : Color.FromArgb(37, 49, 64));
                Color borderColor = LightTheme ? Color.FromArgb(214, 224, 236) : Color.FromArgb(75, 91, 110);
                using (GraphicsPath path = RoundRect(rect, 8))
                using (SolidBrush bg = new SolidBrush(fill))
                using (Pen border = new Pen(borderColor, 1F))
                {
                    g.FillPath(bg, path);
                    g.DrawPath(border, path);
                }
                TextRenderer.DrawText(g, Title, Font, new Rectangle(8, 0, Width - 16, Height), TextColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            private void PaintPortal(Graphics g)
            {
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath path = RoundRect(rect, 8))
                using (SolidBrush bg = new SolidBrush(hovered ? PortalHoverBack() : PanelBg))
                using (Pen border = new Pen(hovered ? Color.FromArgb(LightTheme ? 140 : 110, Accent) : Color.FromArgb(LightTheme ? 110 : 82, Line), 1F))
                {
                    g.FillPath(bg, path);
                    g.DrawPath(border, path);
                }
                Rectangle icon = new Rectangle(18, 18, 26, 26);
                using (GraphicsPath iconPath = RoundRect(icon, 6))
                using (SolidBrush iconBg = new SolidBrush(PortalSoftAccentBack()))
                {
                    g.FillPath(iconBg, iconPath);
                }
                if (IconImage != null)
                {
                    g.DrawImage(IconImage, icon);
                }
                else
                {
                    TextRenderer.DrawText(g, IconText, new Font(Font.FontFamily, 10F, FontStyle.Bold), icon, Accent, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                }
                TextRenderer.DrawText(g, Title, new Font(Font.FontFamily, 10F, FontStyle.Bold), new Rectangle(54, 14, Width - 72, 26), TextColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(g, Subtitle, new Font(Font.FontFamily, 8.5F, FontStyle.Regular), new Rectangle(54, 38, Width - 72, 24), Muted, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                Rectangle open = new Rectangle(18, Height - 48, 50, 30);
                using (GraphicsPath openPath = RoundRect(open, 6))
                using (SolidBrush openBg = new SolidBrush(Accent))
                {
                    g.FillPath(openBg, openPath);
                }
                TextRenderer.DrawText(g, ButtonText, new Font(Font.FontFamily, 9F, FontStyle.Bold), open, LightTheme ? Color.White : Color.FromArgb(7, 18, 24), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        internal sealed class ActionInfo
        {
            public string Action;
            public string Target;
            public string CustomScript;
            public string Name;
        }

        private sealed class RoundedPanel : Panel
        {
            public int Radius = 12;
            public Color BorderColor = Color.FromArgb(70, Line);
            private Size regionSize;
            private int regionRadius = -1;

            public RoundedPanel()
            {
                DoubleBuffered = true;
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            }

            protected override void OnPaintBackground(PaintEventArgs e)
            {
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath path = UiRoundRect(rect, Radius))
                using (SolidBrush bg = new SolidBrush(BackColor))
                using (Pen border = new Pen(BorderColor, 1F))
                {
                    EnsureRoundedRegion(this, Radius, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }
                base.OnPaint(e);
            }
        }

        private sealed class RoundedFlowLayoutPanel : FlowLayoutPanel
        {
            public int Radius = 12;
            public bool DrawBorder = true;
            public bool UseCustomBorderColor;
            public Color BorderColor = Color.FromArgb(76, Line);
            private Size regionSize;
            private int regionRadius = -1;

            public RoundedFlowLayoutPanel()
            {
                DoubleBuffered = true;
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            }

            protected override void OnPaintBackground(PaintEventArgs e)
            {
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath path = UiRoundRect(rect, Radius))
                using (SolidBrush bg = new SolidBrush(BackColor))
                {
                    EnsureRoundedRegion(this, Radius, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, path);
                    if (DrawBorder)
                    {
                        using (Pen border = new Pen(UseCustomBorderColor ? BorderColor : Color.FromArgb(76, Line), 1F))
                        {
                            e.Graphics.DrawPath(border, path);
                        }
                    }
                }
                base.OnPaint(e);
            }
        }

        private sealed class EmptyStateLabel : Label
        {
            public bool DrawCard = true;
            public bool UseCustomColors;
            public Color FillColor;
            public Color BorderColor;
            public Color IconBackColor;

            public EmptyStateLabel()
            {
                DoubleBuffered = true;
                ForeColor = Muted;
                BackColor = Color.Transparent;
                TextAlign = ContentAlignment.MiddleCenter;
                Font = new Font("Microsoft YaHei UI", 9.5F, FontStyle.Regular);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                if (DrawCard)
                {
                    Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                    using (GraphicsPath path = UiRoundRect(rect, 12))
                    using (SolidBrush bg = new SolidBrush(UseCustomColors ? FillColor : DialogCardBack()))
                    using (Pen border = new Pen(UseCustomColors ? BorderColor : Color.FromArgb(65, Line)))
                    {
                        e.Graphics.FillPath(bg, path);
                        e.Graphics.DrawPath(border, path);
                    }
                }

                int iconSize = 24;
                int groupHeight = iconSize + 8 + 24;
                int iconTop = Math.Max(4, (Height - groupHeight) / 2);
                Rectangle icon = new Rectangle((Width - iconSize) / 2, iconTop, iconSize, iconSize);
                using (GraphicsPath iconPath = UiRoundRect(icon, 8))
                using (SolidBrush iconBg = new SolidBrush(UseCustomColors ? IconBackColor : Color.FromArgb(42, 81, 104)))
                using (Pen iconPen = new Pen(Accent, 1.5F))
                {
                    e.Graphics.FillPath(iconBg, iconPath);
                    e.Graphics.DrawPath(iconPen, iconPath);
                    e.Graphics.DrawLine(iconPen, icon.Left + 7, icon.Top + 9, icon.Right - 7, icon.Top + 9);
                    e.Graphics.DrawLine(iconPen, icon.Left + 7, icon.Top + 14, icon.Right - 7, icon.Top + 14);
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(0, icon.Bottom + 8, Width, 24), ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private sealed class RoundButton : Button
        {
            private bool hovered;
            private Size regionSize;
            private int regionRadius = -1;
            public int Radius = 9;
            public Color BorderColor = Line;
            public Color HoverBackColor = PanelBg2;

            public RoundButton()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                hovered = true;
                Invalidate();
                base.OnMouseEnter(e);
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                hovered = false;
                Invalidate();
                base.OnMouseLeave(e);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                Color fill = !Enabled ? Color.FromArgb(Math.Max(0, BackColor.R - 8), Math.Max(0, BackColor.G - 8), Math.Max(0, BackColor.B - 8)) : (hovered ? HoverBackColor : BackColor);
                using (GraphicsPath path = UiRoundRect(rect, Radius))
                using (LinearGradientBrush bg = new LinearGradientBrush(rect, Color.FromArgb(Math.Min(255, fill.R + 5), Math.Min(255, fill.G + 5), Math.Min(255, fill.B + 5)), fill, LinearGradientMode.Vertical))
                using (Pen border = new Pen(!Enabled ? Color.FromArgb(70, BorderColor) : (hovered ? Color.FromArgb(150, Accent) : BorderColor), 1F))
                {
                    EnsureRoundedRegion(this, Radius, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, rect, Enabled ? ForeColor : Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private sealed class FlatCheckBox : CheckBox
        {
            public FlatCheckBox()
            {
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
                Cursor = Cursors.Hand;
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular);
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = BackColor == Color.Transparent ? EffectiveBackColor(Parent) : BackColor;
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }
                Rectangle box = new Rectangle(0, (Height - 18) / 2, 18, 18);
                using (GraphicsPath path = UiRoundRect(box, 5))
                using (SolidBrush bg = new SolidBrush(Checked ? Accent : DialogFieldBack()))
                using (Pen border = new Pen(Checked ? Accent : Color.FromArgb(100, Line), 1.2F))
                {
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }
                if (Checked)
                {
                    using (Pen check = new Pen(Color.White, 2F))
                    {
                        e.Graphics.DrawLines(check, new Point[] { new Point(4, box.Top + 9), new Point(8, box.Top + 13), new Point(14, box.Top + 5) });
                    }
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(26, 0, Width - 26, Height), ForeColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private sealed class PopupPanel : Panel
        {
            private Size regionSize;
            private int regionRadius = -1;

            public PopupPanel()
            {
                DoubleBuffered = true;
                SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            }

            protected override void OnPaintBackground(PaintEventArgs e)
            {
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color clear = EffectiveBackColor(Parent);
                using (SolidBrush clearBrush = new SolidBrush(clear))
                {
                    e.Graphics.FillRectangle(clearBrush, ClientRectangle);
                }

                Rectangle shadowRect = new Rectangle(4, 5, Width - 10, Height - 11);
                using (GraphicsPath shadowPath = RoundRect(shadowRect, 20))
                using (SolidBrush shadow = new SolidBrush(Color.FromArgb(LightTheme ? 0 : 42, 0, 0, 0)))
                {
                    e.Graphics.FillPath(shadow, shadowPath);
                }

                Rectangle bodyRect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath bodyPath = RoundRect(bodyRect, 20))
                using (LinearGradientBrush bg = new LinearGradientBrush(bodyRect, LightTheme ? DialogCardBack() : Color.FromArgb(27, 43, 63), LightTheme ? DialogBodyBack() : Color.FromArgb(18, 31, 47), LinearGradientMode.Vertical))
                using (Pen border = new Pen(Color.FromArgb(LightTheme ? 70 : 92, Line), 1F))
                {
                    EnsureRoundedRegion(this, 20, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, bodyPath);
                    e.Graphics.DrawPath(border, bodyPath);
                }
            }

            private static GraphicsPath RoundRect(Rectangle rect, int radius)
            {
                int d = radius * 2;
                GraphicsPath path = new GraphicsPath();
                path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }

        internal sealed class ThemeOption
        {
            public readonly string Value;
            public readonly string Label;

            public ThemeOption(string value, string label)
            {
                Value = value;
                Label = label;
            }

            public override string ToString()
            {
                return Label;
            }
        }

        internal sealed class ClientSettings
        {
            public string DownloadDirectory { get; set; }
            public string Theme { get; set; }
            public bool AutoStart { get; set; }
            public bool DeleteDownloadsOnExit { get; set; }
        }

        internal sealed class ContactPopupConfig
        {
            public bool Enabled;
            public int ClickCount = 3;
            public string Title = "联系我们 / 支持作者";
            public string ThanksText = "";
            public int CacheMinutes = 60;
            public List<ContactPopupItem> Contacts = new List<ContactPopupItem>();
            public List<ContactPopupItem> Payments = new List<ContactPopupItem>();
            public List<ContactPopupLink> Links = new List<ContactPopupLink>();
        }

        internal sealed class ContactPopupItem
        {
            public string Title = "";
            public string Description = "";
            public string Image = "";
            public string ButtonText = "";
            public string ButtonUrl = "";
            public int Sort;
        }

        internal sealed class ContactPopupLink
        {
            public string Title = "";
            public string Description = "";
            public string Url = "";
            public string ButtonText = "打开链接";
            public int Sort;
        }

        internal sealed class DownloadRecord
        {
            public string Time { get; set; }
            public string Name { get; set; }
            public string Url { get; set; }
            public string SavedPath { get; set; }
            public string Result { get; set; }
            public string Message { get; set; }
        }

        private sealed class DownloadRequest
        {
            public string OriginalUrl = "";
            public string Url = "";
            public string FileName = "";
            public string BrowserUrl = "";
            public bool BrowserOnly;
            public string Message = "";
        }

        private sealed class CommandRunResult
        {
            public string Name = "内置功能";
            public string Command = "";
            public string Output = "";
            public string Error = "";
            public string LogPath = "";
            public int ExitCode = -1;

            public string ToMessage()
            {
                StringBuilder builder = new StringBuilder();
                builder.AppendLine(ExitCode == 0 ? "运行完成。" : "运行失败。");
                builder.AppendLine("功能：" + Name);
                builder.AppendLine("退出码：" + ExitCode);
                builder.AppendLine();
                builder.AppendLine("执行命令：");
                builder.AppendLine(Command);
                if (!String.IsNullOrWhiteSpace(LogPath))
                {
                    builder.AppendLine();
                    builder.AppendLine("日志文件：" + LogPath);
                }
                if (!String.IsNullOrWhiteSpace(Output))
                {
                    builder.AppendLine();
                    builder.AppendLine("输出日志：");
                    builder.AppendLine(TrimLog(Output));
                }
                if (!String.IsNullOrWhiteSpace(Error))
                {
                    builder.AppendLine();
                    builder.AppendLine("错误日志：");
                    builder.AppendLine(TrimLog(Error));
                }
                return builder.ToString().Trim();
            }

            private static string TrimLog(string text)
            {
                if (String.IsNullOrEmpty(text)) return "";
                const int max = 6000;
                if (text.Length <= max) return text.Trim();
                return text.Substring(0, max).Trim() + Environment.NewLine + "...日志过长，已截断";
            }
        }

        private sealed class DownloadTask
        {
            public readonly string Id;
            public readonly string Url;
            public readonly string OriginalUrl;
            public readonly string FileName;
            public readonly string Path;
            public readonly ManualResetEvent PauseEvent = new ManualResetEvent(true);
            public volatile bool CancelRequested;
            public volatile HttpWebRequest ActiveRequest;
            public long Received;
            public long Total = -1;
            public double SpeedBytesPerSecond;
            public string StateText = "准备下载";
            private long lastSpeedBytes;
            private DateTime lastSpeedAt = DateTime.Now;

            public DownloadTask(string url, string fileName, string path, string originalUrl = "")
            {
                Id = Guid.NewGuid().ToString("N");
                Url = url;
                OriginalUrl = String.IsNullOrWhiteSpace(originalUrl) ? url : originalUrl;
                FileName = fileName;
                Path = path;
            }

            public void UpdateSpeed()
            {
                DateTime now = DateTime.Now;
                double seconds = (now - lastSpeedAt).TotalSeconds;
                if (seconds < 0.35) return;
                long delta = Received - lastSpeedBytes;
                double current = delta > 0 ? delta / seconds : 0;
                SpeedBytesPerSecond = SpeedBytesPerSecond <= 0 ? current : SpeedBytesPerSecond * 0.55 + current * 0.45;
                lastSpeedBytes = Received;
                lastSpeedAt = now;
            }

            public void Cancel()
            {
                CancelRequested = true;
                PauseEvent.Set();
                try
                {
                    HttpWebRequest request = ActiveRequest;
                    if (request != null) request.Abort();
                }
                catch
                {
                }
            }
        }
    }

    internal sealed class BufferedFlowLayoutPanel : FlowLayoutPanel
    {
        public BufferedFlowLayoutPanel()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }
    }

    internal sealed class SmoothProgressBar : Control
    {
        private int progressValue;
        public Color FillColor { get; set; }

        public int Value
        {
            get { return progressValue; }
            set
            {
                int next = Math.Max(0, Math.Min(100, value));
                if (progressValue == next) return;
                progressValue = next;
                Invalidate();
            }
        }

        public SmoothProgressBar()
        {
            DoubleBuffered = true;
            FillColor = Color.FromArgb(43, 166, 221);
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
            using (SolidBrush bg = new SolidBrush(BackColor))
            {
                e.Graphics.FillRectangle(bg, rect);
            }
            int fillWidth = Math.Max(0, (int)Math.Round((Width - 1) * (progressValue / 100.0)));
            if (fillWidth > 0)
            {
                using (SolidBrush fill = new SolidBrush(FillColor))
                {
                    e.Graphics.FillRectangle(fill, new Rectangle(0, 0, fillWidth, Height - 1));
                }
            }
        }
    }

    internal sealed class PasswordDialog : Form
    {
        private readonly TextBox input;
        public string Password { get { return input.Text; } }

        public PasswordDialog()
        {
            Text = "工具箱密码";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(340, 132);
            Font = new Font("Microsoft YaHei UI", 9F);

            Label label = new Label { Left = 16, Top = 16, Width = 300, Height = 24, Text = "请输入工具箱启动密码" };
            input = new TextBox { Left = 16, Top = 44, Width = 306, Height = 28, UseSystemPasswordChar = true };
            Button ok = new Button { Left = 166, Top = 88, Width = 75, Height = 28, Text = "进入", DialogResult = DialogResult.OK };
            Button cancel = new Button { Left = 247, Top = 88, Width = 75, Height = 28, Text = "取消", DialogResult = DialogResult.Cancel };

            Controls.Add(label);
            Controls.Add(input);
            Controls.Add(ok);
            Controls.Add(cancel);
            AcceptButton = ok;
            CancelButton = cancel;
        }
    }
}

