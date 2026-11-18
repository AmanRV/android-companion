using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Android Companion")]
[assembly: AssemblyDescription("USB dashboard and local media controller")]
[assembly: AssemblyProduct("Android Companion")]

internal static class TrayHost
{
    internal const string OpenEvent = @"Local\AndroidCompanion.Open";
    internal const string ExitEvent = @"Local\AndroidCompanion.Exit";
    [STAThread] static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--exit") { Signal(ExitEvent); return 0; }
        bool first;
        using (var mutex = new Mutex(true, @"Local\AndroidCompanion.Tray", out first))
        {
            if (!first) { Signal(OpenEvent); return 0; }
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                string adb = null; var monitorArgs = new List<string>();
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--adb" && i + 1 < args.Length) adb = args[++i];
                    else monitorArgs.Add(args[i]);
                }
                using (var context = new CompanionContext(adb, monitorArgs.ToArray())) Application.Run(context);
                return 0;
            }
            catch (Exception e) { MessageBox.Show(e.Message, "Android Companion", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
            finally { mutex.ReleaseMutex(); }
        }
    }
    static void Signal(string name) { try { using (var signal = EventWaitHandle.OpenExisting(name)) signal.Set(); } catch (WaitHandleCannotBeOpenedException) { } }
}

internal sealed class CompanionContext : ApplicationContext
{
    readonly Control dispatch = new Control();
    readonly NotifyIcon tray;
    readonly Icon icon;
    readonly ToolStripMenuItem status;
    readonly Thread server;
    readonly System.Threading.Timer usb;
    readonly EventWaitHandle openEvent = new EventWaitHandle(false, EventResetMode.AutoReset, TrayHost.OpenEvent);
    readonly EventWaitHandle exitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, TrayHost.ExitEvent);
    readonly RegisteredWaitHandle openWait, exitWait;
    readonly object adbGate = new object();
    static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
    static readonly string LocalConfig = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AndroidCompanion", "adb-path.txt");
    string adbPath;
    volatile bool closing, connected;
    int pollBusy, openRequested = 1;
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);

    internal CompanionContext(string adb, string[] args)
    {
        dispatch.CreateControl();
        adbPath = FindAdb(adb);
        icon = MakeIcon();
        var menu = new ContextMenuStrip();
        status = new ToolStripMenuItem("Starting...") { Enabled = false };
        menu.Items.Add(status); menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Open dashboard on phone", null, delegate { RequestOpen(); });
        menu.Items.Add("Open dashboard on PC", null, delegate { try { Process.Start("http://127.0.0.1:8765/"); } catch (Exception e) { ShowError(e.Message); } });
        menu.Items.Add("Select ADB executable...", null, delegate { ChooseAdb(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit Android Companion", null, delegate { Shutdown(); });
        tray = new NotifyIcon { Icon = icon, Text = "Android Companion", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { RequestOpen(); };
        server = new Thread(() => {
            int result;
            try { result = MonitorApp.Run(args); }
            catch (Exception e) { Post(() => ShowError(e.Message)); result = 1; }
            if (!closing) Post(() => { if (result != 0) ShowError("The local service could not start. Another dashboard may already be using port 8765."); Shutdown(); });
        }) { IsBackground = true, Name = "local HTTP service" };
        server.Start();
        usb = new System.Threading.Timer(delegate { PollUsb(); }, null, 1000, 5000);
        openWait = ThreadPool.RegisterWaitForSingleObject(openEvent, delegate { Post(RequestOpen); }, null, -1, false);
        exitWait = ThreadPool.RegisterWaitForSingleObject(exitEvent, delegate { Post(Shutdown); }, null, -1, false);
        if (adbPath == null) Post(ChooseAdb);
    }
    static Icon MakeIcon()
    {
        using (var bitmap = new Bitmap(32, 32))
        using (var graphics = Graphics.FromImage(bitmap))
        using (var pen = new Pen(Color.FromArgb(210, 215, 220), 2))
        using (var brush = new SolidBrush(Color.FromArgb(210, 215, 220)))
        {
            graphics.Clear(Color.Transparent); graphics.DrawRectangle(pen, 2, 4, 27, 22);
            graphics.FillRectangle(brush, 8, 11, 5, 9); graphics.FillRectangle(brush, 19, 11, 5, 9);
            IntPtr handle = bitmap.GetHicon(); try { return (Icon)Icon.FromHandle(handle).Clone(); } finally { DestroyIcon(handle); }
        }
    }
    void Post(Action action) { if (!dispatch.IsDisposed) try { dispatch.BeginInvoke(action); } catch (InvalidOperationException) { } }
    void ShowError(string message) { tray.ShowBalloonTip(5000, "Android Companion", message, ToolTipIcon.Warning); }
    void SetStatus(string text) { Post(() => { if (closing) return; status.Text = text; tray.Text = "Android Companion - " + text; }); }
    void RequestOpen() { Interlocked.Exchange(ref openRequested, 1); if (adbPath == null) ChooseAdb(); else ThreadPool.QueueUserWorkItem(delegate { PollUsb(); }); }
    void ChooseAdb()
    {
        using (var picker = new OpenFileDialog { Title = "Select Google's platform-tools adb.exe", Filter = "Android Debug Bridge (adb.exe)|adb.exe", CheckFileExists = true })
        {
            if (picker.ShowDialog() != DialogResult.OK) { if (adbPath == null) SetStatus("ADB not configured"); return; }
            lock (adbGate) adbPath = picker.FileName;
            try { Directory.CreateDirectory(Path.GetDirectoryName(LocalConfig)); File.WriteAllText(LocalConfig, adbPath); } catch (Exception e) { ShowError("ADB works for this run, but its location could not be saved: " + e.Message); }
            connected = false; Interlocked.Exchange(ref openRequested, 1);
            ThreadPool.QueueUserWorkItem(delegate { PollUsb(); });
        }
    }
    static string FindAdb(string supplied)
    {
        var candidates = new List<string>();
        if (!String.IsNullOrEmpty(supplied)) candidates.Add(supplied);
        try { if (File.Exists(LocalConfig)) candidates.Add(File.ReadAllText(LocalConfig).Trim()); } catch { }
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Android\Sdk\platform-tools\adb.exe"));
        candidates.Add(Path.GetFullPath(Path.Combine(Root, "..", "platform-tools", "adb.exe")));
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            try { candidates.Add(Path.Combine(directory.Trim('"'), "adb.exe")); } catch { }
        foreach (string path in candidates) if (File.Exists(path)) return Path.GetFullPath(path);
        return null;
    }
    // Only fixed ADB operations are allowed here; no shell input from HTTP or media metadata.
    string Adb(string arguments)
    {
        string path; lock (adbGate) path = adbPath;
        if (path == null) return null;
        try
        {
            using (var process = new Process { StartInfo = new ProcessStartInfo(path, "-d " + arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } })
            {
                process.Start(); var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(2500)) { try { process.Kill(); } catch { } return null; }
                return process.ExitCode == 0 ? output.GetAwaiter().GetResult().Trim() : null;
            }
        }
        catch { return null; }
    }
    void PollUsb()
    {
        if (closing || Interlocked.Exchange(ref pollBusy, 1) != 0) return;
        try
        {
            if (adbPath == null) { SetStatus("ADB not configured"); return; }
            if (Adb("get-state") != "device") { connected = false; SetStatus("Waiting for USB phone"); return; }
            if (Adb("reverse tcp:8765 tcp:8765") == null) { connected = false; SetStatus("USB tunnel unavailable"); return; }
            bool open = Interlocked.Exchange(ref openRequested, 0) != 0;
            if (!connected || open)
            {
                int mask; if (Int32.TryParse(Adb("shell settings get global stay_on_while_plugged_in"), out mask)) Adb("shell settings put global stay_on_while_plugged_in " + (mask | 2));
                string installed = Adb("shell pm path com.androidcompanion.dashboard");
                string result = Adb(installed != null && installed.StartsWith("package:", StringComparison.Ordinal)
                    ? "shell am start -n com.androidcompanion.dashboard/.MainActivity"
                    : "shell am start -a android.intent.action.VIEW -d http://127.0.0.1:8765/");
                if (result == null) { SetStatus("Phone launch failed"); return; }
            }
            connected = true; SetStatus("USB phone connected");
        }
        finally { Interlocked.Exchange(ref pollBusy, 0); }
    }
    void Shutdown()
    {
        if (closing) return; closing = true; status.Text = "Exiting...";
        usb.Change(Timeout.Infinite, Timeout.Infinite);
        ThreadPool.QueueUserWorkItem(delegate {
            // Let an in-flight reconnect finish before removing our tunnel.
            for (int i = 0; i < 100 && Interlocked.CompareExchange(ref pollBusy, 0, 0) != 0; i++) Thread.Sleep(100);
            // Remove the tunnel while its destination is still listening; some ADB
            // versions stall removal when the phone is retrying a dead destination.
            Adb("reverse --remove tcp:8765");
            MonitorApp.Stop(); server.Join(5000);
            Post(ExitThread);
        });
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { usb.Dispose(); openWait.Unregister(null); exitWait.Unregister(null); openEvent.Dispose(); exitEvent.Dispose(); tray.Visible = false; tray.ContextMenuStrip.Dispose(); tray.Dispose(); icon.Dispose(); dispatch.Dispose(); }
        base.Dispose(disposing);
    }
}
