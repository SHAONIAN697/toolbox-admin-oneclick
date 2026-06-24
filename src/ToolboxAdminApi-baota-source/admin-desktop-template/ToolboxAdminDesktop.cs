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
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LoginForm());
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
    }

    internal sealed class LoginForm : Form
    {
        private readonly TextBox usernameBox;
        private readonly TextBox passwordBox;
        private readonly CheckBox rememberBox;
        private readonly CheckBox autoLoginBox;
        private readonly Label messageLabel;
        private readonly Button loginButton;
        private bool launching;

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
            passwordBox = MakeTextBox(32, 196, true);
            Controls.Add(passwordBox);

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
                Close();
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
            string url = Program.AdminBaseUrl() + "/desktop/login";
            string body = new JavaScriptSerializer().Serialize(new { username = username, password = password });
            byte[] payload = Encoding.UTF8.GetBytes(body);
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
                    string text = reader.ReadToEnd();
                    LoginResponse parsed = new JavaScriptSerializer().Deserialize<LoginResponse>(text);
                    if (parsed == null || String.IsNullOrWhiteSpace(parsed.token)) throw new Exception("后台没有返回登录凭证。");
                    return new LoginResult { Token = parsed.token };
                }
            }
            catch (WebException ex)
            {
                string detail = "登录失败，请检查账号、密码或服务器地址。";
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
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = browser;
            psi.UseShellExecute = false;
            psi.Arguments = String.Join(" ", new string[]
            {
                "--app=" + QuoteArg(url),
                "--user-data-dir=" + QuoteArg(Program.BrowserDataDir()),
                "--no-first-run",
                "--disable-background-networking",
                "--disable-features=TranslateUI",
                "--disk-cache-size=1",
                "--media-cache-size=1"
            });
            Process.Start(psi);
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

        private static string QuoteArg(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
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
