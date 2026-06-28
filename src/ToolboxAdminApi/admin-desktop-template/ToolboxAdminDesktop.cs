using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("__EXE_TITLE__")]
[assembly: AssemblyDescription("__EXE_DESCRIPTION__")]
[assembly: AssemblyCompany("__EXE_COMPANY__")]
[assembly: AssemblyProduct("__EXE_PRODUCT__")]
[assembly: AssemblyCopyright("__EXE_COPYRIGHT__")]
[assembly: AssemblyVersion("__EXE_VERSION__")]
[assembly: AssemblyFileVersion("__EXE_FILE_VERSION__")]

namespace ToolboxAdminDesktop
{
    internal static class Program
    {
        internal const string AdminUrl = "__ADMIN_URL__";
        internal const string AppTitle = "__APP_TITLE__";
        internal const string LoginHint = "__LOGIN_HINT__";
        private const string UserDataFolder = "ToolboxAdminDesktop";

        [STAThread]
        private static void Main()
        {
            ConfigureNetworkSecurity();
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e)
            {
                ShowFriendlyError(e.Exception);
                Application.Exit();
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Exception ex = e.ExceptionObject as Exception;
                if (ex != null) ShowFriendlyError(ex);
            };
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                Application.Run(new LoginForm());
            }
            catch (Exception ex)
            {
                ShowFriendlyError(ex);
            }
        }

        private static void ConfigureNetworkSecurity()
        {
            ServicePointManager.Expect100Continue = false;
            ServicePointManager.DefaultConnectionLimit = 24;
            ServicePointManager.UseNagleAlgorithm = false;
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768 | SecurityProtocolType.Tls;
        }

        internal static string DataDir()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), UserDataFolder);
            Directory.CreateDirectory(dir);
            return dir;
        }

        internal static string CredentialPath()
        {
            return Path.Combine(DataDir(), "login.dat");
        }

        internal static string BrowserDataDir()
        {
            string dir = Path.Combine(DataDir(), "browser-profile");
            Directory.CreateDirectory(dir);
            return dir;
        }

        internal static string AdminBaseUrl()
        {
            string value = AdminUrl ?? "";
            try
            {
                Uri uri = new Uri(value);
                string root = uri.GetLeftPart(UriPartial.Authority);
                if (!String.IsNullOrWhiteSpace(root)) value = root;
            }
            catch { }
            while (value.Length > 0 && value[value.Length - 1] == '/')
            {
                value = value.Substring(0, value.Length - 1);
            }
            return value;
        }

        internal static void ShowFriendlyError(Exception ex)
        {
            string message = FriendlyExceptionMessage(ex);
            try { MessageBox.Show(message, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error); } catch { }
        }

        internal static string FriendlyExceptionMessage(Exception ex)
        {
            string message = ex == null ? "" : (ex.Message ?? "");
            if (message.IndexOf("Process has exited", StringComparison.OrdinalIgnoreCase) >= 0 || message.IndexOf("进程已退出", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "后台窗口启动失败，请关闭旧的后台 EXE 后重新打开。";
            }
            if (String.IsNullOrWhiteSpace(message))
            {
                return "程序遇到异常，请重新打开后台 EXE。";
            }
            return message;
        }
    }

    internal sealed class LoginForm : Form
    {
        private readonly TextBox usernameBox;
        private readonly TextBox passwordBox;
        private readonly Button passwordToggleButton;
        private readonly CheckBox rememberBox;
        private readonly CheckBox autoLoginBox;
        private readonly Label messageLabel;
        private readonly Button loginButton;
        private bool launching;
        private bool passwordVisible;

        public LoginForm()
        {
            Text = Program.AppTitle;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(420, 350);
            BackColor = Color.FromArgb(17, 20, 22);
            ForeColor = Color.FromArgb(237, 242, 244);
            Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            Label title = new Label
            {
                Left = 32,
                Top = 26,
                Width = 356,
                Height = 34,
                Text = String.IsNullOrWhiteSpace(Program.AppTitle) ? "工具箱后台登录" : Program.AppTitle,
                Font = new Font(Font.FontFamily, 18F, FontStyle.Bold),
                ForeColor = Color.White
            };
            Controls.Add(title);

            Label hint = new Label
            {
                Left = 32,
                Top = 64,
                Width = 356,
                Height = 34,
                Text = String.IsNullOrWhiteSpace(Program.LoginHint) ? "登录后直接进入后台配置中心。" : Program.LoginHint,
                ForeColor = Color.FromArgb(156, 168, 174)
            };
            Controls.Add(hint);

            Label userLabel = MakeLabel("用户名", 32, 108);
            Controls.Add(userLabel);
            usernameBox = MakeTextBox(32, 130, false);
            usernameBox.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            usernameBox.AutoCompleteSource = AutoCompleteSource.CustomSource;
            Controls.Add(usernameBox);

            Label passLabel = MakeLabel("密码", 32, 174);
            Controls.Add(passLabel);
            Panel passwordPanel = new Panel
            {
                Left = 32,
                Top = 196,
                Width = 356,
                Height = 28,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.FromArgb(13, 16, 18)
            };
            passwordPanel.Click += delegate { passwordBox.Focus(); };

            passwordBox = MakeTextBox(8, 5, true);
            passwordBox.Width = 300;
            passwordBox.Height = 20;
            passwordBox.BorderStyle = BorderStyle.None;
            passwordPanel.Controls.Add(passwordBox);

            passwordToggleButton = new Button
            {
                Left = 318,
                Top = 1,
                Width = 34,
                Height = 24,
                Text = "◎",
                BackColor = Color.FromArgb(13, 16, 18),
                ForeColor = Color.FromArgb(156, 168, 174),
                FlatStyle = FlatStyle.Flat,
                TabStop = false,
                Font = new Font("Segoe UI Symbol", 10F, FontStyle.Regular, GraphicsUnit.Point)
            };
            passwordToggleButton.FlatAppearance.BorderSize = 0;
            passwordToggleButton.Click += delegate { TogglePasswordVisibility(); };
            passwordPanel.Controls.Add(passwordToggleButton);
            Controls.Add(passwordPanel);

            rememberBox = new CheckBox
            {
                Left = 32,
                Top = 236,
                Width = 112,
                Height = 24,
                Text = "记住密码",
                ForeColor = Color.FromArgb(237, 242, 244),
                BackColor = BackColor
            };
            Controls.Add(rememberBox);

            autoLoginBox = new CheckBox
            {
                Left = 158,
                Top = 236,
                Width = 112,
                Height = 24,
                Text = "自动登录",
                ForeColor = Color.FromArgb(237, 242, 244),
                BackColor = BackColor
            };
            Controls.Add(autoLoginBox);

            loginButton = new Button
            {
                Left = 32,
                Top = 272,
                Width = 356,
                Height = 38,
                Text = "登录并进入后台",
                BackColor = Color.FromArgb(79, 183, 168),
                ForeColor = Color.FromArgb(6, 19, 17),
                FlatStyle = FlatStyle.Flat,
                Font = new Font(Font.FontFamily, 10F, FontStyle.Bold)
            };
            loginButton.FlatAppearance.BorderSize = 0;
            loginButton.Click += delegate { LoginAndOpen(); };
            Controls.Add(loginButton);

            messageLabel = new Label
            {
                Left = 32,
                Top = 318,
                Width = 356,
                Height = 24,
                ForeColor = Color.FromArgb(228, 93, 93)
            };
            Controls.Add(messageLabel);

            AcceptButton = loginButton;
            Load += delegate { LoadSavedCredential(); };
            Shown += delegate { TryAutoLogin(); };
            FormClosed += delegate { if (!launching) Application.Exit(); };
        }

        private static Label MakeLabel(string text, int left, int top)
        {
            return new Label { Left = left, Top = top, Width = 356, Height = 20, Text = text, ForeColor = Color.FromArgb(156, 168, 174) };
        }

        private TextBox MakeTextBox(int left, int top, bool password)
        {
            return new TextBox
            {
                Left = left,
                Top = top,
                Width = 356,
                Height = 28,
                UseSystemPasswordChar = password,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.FromArgb(13, 16, 18),
                ForeColor = Color.FromArgb(237, 242, 244)
            };
        }

        private void TogglePasswordVisibility()
        {
            passwordVisible = !passwordVisible;
            passwordBox.UseSystemPasswordChar = !passwordVisible;
            passwordToggleButton.Text = passwordVisible ? "○" : "◎";
            passwordBox.Focus();
            passwordBox.SelectionStart = passwordBox.TextLength;
        }

        private void LoadSavedCredential()
        {
            Credential credential = Credential.Load();
            if (credential == null) return;
            usernameBox.Text = credential.Username;
            passwordBox.Text = credential.Password;
            rememberBox.Checked = credential.RememberPassword;
            autoLoginBox.Checked = credential.AutoLogin;
        }

        private void TryAutoLogin()
        {
            if (!autoLoginBox.Checked || String.IsNullOrWhiteSpace(usernameBox.Text) || String.IsNullOrWhiteSpace(passwordBox.Text)) return;
            LoginAndOpen();
        }

        private void LoginAndOpen()
        {
            if (launching) return;
            messageLabel.ForeColor = Color.FromArgb(156, 168, 174);
            messageLabel.Text = "正在登录...";
            loginButton.Enabled = false;
            try
            {
                string username = usernameBox.Text.Trim();
                string password = passwordBox.Text;
                if (username.Length == 0 || password.Length == 0) throw new Exception("请输入用户名和密码。");
                LoginResult result = AdminApi.Login(username, password);
                if (rememberBox.Checked || autoLoginBox.Checked)
                {
                    Credential.Save(new Credential
                    {
                        Username = username,
                        Password = password,
                        RememberPassword = rememberBox.Checked,
                        AutoLogin = autoLoginBox.Checked
                    });
                }
                else
                {
                    Credential.Clear();
                }
                launching = true;
                AdminLauncher.OpenAdmin(result.Token);
                Hide();
            }
            catch (Exception ex)
            {
                launching = false;
                messageLabel.ForeColor = Color.FromArgb(228, 93, 93);
                messageLabel.Text = ex.Message;
                loginButton.Enabled = true;
            }
        }
    }

    internal static class AdminApi
    {
        internal static LoginResult Login(string username, string password)
        {
            return LoginInternal("/api/login", new { username = username, password = password });
        }

        internal static LoginResult Register(string username, string email, string displayName, string password, string inviteCode)
        {
            return RegisterInternal(new
            {
                username = username,
                email = email,
                displayName = displayName,
                password = password,
                inviteCode = inviteCode
            });
        }

        internal static LoginResult Register(string username, string password, string inviteCode)
        {
            return Register(username, "", "", password, inviteCode);
        }

        internal static LoginResult Register(params string[] args)
        {
            if (args == null || args.Length == 0) throw new Exception("注册参数不完整。");
            if (args.Length >= 5) return Register(args[0], args[1], args[2], args[3], args[4]);
            if (args.Length == 3) return Register(args[0], "", "", args[1], args[2]);
            throw new Exception("注册参数不完整。");
        }

        internal static string SendResetCode(string email)
        {
            return PostJson("/api/password/forgot", new { email = email });
        }

        internal static string SendResetCode(params string[] args)
        {
            string email = args != null && args.Length > 0 ? args[0] : "";
            return SendResetCode(email);
        }

        internal static string ResetPassword(string email, string code, string password)
        {
            return PostJson("/api/password/reset", new { email = email, code = code, password = password });
        }

        internal static string ResetPassword(params string[] args)
        {
            string email = args != null && args.Length > 0 ? args[0] : "";
            string code = args != null && args.Length > 1 ? args[1] : "";
            string password = args != null && args.Length > 2 ? args[2] : "";
            return ResetPassword(email, code, password);
        }

        internal static string PostJson(string path, object body)
        {
            return PostJson(path, new JavaScriptSerializer().Serialize(body));
        }

        internal static string PostJson(string path, string body)
        {
            string url = path;
            if (!path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !path.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                url = Program.AdminBaseUrl() + path;
            }
            return PostJsonRaw(url, Encoding.UTF8.GetBytes(body ?? "{}"), "请求失败，请检查后台地址。");
        }

        private static LoginResult LoginInternal(string path, object body)
        {
            string text = PostJson(path, body);
            return ParseLoginResult(text, "后台没有返回登录凭证。");
        }

        private static LoginResult RegisterInternal(object body)
        {
            string text = PostJson("/api/register", body);
            return ParseLoginResult(text, "后台没有返回注册凭证。");
        }

        private static LoginResult ParseLoginResult(string text, string defaultMessage)
        {
            LoginResponse parsed = new JavaScriptSerializer().Deserialize<LoginResponse>(text);
            if (parsed == null || String.IsNullOrWhiteSpace(parsed.token)) throw new Exception(defaultMessage);
            return new LoginResult { Token = parsed.token };
        }

        private static string PostJsonRaw(string url, byte[] payload, string defaultMessage)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json; charset=utf-8";
            req.Accept = "application/json";
            req.Timeout = 15000;
            req.ContentLength = payload.Length;
            using (Stream stream = req.GetRequestStream()) stream.Write(payload, 0, payload.Length);
            try
            {
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                {
                    return reader.ReadToEnd();
                }
            }
            catch (WebException ex)
            {
                string detail = defaultMessage;
                if (ex.Response != null)
                {
                    using (StreamReader reader = new StreamReader(ex.Response.GetResponseStream(), Encoding.UTF8))
                    {
                        string text = reader.ReadToEnd();
                        ErrorResponse parsed = null;
                        try { parsed = new JavaScriptSerializer().Deserialize<ErrorResponse>(text); } catch { }
                        if (parsed != null && !String.IsNullOrWhiteSpace(parsed.error)) detail = parsed.error;
                    }
                }
                throw new Exception(detail);
            }
        }

        private static LoginResult PostLogin(string url, byte[] payload)
        {
            string text = PostJsonRaw(url, payload, "登录失败，请检查账号、密码或服务器地址。");
            return ParseLoginResult(text, "后台没有返回登录凭证。");
        }
    }

    internal static class AdminLauncher
    {
        internal static void OpenAdmin(string token)
        {
            string browser = FindEdgeOrChrome();
            if (String.IsNullOrWhiteSpace(browser))
            {
                throw new Exception("未找到 Microsoft Edge 或 Chrome，无法打开后台窗口。");
            }

            string url = BuildAdminUrl(token);
            BrowserHostForm form = new BrowserHostForm(browser, url);
            form.FormClosed += delegate { Application.Exit(); };
            form.Show();
        }

        private static string BuildAdminUrl(string token)
        {
            string sep = Program.AdminBaseUrl().Contains("?") ? "&" : "?";
            long stamp = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
            return Program.AdminBaseUrl() + "/" + sep + "desktopToken=" + Uri.EscapeDataString(token) + "&desktop=1&_t=" + stamp;
        }

        private static string FindEdgeOrChrome()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };
            foreach (string path in candidates)
            {
                if (File.Exists(path)) return path;
            }
            return "";
        }

        internal static string QuoteArg(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }

    internal sealed class BrowserHostForm : Form
    {
        private const int GWL_STYLE = -16;
        private const int WS_CHILD = 0x40000000;
        private const int WS_VISIBLE = 0x10000000;
        private const int WS_CAPTION = 0x00C00000;
        private const int WS_THICKFRAME = 0x00040000;
        private const int WS_SYSMENU = 0x00080000;
        private const int WS_MINIMIZEBOX = 0x00020000;
        private const int WS_MAXIMIZEBOX = 0x00010000;
        private const int WS_POPUP = unchecked((int)0x80000000);
        private const int SW_SHOW = 5;
        private const int WM_CLOSE = 0x0010;

        private readonly string browserPath;
        private readonly string adminUrl;
        private readonly Panel hostPanel;
        private Process browserProcess;
        private IntPtr browserWindow;
        private int browserProcessId;
        private string profileDir;

        public BrowserHostForm(string browserPath, string adminUrl)
        {
            this.browserPath = browserPath;
            this.adminUrl = adminUrl;
            Text = String.IsNullOrWhiteSpace(Program.AppTitle) ? "工具箱后台" : Program.AppTitle;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(900, 600);
            WindowState = FormWindowState.Maximized;
            BackColor = Color.FromArgb(17, 20, 22);

            hostPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Black
            };
            Controls.Add(hostPanel);

            Shown += delegate { StartBrowser(); };
            Resize += delegate { ResizeBrowser(); };
            FormClosed += delegate { CleanupBrowser(); };
        }

        private void StartBrowser()
        {
            try
            {
                profileDir = Path.Combine(Program.BrowserDataDir(), "hosted-" + Process.GetCurrentProcess().Id.ToString());
                Directory.CreateDirectory(profileDir);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = browserPath;
                psi.UseShellExecute = false;
                DateTime launchedAt = DateTime.Now;
                psi.Arguments = String.Join(" ", new string[]
                {
                    "--app=" + AdminLauncher.QuoteArg(adminUrl),
                    "--new-window",
                    "--user-data-dir=" + AdminLauncher.QuoteArg(profileDir),
                    "--no-first-run",
                    "--disable-background-networking",
                    "--disable-features=TranslateUI",
                    "--disk-cache-size=1",
                    "--media-cache-size=1"
                });
                browserProcess = Process.Start(psi);
                if (browserProcess == null) throw new Exception("后台窗口启动失败，请确认 Edge 或 Chrome 可以正常启动。");
                browserProcessId = SafeProcessId(browserProcess);
                browserWindow = WaitForBrowserWindow(browserProcess, browserProcessId, launchedAt, 20000);
                if (browserWindow == IntPtr.Zero) throw new Exception("后台窗口启动失败，请关闭已打开的后台 EXE 后重试。");
                EmbedBrowserWindow();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        }

        private IntPtr WaitForBrowserWindow(Process process, int launchedProcessId, DateTime launchedAt, int timeoutMs)
        {
            DateTime end = DateTime.Now.AddMilliseconds(timeoutMs);
            string processName = Path.GetFileNameWithoutExtension(browserPath);
            while (DateTime.Now < end)
            {
                if (process != null)
                {
                    IntPtr mainWindow = SafeMainWindowHandle(process);
                    if (mainWindow != IntPtr.Zero) return mainWindow;
                }

                if (launchedProcessId > 0)
                {
                    IntPtr ownWindow = FindWindowForProcess(launchedProcessId);
                    if (ownWindow != IntPtr.Zero) return ownWindow;
                }

                try
                {
                    IntPtr found = FindRecentBrowserWindow(processName, launchedAt);
                    if (found != IntPtr.Zero) return found;
                }
                catch { }
                Thread.Sleep(100);
            }
            return IntPtr.Zero;
        }

        private static int SafeProcessId(Process process)
        {
            try { return process == null ? 0 : process.Id; } catch { return 0; }
        }

        private static bool SafeHasExited(Process process)
        {
            try { return process == null || process.HasExited; } catch { return true; }
        }

        private static IntPtr SafeMainWindowHandle(Process process)
        {
            try
            {
                if (process == null) return IntPtr.Zero;
                process.Refresh();
                if (SafeHasExited(process)) return IntPtr.Zero;
                return process.MainWindowHandle;
            }
            catch { return IntPtr.Zero; }
        }

        private static DateTime SafeStartTime(Process process)
        {
            try { return process == null ? DateTime.MinValue : process.StartTime; } catch { return DateTime.MinValue; }
        }

        private static IntPtr FindRecentBrowserWindow(string processName, DateTime launchedAt)
        {
            if (String.IsNullOrWhiteSpace(processName)) return IntPtr.Zero;
            Process[] processes = Process.GetProcessesByName(processName);
            foreach (Process process in processes)
            {
                try
                {
                    int id = SafeProcessId(process);
                    if (id <= 0) continue;
                    DateTime started = SafeStartTime(process);
                    if (started != DateTime.MinValue && started < launchedAt.AddSeconds(-3)) continue;
                    IntPtr mainWindow = SafeMainWindowHandle(process);
                    if (mainWindow != IntPtr.Zero) return mainWindow;
                    IntPtr found = FindWindowForProcess(id);
                    if (found != IntPtr.Zero) return found;
                }
                catch { }
                finally
                {
                    try { process.Dispose(); } catch { }
                }
            }
            return IntPtr.Zero;
        }

        private static IntPtr FindWindowForProcess(int processId)
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
            {
                try
                {
                    int windowProcessId;
                    GetWindowThreadProcessId(hWnd, out windowProcessId);
                    if (windowProcessId == processId && IsWindowVisible(hWnd))
                    {
                        found = hWnd;
                        return false;
                    }
                }
                catch { }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        private void EmbedBrowserWindow()
        {
            if (browserWindow == IntPtr.Zero || !IsWindow(browserWindow)) throw new Exception("后台窗口启动失败，请重新打开后台 EXE。");
            SetParent(browserWindow, hostPanel.Handle);
            int style = GetWindowLong(browserWindow, GWL_STYLE);
            style = (style | WS_CHILD | WS_VISIBLE) & ~WS_POPUP & ~WS_CAPTION & ~WS_THICKFRAME & ~WS_SYSMENU & ~WS_MINIMIZEBOX & ~WS_MAXIMIZEBOX;
            SetWindowLong(browserWindow, GWL_STYLE, style);
            ShowWindow(browserWindow, SW_SHOW);
            ResizeBrowser();
        }

        private void ResizeBrowser()
        {
            if (browserWindow == IntPtr.Zero) return;
            if (!IsWindow(browserWindow))
            {
                browserWindow = IntPtr.Zero;
                return;
            }
            MoveWindow(browserWindow, 0, 0, hostPanel.ClientSize.Width, hostPanel.ClientSize.Height, true);
        }

        private void CleanupBrowser()
        {
            int windowProcessId = 0;
            try
            {
                if (browserWindow != IntPtr.Zero && IsWindow(browserWindow))
                {
                    GetWindowThreadProcessId(browserWindow, out windowProcessId);
                    PostMessage(browserWindow, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    Thread.Sleep(150);
                }
            }
            catch { }
            try
            {
                if (browserProcess != null && !SafeHasExited(browserProcess)) browserProcess.Kill();
            }
            catch { }
            try
            {
                if (windowProcessId > 0 && windowProcessId != browserProcessId)
                {
                    Process process = Process.GetProcessById(windowProcessId);
                    if (!SafeHasExited(process)) process.Kill();
                    process.Dispose();
                }
            }
            catch { }
            try
            {
                if (!String.IsNullOrWhiteSpace(profileDir) && Directory.Exists(profileDir)) Directory.Delete(profileDir, true);
            }
            catch { }
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool PostMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll")]
        private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }

    internal sealed class Credential
    {
        public string Username { get; set; }
        public string Password { get; set; }
        public bool RememberPassword { get; set; }
        public bool AutoLogin { get; set; }

        public static Credential Load()
        {
            try
            {
                string path = Program.CredentialPath();
                if (!File.Exists(path)) return null;
                byte[] protectedBytes = File.ReadAllBytes(path);
                byte[] jsonBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                return new JavaScriptSerializer().Deserialize<Credential>(Encoding.UTF8.GetString(jsonBytes));
            }
            catch
            {
                return null;
            }
        }

        public static void Save(Credential credential)
        {
            string json = new JavaScriptSerializer().Serialize(credential);
            byte[] data = ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(Program.CredentialPath(), data);
        }

        public static void Clear()
        {
            try
            {
                string path = Program.CredentialPath();
                if (File.Exists(path)) File.Delete(path);
            }
            catch { }
        }
    }

    internal sealed class LoginResult
    {
        public string Token;
    }

    internal sealed class LoginResponse
    {
        public string token { get; set; }
    }

    internal sealed class ErrorResponse
    {
        public string error { get; set; }
    }
}
