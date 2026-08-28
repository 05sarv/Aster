// ASTER desktop shell — native WebView2 host (~1 MB exe, no bundled browser).
// The web app, the WebView2 managed DLLs and the native loader are all embedded
// as resources; they are extracted to %LOCALAPPDATA%\ASTER on first run.
// Built with the in-box C# 5 compiler (no modern syntax below).
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Aster
{
#if CLEAN
    // ASTER Clean build: own identity, own data folder, own origin — coexists with ASTER.
    internal static class Variant
    {
        public const string Title = "ASTER Clean";
        public const string VHost = "clean.aster";
        public const string DataDirName = "ASTER-Clean";
        public const string MutexName = "ASTER-Clean-SingleInstance";
    }
#else
    internal static class Variant
    {
        public const string Title = "ASTER";
        public const string VHost = "app.aster";
        public const string DataDirName = "ASTER";
        public const string MutexName = "ASTER-Desktop-SingleInstance";
    }
#endif
    static class Program
    {
        internal static readonly string DataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Variant.DataDirName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetDllDirectory(string path);

        [STAThread]
        static void Main()
        {
            bool createdNew;
            Mutex mutex = new Mutex(true, Variant.MutexName, out createdNew);
            if (!createdNew) return;

            // The native loader must exist on disk before any WebView2 call.
            try
            {
                string binDir = Path.Combine(DataDir, "bin");
                Directory.CreateDirectory(binDir);
                string loaderPath = Path.Combine(binDir, "WebView2Loader.dll");
                if (!File.Exists(loaderPath))
                    File.WriteAllBytes(loaderPath, ReadResource("Aster.WebView2Loader.dll"));
                SetDllDirectory(binDir);
            }
            catch (Exception) { }

            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbedded;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            GC.KeepAlive(mutex);
        }

        internal static byte[] ReadResource(string name)
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (s == null) throw new FileNotFoundException("embedded resource missing: " + name);
                byte[] buf = new byte[s.Length];
                int read = 0;
                while (read < buf.Length) read += s.Read(buf, read, buf.Length - read);
                return buf;
            }
        }

        // Load the WebView2 managed assemblies from inside this exe.
        static Assembly ResolveEmbedded(object sender, ResolveEventArgs args)
        {
            string name = new AssemblyName(args.Name).Name;
            if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms") return null;
            try { return Assembly.Load(ReadResource("Aster." + name + ".dll")); }
            catch (Exception) { return null; }
        }
    }

    internal class MainForm : Form
    {
        private WebView2 web;
        private bool appFilesRewritten;
        private NotifyIcon tray;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        public MainForm()
        {
            Text = Variant.Title;
            ClientSize = new System.Drawing.Size(1280, 820);
            MinimumSize = new System.Drawing.Size(680, 560);
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch (Exception) { }
            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);
            Load += delegate { Init(); };
        }

        async void Init()
        {
            try
            {
                string appDir = ExtractAppFiles();
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(
                    null, Path.Combine(Program.DataDir, "WebView2"), new CoreWebView2EnvironmentOptions());
                await web.EnsureCoreWebView2Async(env);
                CoreWebView2 core = web.CoreWebView2;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.DocumentTitleChanged += (s, e) => { Text = core.DocumentTitle; };
                core.NewWindowRequested += (s, e) => { e.Handled = true; };

                // Backup export (blob <a download>) → real save dialog, no download bar.
                core.DownloadStarting += (s, e) =>
                {
                    SaveFileDialog dlg = new SaveFileDialog();
                    string def = e.ResultFilePath; // default path already contains the suggested name
                    dlg.FileName = string.IsNullOrEmpty(def) ? "aster-backup.json" : Path.GetFileName(def);
                    dlg.Filter = "JSON backup|*.json|All files|*.*";
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                    {
                        e.ResultFilePath = dlg.FileName;
                        e.Handled = true;
                    }
                    else e.Cancel = true;
                };

                // Same pattern as the Android shell: app served from a virtual https origin,
                // so ES modules, localStorage and IndexedDB behave exactly like on the web.
                core.SetVirtualHostNameToFolderMapping(Variant.VHost, appDir, CoreWebView2HostResourceAccessKind.Allow);
                // After an app update the HTTP cache may still hold the old modules — drop just
                // the disk cache (localStorage/IndexedDB are untouched) so the new code loads.
                if (appFilesRewritten)
                {
                    try { await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache); }
                    catch (Exception) { }
                }

                /* Native bits: tray notifications + window chrome that follows the app theme.
                 * The page posts {aster:"notify"| "theme"} via chrome.webview.postMessage. */
                tray = new NotifyIcon();
                tray.Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                tray.Visible = true;
                tray.Text = Variant.Title;
                tray.BalloonTipClicked += delegate { Show(); Activate(); };
                core.WebMessageReceived += OnWebMessage;

                core.Navigate("https://" + Variant.VHost + "/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show("ASTER could not start its web view:\n" + ex.Message, "ASTER",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string json;
                try { json = e.TryGetWebMessageAsString(); } catch (Exception) { return; }
                var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                if (data == null || !data.ContainsKey("aster")) return;
                string kind = (string)data["aster"];
                if (kind == "theme")
                {
                    bool dark = data.ContainsKey("dark") && (bool)data["dark"];
                    string hex = (data.ContainsKey("accent") ? data["accent"] as string : null) ?? "#ff8a5c";
                    ApplyWindowChrome(dark, hex);
                }
                else if (kind == "notify")
                {
                    string title = (data.ContainsKey("title") ? data["title"] as string : null) ?? Variant.Title;
                    string body = data.ContainsKey("body") ? data["body"] as string : "";
                    ShowBalloon(title, body);
                }
            }
            catch (Exception) { }
        }

        void ShowBalloon(string title, string body)
        {
            if (InvokeRequired) { BeginInvoke((MethodInvoker)delegate { ShowBalloon(title, body); }); return; }
            try
            {
                tray.BalloonTipTitle = title;
                tray.BalloonTipText = body;
                tray.ShowBalloonTip(6000);
            }
            catch (Exception) { }
        }

        /// Match the window chrome to the app: dark/light title bar + accent-colored border (Win11).
        void ApplyWindowChrome(bool dark, string accentHex)
        {
            if (InvokeRequired) { BeginInvoke((MethodInvoker)delegate { ApplyWindowChrome(dark, accentHex); }); return; }
            try
            {
                IntPtr hwnd = Handle;
                int d = dark ? 1 : 0;
                DwmSetWindowAttribute(hwnd, 20, ref d, 4);          // DWMWA_USE_IMMERSIVE_DARK_MODE
                int fallback = d;
                DwmSetWindowAttribute(hwnd, 19, ref fallback, 4);   // same on older Win10 builds
                int border = HexToColorRef(accentHex);
                if (border != -2) DwmSetWindowAttribute(hwnd, 34, ref border, 4); // DWMWA_BORDER_COLOR
            }
            catch (Exception) { }
        }

        /// "#rrggbb" → COLORREF (0x00BBGGRR); -2 leaves the default.
        static int HexToColorRef(string hex)
        {
            try
            {
                string h = (hex ?? "").Trim().TrimStart('#');
                if (h.Length == 8) h = h.Substring(2);
                if (h.Length != 6) return -2;
                byte r = Convert.ToByte(h.Substring(0, 2), 16);
                byte g = Convert.ToByte(h.Substring(2, 2), 16);
                byte b = Convert.ToByte(h.Substring(4, 2), 16);
                return (b << 16) | (g << 8) | r;
            }
            catch (Exception) { return -2; }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; }
            base.OnFormClosed(e);
        }

        /// Extract the embedded web app to %LOCALAPPDATA%\ASTER\app when its contents change.
        string ExtractAppFiles()
        {
            string dir = Path.Combine(Program.DataDir, "app");
            Directory.CreateDirectory(dir);
            string marker = Path.Combine(dir, ".version");
            string[] lines = Encoding.UTF8.GetString(Program.ReadResource("Aster.files.manifest")).Split('\n');
            Dictionary<string, byte[]> files = new Dictionary<string, byte[]>();
            foreach (string line in lines)
            {
                string rel = line.Trim();
                if (rel.Length == 0) continue;
                files[rel] = Program.ReadResource("Aster.app." + rel.Replace('/', '.'));
            }
            // Hash names + contents, so any code change triggers a re-extract.
            string hash;
            using (SHA256 sha = SHA256.Create())
            {
                foreach (KeyValuePair<string, byte[]> kv in files)
                {
                    byte[] name = Encoding.UTF8.GetBytes(kv.Key);
                    sha.TransformBlock(name, 0, name.Length, null, 0);
                    sha.TransformBlock(kv.Value, 0, kv.Value.Length, null, 0);
                }
                byte[] empty = new byte[0];
                sha.TransformFinalBlock(empty, 0, 0);
                hash = Convert.ToBase64String(sha.Hash);
            }
            if (File.Exists(marker) && File.ReadAllText(marker) == hash) return dir;

            appFilesRewritten = File.Exists(marker); // rewrite on update, plain first run otherwise
            foreach (KeyValuePair<string, byte[]> kv in files)
            {
                string dest = Path.Combine(dir, kv.Key.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                File.WriteAllBytes(dest, kv.Value);
            }
            File.WriteAllText(marker, hash);
            return dir;
        }
    }
}
