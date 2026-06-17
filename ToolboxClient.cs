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
        private ListView recordsList;
        private Label recordsProgressLabel;
        private FlowLayoutPanel activeDownloadsList;
        private Panel titleBar;
        private Button gridModeButton;
        private Button listModeButton;
        private Button recordsButton;
        private Button settingsButton;
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
        private readonly Dictionary<string, NavItemControl> navButtons = new Dictionary<string, NavItemControl>();
        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>();
        private readonly HashSet<string> failedIcons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private Icon runtimeIcon;
        private ContactPopupConfig popupConfig;
        private DateTime popupCacheLoadedAt = DateTime.MinValue;
        private int brandClickCount = 0;
        private DateTime brandClickWindowStart = DateTime.MinValue;
        private int activeContactPopupTab = 0;
        private const int PopupDefaultCacheMinutes = 60;

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
                bool isLocal = uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                               uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                               uri.Host.Equals("0.0.0.0", StringComparison.OrdinalIgnoreCase) ||
                               uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase);
                if (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) && !isLocal)
                {
                    UriBuilder builder = new UriBuilder(uri);
                    builder.Scheme = "https";
                    builder.Port = -1;
                    return builder.Uri.ToString();
                }
            }
            catch
            {
            }
            return url;
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (runtimeIcon != null) runtimeIcon.Dispose();
            base.OnFormClosed(e);
        }

        private void BuildShell()
        {
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
            maxButton.Click += delegate { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; };
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

        private void AttachBrandPopupEntry(Control root)
        {
            root.Cursor = Cursors.Hand;
            root.MouseClick += HandleBrandPopupClick;
            foreach (Control child in root.Controls)
            {
                child.Cursor = Cursors.Hand;
                child.MouseClick += HandleBrandPopupClick;
            }
        }

        private void HandleBrandPopupClick(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ContactPopupConfig cfg = popupConfig;
            if (cfg == null || !cfg.Enabled)
            {
                LoadPopupConfigAsync(false);
                return;
            }
            DateTime now = DateTime.Now;
            if ((now - brandClickWindowStart).TotalMilliseconds > 1200)
            {
                brandClickWindowStart = now;
                brandClickCount = 0;
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
            if (available <= 0) available = 154;
            float[] sizes = new float[] { 15F, 14F, 13F, 12F, 11F };
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
                EnsureRuntimeIntegrity();
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
            ApplyTheme(CurrentTheme(app));
            string appTitle = GetText(app, "title", "工具箱");
            Text = appTitle;
            Text = appTitle + " v" + Program.BuildStamp;
            brandTitle.Text = appTitle;
            brandSubtitle.Text = GetText(app, "subtitle", "");
            FitBrandTitle(appTitle);
            title.Text = appTitle;
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
            if (value == "墨金深空")
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
            ApplyThemeToControls(this);
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

        private string CurrentTheme(Dictionary<string, object> app)
        {
            string serverTheme = GetText(app, "theme", "午夜靛蓝");
            if (serverTheme.Equals("glacier", StringComparison.OrdinalIgnoreCase)) serverTheme = "午夜靛蓝";
            bool allowClientTheme = BoolValue(app, "allow_client_theme", true);
            if (!allowClientTheme) return serverTheme;
            ClientSettings settings = LoadClientSettings();
            if (String.IsNullOrWhiteSpace(settings.Theme)) return serverTheme;
            IList<ThemeOption> options = VisibleThemeOptions(app);
            foreach (ThemeOption option in options)
            {
                if (option.Value.Equals(settings.Theme, StringComparison.OrdinalIgnoreCase)) return option.Value;
            }
            return serverTheme;
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
                new ThemeOption("午夜靛蓝", "午夜靛蓝"),
                new ThemeOption("海雾蓝湖", "海雾蓝湖"),
                new ThemeOption("冰川浅蓝", "冰川浅蓝"),
                new ThemeOption("钻蓝冷辉", "钻蓝冷辉"),
                new ThemeOption("晴空蓝白", "晴空蓝白"),
                new ThemeOption("森境青绿", "森境青绿"),
                new ThemeOption("翡翠冷绿", "翡翠冷绿"),
                new ThemeOption("极光青碧", "极光青碧"),
                new ThemeOption("落日绯红", "落日绯红"),
                new ThemeOption("玫瑰粉雾", "玫瑰粉雾"),
                new ThemeOption("樱雾浅粉", "樱雾浅粉"),
                new ThemeOption("蓝雾淡紫", "蓝雾淡紫"),
                new ThemeOption("星云紫幕", "星云紫幕"),
                new ThemeOption("霓虹电缎", "霓虹电缎"),
                new ThemeOption("墨金深空", "墨金深空"),
                new ThemeOption("暖棕咖啡", "暖棕咖啡"),
                new ThemeOption("余烬橙焰", "余烬橙焰"),
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
                title.Text = "暂无内容";
                content.Controls.Clear();
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
            NavItemControl button = new NavItemControl
            {
                Width = 198,
                Height = 48,
                Margin = new Padding(0, 0, 0, 3),
                Caption = label,
                Tag = id
            };
            button.Click += delegate { ShowPage((string)button.Tag); };
            nav.Controls.Add(button);
            navButtons[id] = button;
        }

        private void ShowPage(string id)
        {
            currentPage = id;
            foreach (KeyValuePair<string, NavItemControl> pair in navButtons)
            {
                bool active = pair.Key.Equals(id, StringComparison.OrdinalIgnoreCase);
                pair.Value.Active = active;
            }

            if (id.Equals("toolbox", StringComparison.OrdinalIgnoreCase))
            {
                RenderToolbox();
                return;
            }

            Dictionary<string, object> pages = AsDict(Get(config, "pages"));
            if (!pages.ContainsKey(id))
            {
                title.Text = FriendlyId(id);
                content.Controls.Clear();
                return;
            }

            Dictionary<string, object> page = AsDict(pages[id]);
            title.Text = PageLabel(page, id);
            RenderSections(AsList(Get(page, "sections")));
        }

        private void RenderToolbox()
        {
            title.Text = "系统工具";
            List<object> sections = new List<object>();
            IList<object> tabs = AsList(Get(config, "toolbox_tabs"));
            foreach (object tabObj in tabs)
            {
                Dictionary<string, object> tab = AsDict(tabObj);
                string tabName = GetText(tab, "name", "系统工具");
                foreach (object sectionObj in AsList(Get(tab, "sections")))
                {
                    Dictionary<string, object> section = new Dictionary<string, object>(AsDict(sectionObj));
                    section["title"] = tabName + " / " + GetText(section, "title", "");
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
            const int columns = 4;
            const int gap = 12;
            int cardWidth = listMode ? available : Math.Max(150, (available - gap * (columns - 1)) / columns);
            int cardHeight = listMode ? 52 : 52;
            for (int i = 0; i < buttons.Count; i++)
            {
                Control card = CreateActionButton(buttons[i], i, cardWidth, cardHeight);
                content.Controls.Add(card);
            }

            content.ResumeLayout();
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
            tip.AppendLine(String.IsNullOrWhiteSpace(name) ? "未命名" : name);
            if (!String.IsNullOrWhiteSpace(description)) tip.AppendLine(description);
            tip.AppendLine("类型：" + ActionLabel(action));
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
            status.Text = "正在执行：" + name;
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
            status.Text = "正在执行：" + name;
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
            status.Text = (ok ? "执行完成：" : "执行失败：") + result.Name;
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
            string fileName = "download.bin";
            Uri uri;
            if (Uri.TryCreate(url, UriKind.Absolute, out uri))
            {
                fileName = Path.GetFileName(uri.LocalPath);
            }
            if (String.IsNullOrWhiteSpace(fileName)) fileName = "download.bin";
            foreach (char c in Path.GetInvalidFileNameChars()) fileName = fileName.Replace(c, '_');

            string dir = GetDownloadDirectory();
            Directory.CreateDirectory(dir);
            string path = Path.Combine(dir, fileName);
            path = UniqueDownloadPath(path);
            fileName = Path.GetFileName(path);
            DownloadTask task = new DownloadTask(url, fileName, path);
            lock (activeDownloadsLock) activeDownloads.Add(task);
            status.Text = "正在下载：" + fileName;
            progressPanel.Visible = false;
            ShowDownloadRecordsPanel();
            RenderActiveDownloads();

            ThreadPool.QueueUserWorkItem(delegate
            {
                DownloadFileWorker(task);
            });
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
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(task.Url);
                task.ActiveRequest = request;
                request.UserAgent = "Mozilla/5.0 ToolboxClient";
                request.Timeout = 15000;
                request.ReadWriteTimeout = 15000;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    total = response.ContentLength;
                    using (Stream input = response.GetResponseStream())
                    using (FileStream output = new FileStream(task.Path, FileMode.Create, FileAccess.Write, FileShare.Read))
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
                            task.StateText = "下载中";
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
                if (File.Exists(task.Path)) File.Delete(task.Path);
                status.Text = "下载已取消：" + task.FileName;
                AddDownloadRecord(task.FileName, task.Url, "", "已取消", "");
                RemoveActiveDownload(task);
                FillDownloadRecords();
                return;
            }

            if (failure == null)
            {
                task.Received = task.Total > 0 ? task.Total : Math.Max(1, task.Received);
                task.StateText = "下载完成";
                RenderActiveDownloads();
                string launchStatus = LaunchDownloadedFile(task.Path);
                status.Text = launchStatus + "：" + task.FileName;
                AddDownloadRecord(task.FileName, task.Url, task.Path, launchStatus, "");
                RemoveActiveDownload(task);
                FillDownloadRecords();
                return;
            }

            if (File.Exists(task.Path)) File.Delete(task.Path);
            status.Text = "下载失败，请检查网络或文件地址。";
            AddDownloadRecord(task.FileName, task.Url, "", "下载失败", CleanDownloadError(failure.Message));
            RemoveActiveDownload(task);
            FillDownloadRecords();
        }

        private void RemoveActiveDownload(DownloadTask task)
        {
            lock (activeDownloadsLock) activeDownloads.Remove(task);
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
                    return "已下载并请求管理员启动";
                }
                if (ext == ".msi")
                {
                    Process.Start(new ProcessStartInfo("msiexec.exe", "/i \"" + path + "\"") { UseShellExecute = true, Verb = "runas" });
                    return "已下载并请求管理员安装";
                }
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"") { UseShellExecute = true });
                return "已下载，文件已定位";
            }
            catch (Win32Exception ex)
            {
                if (ex.NativeErrorCode == 1223) return "已下载，用户取消管理员启动";
                return "已下载，管理员启动失败";
            }
            catch
            {
                return "已下载，管理员启动失败";
            }
        }

        private string DefaultDownloadDirectory()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        }

        private string GetDownloadDirectory()
        {
            ClientSettings settings = LoadClientSettings();
            string dir = settings.DownloadDirectory;
            if (String.IsNullOrWhiteSpace(dir)) dir = DefaultDownloadDirectory();
            return Environment.ExpandEnvironmentVariables(dir);
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
            recordsProgressLabel = new EmptyStateLabel { Width = 590, Height = 82, Text = "当前没有下载任务" };
            activeDownloadsList.Controls.Add(recordsProgressLabel);
            layout.Controls.Add(activeDownloadsList, 0, 0);

            Label caption = new Label
            {
                Dock = DockStyle.Fill,
                Text = "下载记录",
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
            recordsList.Columns.Add("时间", 122);
            recordsList.Columns.Add("结果", 86);
            recordsList.Columns.Add("名称", 260);
            recordsList.Columns.Add("保存位置", 300);
            recordsList.DoubleClick += delegate { OpenSelectedRecordFile(); };
            recordsList.Resize += delegate { ResizeDownloadRecordColumns(); };
            recordsList.DrawColumnHeader += DrawDownloadRecordHeader;
            recordsList.DrawItem += DrawDownloadRecordItem;
            recordsList.DrawSubItem += DrawDownloadRecordSubItem;
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
            Button clear = MakeDialogButton("清空记录");
            Button deleteSelected = MakeDialogButton("删除选中");
            Button openFolder = MakeDialogButton("打开目录");
            Button openFile = MakeDialogButton("打开文件");
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
            if (tasks.Count == 0)
            {
                activeDownloadsList.Controls.Clear();
                activeDownloadRows.Clear();
                recordsProgressLabel = new EmptyStateLabel
                {
                    Width = Math.Max(520, activeDownloadsList.ClientSize.Width - 20),
                    Height = 82,
                    Text = "当前没有下载任务"
                };
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
            Panel row = new RoundedPanel
            {
                Width = Math.Max(540, activeDownloadsList.ClientSize.Width - 24),
                Height = 84,
                Margin = new Padding(0, 0, 0, 8),
                BackColor = DialogCardBack(),
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
                BackColor = DialogFieldBack(),
                FillColor = Accent
            };
            Button cancel = MakeDialogButton("取消");
            Button resume = MakeDialogButton("继续");
            Button pause = MakeDialogButton("暂停");
            cancel.Name = "taskCancel";
            resume.Name = "taskResume";
            pause.Name = "taskPause";
            cancel.Width = resume.Width = pause.Width = buttonWidth;
            cancel.Height = resume.Height = pause.Height = 34;
            cancel.Left = row.Width - buttonWidth - 16;
            resume.Left = cancel.Left - buttonWidth - buttonGap;
            pause.Left = resume.Left - buttonWidth - buttonGap;
            cancel.Top = resume.Top = pause.Top = buttonTop;
            pause.Click += delegate { task.PauseEvent.Reset(); task.StateText = "已暂停"; UpdateDownloadTaskRow(task, row); };
            resume.Click += delegate { task.PauseEvent.Set(); task.StateText = "下载中"; UpdateDownloadTaskRow(task, row); };
            cancel.Click += delegate { task.Cancel(); task.StateText = "正在取消"; UpdateDownloadTaskRow(task, row); };
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
                    row.SubItems.Add(record.Result ?? "");
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
            recordsList.Columns[2].Width = Math.Max(220, width - 122 - 86 - 170 - 6);
            recordsList.Columns[3].Width = Math.Max(170, width - recordsList.Columns[0].Width - recordsList.Columns[1].Width - recordsList.Columns[2].Width - 6);
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

        private void DrawDownloadRecordHeader(object sender, DrawListViewColumnHeaderEventArgs e)
        {
            using (SolidBrush bg = new SolidBrush(DialogHeaderBack()))
            using (Pen border = new Pen(Color.FromArgb(78, Line)))
            {
                e.Graphics.FillRectangle(bg, e.Bounds);
                e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
                if (e.ColumnIndex > 0) e.Graphics.DrawLine(border, e.Bounds.Left, e.Bounds.Top + 6, e.Bounds.Left, e.Bounds.Bottom - 6);
            }
            Rectangle textRect = new Rectangle(e.Bounds.Left + 10, e.Bounds.Top, e.Bounds.Width - 18, e.Bounds.Height);
            TextRenderer.DrawText(e.Graphics, e.Header.Text, new Font(Font.FontFamily, 9F, FontStyle.Bold), textRect, TextColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private void DrawDownloadRecordItem(object sender, DrawListViewItemEventArgs e)
        {
        }

        private void DrawDownloadRecordSubItem(object sender, DrawListViewSubItemEventArgs e)
        {
            bool selected = e.Item.Selected;
            Color rowBack = DialogRowBack(e.ItemIndex, selected);
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

        private void OpenSelectedRecordFile()
        {
            DownloadRecord record = SelectedDownloadRecord(recordsList);
            if (record == null || String.IsNullOrWhiteSpace(record.SavedPath) || !File.Exists(record.SavedPath)) return;
            Process.Start(new ProcessStartInfo(record.SavedPath) { UseShellExecute = true });
        }

        private void OpenSelectedRecordFolder()
        {
            DownloadRecord record = SelectedDownloadRecord(recordsList);
            if (record == null || String.IsNullOrWhiteSpace(record.SavedPath)) return;
            string filePath = record.SavedPath;
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
            if (MessageBox.Show("确定清空下载记录吗？", "下载记录", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
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
                MessageBox.Show("请先选择要删除的下载记录。", "下载记录", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (MessageBox.Show("确定删除选中的下载记录并同时删除已下载文件吗？点“否”将取消操作。", "下载记录", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            bool deleteFiles = true;
            HashSet<string> selected = new HashSet<string>();
            foreach (ListViewItem item in recordsList.SelectedItems)
            {
                DownloadRecord record = item.Tag as DownloadRecord;
                if (record != null) selected.Add((record.Time ?? "") + "|" + (record.Name ?? "") + "|" + (record.SavedPath ?? ""));
                if (deleteFiles) DeleteDownloadedFile(record);
            }

            List<DownloadRecord> records = LoadDownloadRecords();
            records.RemoveAll(delegate (DownloadRecord record)
            {
                return selected.Contains((record.Time ?? "") + "|" + (record.Name ?? "") + "|" + (record.SavedPath ?? ""));
            });
            SaveDownloadRecords(records);
            FillDownloadRecords();
            status.Text = "已删除选中的下载记录";
        }

        private void DeleteDownloadedFile(DownloadRecord record)
        {
            try
            {
                if (record == null || String.IsNullOrWhiteSpace(record.SavedPath)) return;
                if (File.Exists(record.SavedPath)) File.Delete(record.SavedPath);
            }
            catch
            {
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
            bool allowTheme = BoolValue(app, "allow_client_theme", true);
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

            RoundedPanel themeCard = new RoundedPanel
            {
                Left = 22,
                Top = 172,
                Width = 590,
                Height = 84,
                Radius = 14,
                BackColor = cardBack,
                BorderColor = Color.FromArgb(70, Line)
            };
            Label themeLabel = new Label { Left = 16, Top = 12, Width = 540, Height = 22, Text = "界面主题", ForeColor = labelColor, BackColor = Color.Transparent };
            ComboBox themeBox = new ComboBox
            {
                Left = 16,
                Top = 42,
                Width = 558,
                Height = 30,
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = fieldBack,
                ForeColor = TextColor,
                Enabled = allowTheme,
                FlatStyle = FlatStyle.Flat,
                DrawMode = DrawMode.OwnerDrawFixed,
                ItemHeight = 24
            };
            themeBox.DrawItem += DrawDarkComboItem;
            foreach (ThemeOption option in VisibleThemeOptions(app)) themeBox.Items.Add(option);
            string activeTheme = CurrentTheme(app);
            for (int i = 0; i < themeBox.Items.Count; i++)
            {
                ThemeOption option = themeBox.Items[i] as ThemeOption;
                if (option != null && option.Value.Equals(activeTheme, StringComparison.OrdinalIgnoreCase))
                {
                    themeBox.SelectedIndex = i;
                    break;
                }
            }
            if (themeBox.SelectedIndex < 0 && themeBox.Items.Count > 0) themeBox.SelectedIndex = 0;
            if (!allowTheme) themeLabel.Text = "界面主题（后台已关闭客户自定义）";

            RoundedPanel optionCard = new RoundedPanel
            {
                Left = 22,
                Top = 270,
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
                Top = 362,
                Width = 590,
                Height = 42,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                BackColor = Color.Transparent,
                Padding = new Padding(0, 2, 0, 0)
            };
            Button reset = MakeDialogButton("恢复默认");
            Button openFolder = MakeDialogButton("打开目录");
            actions.Controls.Add(reset);
            actions.Controls.Add(openFolder);

            browse.Click += delegate
            {
                using (FolderBrowserDialog folderDialog = new FolderBrowserDialog())
                {
                    folderDialog.Description = "选择软件下载保存路径";
                    string selected = Environment.ExpandEnvironmentVariables(pathBox.Text.Trim());
                    folderDialog.SelectedPath = Directory.Exists(selected) ? selected : DefaultDownloadDirectory();
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
            themeBox.SelectedIndexChanged += delegate
            {
                ThemeOption selectedTheme = themeBox.SelectedItem as ThemeOption;
                if (!allowTheme || selectedTheme == null) return;
                currentSettings.Theme = selectedTheme.Value;
                SaveClientSettings(currentSettings);
                ApplyTheme(selectedTheme.Value);
                BuildNav();
                RenderCurrentSections();
                UpdateModeButtons();
                status.Text = "主题已切换：" + selectedTheme.Label;
            };
            reset.Click += delegate
            {
                pathBox.Text = DefaultDownloadDirectory();
                SaveDownloadDirectory(pathBox.Text, currentSettings);
            };
            openFolder.Click += delegate
            {
                string dir = Environment.ExpandEnvironmentVariables(pathBox.Text.Trim());
                if (String.IsNullOrWhiteSpace(dir)) dir = DefaultDownloadDirectory();
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
            themeCard.Controls.Add(themeLabel);
            themeCard.Controls.Add(themeBox);
            optionCard.Controls.Add(optionLabel);
            optionCard.Controls.Add(autoStart);
            optionCard.Controls.Add(cleanOnExit);
            settingsPanel.Controls.Add(caption);
            settingsPanel.Controls.Add(close);
            settingsPanel.Controls.Add(pathCard);
            settingsPanel.Controls.Add(themeCard);
            settingsPanel.Controls.Add(optionCard);
            settingsPanel.Controls.Add(actions);
            close.BringToFront();
        }

        private void SaveDownloadDirectory(string dir, ClientSettings settings)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(dir)) dir = DefaultDownloadDirectory();
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
                return uri.GetLeftPart(UriPartial.Authority) + "/api/toolbox/popup-config";
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
                    if (!runtimeIntegrityChecked) EnsureRuntimeIntegrity();
                    string json = DownloadText(WithRuntimeToken(url + "?t=" + DateTime.UtcNow.Ticks));
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

        private sealed class ActionCard : Control
        {
            private bool hovered;
            public string Title = "";
            public string Subtitle = "";
            public string Description = "";
            public Image IconImage;
            public Color AccentColor = Accent;
            public bool ListMode;
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
                using (Pen border = new Pen(Color.FromArgb(76, Line), 1F))
                {
                    EnsureRoundedRegion(this, Radius, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }
                base.OnPaint(e);
            }
        }

        private sealed class EmptyStateLabel : Label
        {
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
                Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
                using (GraphicsPath path = UiRoundRect(rect, 12))
                using (SolidBrush bg = new SolidBrush(DialogCardBack()))
                using (Pen border = new Pen(Color.FromArgb(65, Line)))
                {
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }

                int iconSize = 24;
                Rectangle icon = new Rectangle((Width - iconSize) / 2, 14, iconSize, iconSize);
                using (GraphicsPath iconPath = UiRoundRect(icon, 8))
                using (SolidBrush iconBg = new SolidBrush(Color.FromArgb(42, 81, 104)))
                using (Pen iconPen = new Pen(Accent, 1.5F))
                {
                    e.Graphics.FillPath(iconBg, iconPath);
                    e.Graphics.DrawPath(iconPen, iconPath);
                    e.Graphics.DrawLine(iconPen, icon.Left + 7, icon.Top + 9, icon.Right - 7, icon.Top + 9);
                    e.Graphics.DrawLine(iconPen, icon.Left + 7, icon.Top + 14, icon.Right - 7, icon.Top + 14);
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(0, 44, Width, 24), ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
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
                Color fill = hovered ? HoverBackColor : BackColor;
                using (GraphicsPath path = UiRoundRect(rect, Radius))
                using (LinearGradientBrush bg = new LinearGradientBrush(rect, Color.FromArgb(Math.Min(255, fill.R + 5), Math.Min(255, fill.G + 5), Math.Min(255, fill.B + 5)), fill, LinearGradientMode.Vertical))
                using (Pen border = new Pen(hovered ? Color.FromArgb(150, Accent) : BorderColor, 1F))
                {
                    EnsureRoundedRegion(this, Radius, ref regionSize, ref regionRadius);
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(border, path);
                }
                TextRenderer.DrawText(e.Graphics, Text, Font, rect, ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
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

            public DownloadTask(string url, string fileName, string path)
            {
                Id = Guid.NewGuid().ToString("N");
                Url = url;
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

