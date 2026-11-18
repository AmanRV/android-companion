using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Loopback telemetry and a fixed Windows media-control allowlist. No remote assets or shell commands.
internal static class MonitorApp
{
    const int Port = 8765;
    static readonly object Gate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly string Web = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "web"));
    static string fpsCsv, game;
    static volatile bool running = true;
    static Snapshot current = new Snapshot();
    static ulong lastIdle, lastKernel, lastUser;
    static IntPtr nvmlDevice;
    static bool nvmlReady;
    static IntPtr adlContext;
    static bool adlReady;
    static int adlAdapter = -1;
    static double? adlVramTotalGiB;
    static bool adlFrameReady;
    static DateTime nextDiskRefresh = DateTime.MinValue;
    static DiskSnapshot[] cachedDisks = new DiskSnapshot[0];
    static readonly AdlAlloc AdlAllocator = size => Marshal.AllocHGlobal(size);
    static readonly string HostName = Environment.MachineName.ToLowerInvariant();
    static readonly string CpuName = ReadCpuName();
    static readonly string GpuName = ReadGpuName();
    static DateTime nextGpuRefresh = DateTime.MinValue;
    static readonly List<PerformanceCounter> gpuCounters = new List<PerformanceCounter>();

    sealed class Snapshot
    {
        public string time = DateTime.UtcNow.ToString("o");
        public string hostName = HostName, cpuName = CpuName, gpuName = GpuName;
        public double? cpu, gpu, gpuTemp, fps;
        public double? cpuTemp = null; // No universal CPU temperature API on Windows.
        public double ramUsedGiB, ramTotalGiB, ramPercent;
        public double? vramUsedGiB, vramTotalGiB, vramPercent;
        public DiskSnapshot[] disks = new DiskSnapshot[0];
        public string gpuSource = "unavailable", fpsSource = "unavailable";
    }
    sealed class DiskSnapshot
    {
        public string name;
        public double usedGiB, totalGiB, percent;
    }
    [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint low, high; public ulong Value { get { return ((ulong)high << 32) | low; } } }
    [StructLayout(LayoutKind.Sequential)] struct MemoryStatus
    {
        public uint length, memoryLoad;
        public ulong totalPhysical, availablePhysical, totalPageFile, availablePageFile, totalVirtual, availableVirtual, availableExtendedVirtual;
    }
    [StructLayout(LayoutKind.Sequential)] struct NvmlUtilization { public uint gpu, memory; }
    [StructLayout(LayoutKind.Sequential)] struct NvmlMemory { public ulong total, free, used; }
    [StructLayout(LayoutKind.Sequential)] struct AdlMemoryInfo2
    {
        public long size;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public byte[] type;
        public long bandwidth, hyper, invisible, visible;
    }
    [StructLayout(LayoutKind.Sequential)] struct AdlSensor { public int supported, value; }
    [StructLayout(LayoutKind.Sequential)] struct AdlLog
    {
        public int size;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public AdlSensor[] sensors;
    }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr AdlAlloc(int size);
    [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [DllImport("nvml.dll", EntryPoint = "nvmlInit_v2")] static extern int NvmlInit();
    [DllImport("nvml.dll", EntryPoint = "nvmlShutdown")] static extern int NvmlShutdown();
    [DllImport("nvml.dll", EntryPoint = "nvmlDeviceGetHandleByIndex_v2")] static extern int NvmlGetDevice(uint index, out IntPtr device);
    [DllImport("nvml.dll", EntryPoint = "nvmlDeviceGetUtilizationRates")] static extern int NvmlGetUtilization(IntPtr device, out NvmlUtilization utilization);
    [DllImport("nvml.dll", EntryPoint = "nvmlDeviceGetTemperature")] static extern int NvmlGetTemperature(IntPtr device, uint sensor, out uint temperature);
    [DllImport("nvml.dll", EntryPoint = "nvmlDeviceGetMemoryInfo")] static extern int NvmlGetMemory(IntPtr device, out NvmlMemory memory);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Main_Control_Create(AdlAlloc allocator, int connectedAdapters, out IntPtr context);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Main_Control_Destroy(IntPtr context);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_NumberOfAdapters_Get(IntPtr context, out int count);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_New_QueryPMLogData_Get(IntPtr context, int adapter, ref AdlLog output);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_DedicatedVRAMUsage_Get(IntPtr context, int adapter, out int megabytes);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_MemoryInfo2_Get(IntPtr context, int adapter, ref AdlMemoryInfo2 info);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_FrameMetrics_Caps(IntPtr context, int adapter, out int supported);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_FrameMetrics_Start(IntPtr context, int adapter, int source);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_FrameMetrics_Get(IntPtr context, int adapter, int source, out float fps);
    [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] static extern int ADL2_Adapter_FrameMetrics_Stop(IntPtr context, int adapter, int source);

    static int Main(string[] args)
    {
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--fps-csv" && i + 1 < args.Length) fpsCsv = Path.GetFullPath(args[++i]);
            else if (args[i] == "--game" && i + 1 < args.Length) game = args[++i];
            else { Console.Error.WriteLine("Usage: Monitor.exe [--fps-csv path] [--game game.exe]"); return 2; }
        }
        if (!File.Exists(Path.Combine(Web, "index.html"))) { Console.Error.WriteLine("Missing web/index.html"); return 2; }
        try { nvmlReady = NvmlInit() == 0 && NvmlGetDevice(0, out nvmlDevice) == 0; }
        catch (DllNotFoundException) { } catch (EntryPointNotFoundException) { }
        try { InitAmd(); }
        catch (DllNotFoundException) { } catch (EntryPointNotFoundException) { } catch (BadImageFormatException) { }
        var sampler = new Thread(SampleLoop) { IsBackground = true, Name = "telemetry" };
        sampler.Start();
        MediaBridge.Start();
        using (var listener = new HttpListener())
        {
            listener.Prefixes.Add("http://127.0.0.1:" + Port + "/");
            try { listener.Start(); }
            catch (Exception e) { Console.Error.WriteLine("Cannot listen on loopback: " + e.Message); return 1; }
            Console.WriteLine("Android Companion: http://127.0.0.1:" + Port + "/");
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; running = false; listener.Stop(); };
            while (running)
            {
                HttpListenerContext context;
                try { context = listener.GetContext(); }
                catch (HttpListenerException) { break; } catch (ObjectDisposedException) { break; }
                try { Respond(context); }
                catch (Exception e) { Console.Error.WriteLine("Request error: " + e.Message); try { context.Response.Abort(); } catch { } }
            }
        }
        running = false;
        sampler.Join(2500);
        if (nvmlReady) try { NvmlShutdown(); } catch { }
        if (adlFrameReady) try { ADL2_Adapter_FrameMetrics_Stop(adlContext, adlAdapter, 0); } catch { }
        if (adlContext != IntPtr.Zero) try { ADL2_Main_Control_Destroy(adlContext); } catch { }
        foreach (var counter in gpuCounters) counter.Dispose();
        return 0;
    }
    static void Respond(HttpListenerContext context)
    {
        var request = context.Request; var response = context.Response;
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Cache-Control"] = "no-store";
        response.Headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
        response.Headers["Referrer-Policy"] = "no-referrer";
        if (!IPAddress.IsLoopback(request.RemoteEndPoint.Address) || request.Url.Authority != "127.0.0.1:8765")
        { response.StatusCode = 403; response.Close(); return; }
        string path = request.Url.AbsolutePath, body, contentType;
        if (path == "/api/media/control" && request.HttpMethod == "POST")
        {
            if (request.Headers["Origin"] != "http://127.0.0.1:8765" || request.Headers["X-Media-Token"] != MediaBridge.Token || request.ContentLength64 < 1 || request.ContentLength64 > 1024 || request.ContentType != "application/json")
            { response.StatusCode = 403; response.Close(); return; }
            try
            {
                string input; using (var reader = new StreamReader(request.InputStream)) input = reader.ReadToEnd();
                var command = Json.Deserialize<MediaCommand>(input);
                bool ok = MediaBridge.Command(command.session, command.action, command.seconds).GetAwaiter().GetResult();
                response.StatusCode = ok ? 200 : 409;
                body = ok ? "{\"ok\":true}" : "{\"ok\":false}";
            }
            catch { response.StatusCode = 400; body = "{\"ok\":false}"; }
            contentType = "application/json";
        }
        else if (request.HttpMethod != "GET") { response.StatusCode = 405; response.Close(); return; }
        else if (path == "/api/media")
        { body = Json.Serialize(new { media = MediaBridge.Current, token = MediaBridge.Token }); contentType = "application/json"; }
        else if (path == "/api/media/artwork")
        {
            string mime; byte[] art = MediaBridge.Artwork(out mime);
            response.ContentType = mime; response.ContentLength64 = art.Length;
            if (art.Length == 0) response.StatusCode = 404;
            response.OutputStream.Write(art, 0, art.Length); response.Close(); return;
        }
        else if (path == "/api/stats")
        {
            Snapshot snap; lock (Gate) snap = current;
            body = Json.Serialize(snap); contentType = "application/json; charset=utf-8";
        }
        else
        {
            string name = path == "/" ? "index.html" : path.TrimStart('/');
            bool allowed = name == "index.html" || name == "app.css" || name == "app.js" || name == "media.js" || name == "scenes.js" ||
                name == "vendor/ascii/mount.js" || name == "vendor/ascii/width.js" || name == "vendor/ascii/manifest.js" ||
                Regex.IsMatch(name, @"\Avendor/ascii/pieces/[a-z-]+\.js\z");
            if (!allowed || !File.Exists(Path.Combine(Web, name))) { response.StatusCode = 404; response.Close(); return; }
            body = File.ReadAllText(Path.Combine(Web, name), Encoding.UTF8);
            contentType = name.EndsWith(".css") ? "text/css; charset=utf-8" : name.EndsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
        }
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        response.ContentType = contentType; response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length); response.Close();
    }
    sealed class MediaCommand { public string session { get; set; } public string action { get; set; } public double seconds { get; set; } }
    static void SampleLoop()
    {
        while (running)
        {
            var snap = new Snapshot();
            try { SampleCpu(snap); } catch { }
            try { SampleRam(snap); } catch { }
            try { SampleGpu(snap); } catch { }
            try { SampleDisks(snap); } catch { }
            if (fpsCsv != null) try { SampleFps(snap); } catch { }
            if (!snap.fps.HasValue && adlFrameReady) try { SampleAmdDisplayFps(snap); } catch { }
            lock (Gate) current = snap;
            Thread.Sleep(2000);
        }
    }
    static void SampleCpu(Snapshot snap)
    {
        FileTime idle, kernel, user;
        if (!GetSystemTimes(out idle, out kernel, out user)) return;
        ulong i = idle.Value, k = kernel.Value, u = user.Value;
        if (lastKernel != 0 && k >= lastKernel && u >= lastUser && i >= lastIdle)
        {
            double total = (k - lastKernel) + (u - lastUser);
            if (total > 0) snap.cpu = Clamp(100.0 * (total - (i - lastIdle)) / total);
        }
        lastIdle = i; lastKernel = k; lastUser = u;
    }
    static void SampleRam(Snapshot snap)
    {
        var m = new MemoryStatus { length = (uint)Marshal.SizeOf(typeof(MemoryStatus)) };
        if (!GlobalMemoryStatusEx(ref m)) return;
        snap.ramTotalGiB = Math.Round(m.totalPhysical / 1073741824.0, 1);
        snap.ramUsedGiB = Math.Round((m.totalPhysical - m.availablePhysical) / 1073741824.0, 1);
        snap.ramPercent = Math.Round(100.0 * (m.totalPhysical - m.availablePhysical) / m.totalPhysical, 1);
    }
    static void SampleDisks(Snapshot snap)
    {
        if (DateTime.UtcNow >= nextDiskRefresh)
        {
            var disks = new List<DiskSnapshot>();
            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (drive.DriveType != DriveType.Fixed || !drive.IsReady || drive.TotalSize <= 0) continue;
                    double total = drive.TotalSize / 1073741824.0;
                    double used = (drive.TotalSize - drive.TotalFreeSpace) / 1073741824.0;
                    disks.Add(new DiskSnapshot { name = drive.Name.TrimEnd(Path.DirectorySeparatorChar), usedGiB = Math.Round(used, 1),
                        totalGiB = Math.Round(total, 1), percent = Math.Round(100 * used / total, 1) });
                }
                catch { }
            }
            cachedDisks = disks.ToArray();
            nextDiskRefresh = DateTime.UtcNow.AddSeconds(10);
        }
        snap.disks = cachedDisks;
    }
    static void SampleGpu(Snapshot snap)
    {
        if (nvmlReady)
        {
            NvmlUtilization util; NvmlMemory memory; uint temp;
            if (NvmlGetMemory(nvmlDevice, out memory) == 0 && memory.total > 0)
                SetVram(snap, memory.used / 1073741824.0, memory.total / 1073741824.0);
            if (NvmlGetUtilization(nvmlDevice, out util) == 0) { snap.gpu = Clamp(util.gpu); snap.gpuSource = "NVIDIA NVML"; }
            if (NvmlGetTemperature(nvmlDevice, 0, out temp) == 0) snap.gpuTemp = temp;
            if (snap.gpu.HasValue || snap.gpuTemp.HasValue) return;
        }
        if (adlReady)
        {
            int usedMb;
            if (adlVramTotalGiB.HasValue && ADL2_Adapter_DedicatedVRAMUsage_Get(adlContext, adlAdapter, out usedMb) == 0 && usedMb >= 0)
                SetVram(snap, usedMb / 1024.0, adlVramTotalGiB.Value);
            var log = NewAdlLog();
            if (ADL2_New_QueryPMLogData_Get(adlContext, adlAdapter, ref log) == 0)
            {
                if (log.sensors[8].supported != 0 && ValidTemperature(log.sensors[8].value)) snap.gpuTemp = log.sensors[8].value;
                else if (log.sensors[27].supported != 0 && ValidTemperature(log.sensors[27].value)) snap.gpuTemp = log.sensors[27].value;
                if (log.sensors[19].supported != 0 && log.sensors[19].value >= 0 && log.sensors[19].value <= 100)
                { snap.gpu = Clamp(log.sensors[19].value); snap.gpuSource = "AMD ADL"; return; }
            }
        }
        // WDDM GPU Engine counters; 3D load is an approximation, capped at 100%.
        if (DateTime.UtcNow >= nextGpuRefresh)
        {
            foreach (var counter in gpuCounters) counter.Dispose(); gpuCounters.Clear();
            nextGpuRefresh = DateTime.UtcNow.AddSeconds(30);
            try
            {
                var category = new PerformanceCounterCategory("GPU Engine");
                foreach (string instance in category.GetInstanceNames())
                    if (instance.IndexOf("engtype_3D", StringComparison.OrdinalIgnoreCase) >= 0)
                    { var counter = new PerformanceCounter("GPU Engine", "Utilization Percentage", instance, true); counter.NextValue(); gpuCounters.Add(counter); }
            }
            catch { gpuCounters.Clear(); }
        }
        double sum = 0;
        foreach (var counter in gpuCounters) try { sum += counter.NextValue(); } catch { }
        if (gpuCounters.Count > 0) { snap.gpu = Clamp(sum); snap.gpuSource = "Windows GPU Engine"; }
    }
    static void SetVram(Snapshot snap, double used, double total)
    {
        if (total <= 0 || used < 0 || used > total * 1.2) return;
        snap.vramUsedGiB = Math.Round(used, 1);
        snap.vramTotalGiB = Math.Round(total, 1);
        snap.vramPercent = Math.Round(100 * used / total, 1);
    }
    static void SampleAmdDisplayFps(Snapshot snap)
    {
        snap.fpsSource = "AMD display FPS";
        float fps;
        if (ADL2_Adapter_FrameMetrics_Get(adlContext, adlAdapter, 0, out fps) == 0 && fps > 0 && fps < 1000)
            snap.fps = Math.Round(fps, 1);
    }
    static AdlLog NewAdlLog() { return new AdlLog { size = Marshal.SizeOf(typeof(AdlLog)), sensors = new AdlSensor[256] }; }
    static bool ValidTemperature(int value) { return value > 0 && value < 126; }
    static void InitAmd()
    {
        if (ADL2_Main_Control_Create(AdlAllocator, 1, out adlContext) != 0) return;
        int count;
        if (ADL2_Adapter_NumberOfAdapters_Get(adlContext, out count) != 0) return;
        for (int adapter = 0; adapter < Math.Min(count, 40); adapter++)
        {
            var log = NewAdlLog();
            if (ADL2_New_QueryPMLogData_Get(adlContext, adapter, ref log) == 0 &&
                log.sensors[8].supported != 0 && ValidTemperature(log.sensors[8].value))
            {
                adlAdapter = adapter; adlReady = true;
                var info = new AdlMemoryInfo2 { type = new byte[256] };
                if (ADL2_Adapter_MemoryInfo2_Get(adlContext, adapter, ref info) == 0 && info.size > 0)
                    adlVramTotalGiB = info.size / 1073741824.0;
                int supported;
                if (fpsCsv == null && ADL2_Adapter_FrameMetrics_Caps(adlContext, adapter, out supported) == 0 && supported != 0)
                    adlFrameReady = ADL2_Adapter_FrameMetrics_Start(adlContext, adapter, 0) == 0;
                return;
            }
        }
    }
    static string ReadCpuName()
    {
        try { using (var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
            return Convert.ToString(key.GetValue("ProcessorNameString")).Trim(); }
        catch { return "processor"; }
    }
    static string ReadGpuName()
    {
        string fallback = "graphics adapter";
        try
        {
            using (var search = new ManagementObjectSearcher("SELECT Name FROM Win32_VideoController"))
            using (var cards = search.Get())
                foreach (ManagementObject card in cards)
                {
                    string name = Convert.ToString(card["Name"]);
                    if (String.IsNullOrWhiteSpace(name)) continue;
                    if (name.IndexOf("Radeon RX", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        name.IndexOf("GeForce", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        name.IndexOf("Intel Arc", StringComparison.OrdinalIgnoreCase) >= 0) return name.Trim();
                    if (fallback == "graphics adapter" && name.IndexOf("Virtual", StringComparison.OrdinalIgnoreCase) < 0) fallback = name.Trim();
                }
        }
        catch { }
        return fallback;
    }
    static void SampleFps(Snapshot snap)
    {
        if (!File.Exists(fpsCsv)) return;
        if (DateTime.UtcNow - File.GetLastWriteTimeUtc(fpsCsv) > TimeSpan.FromSeconds(15)) return;
        using (var stream = new FileStream(fpsCsv, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            string header;
            using (var reader = new StreamReader(stream, Encoding.UTF8, true, 4096, true)) header = reader.ReadLine();
            if (header == null) return;
            string[] columns = header.Split(',');
            int msIndex = Array.FindIndex(columns, x => x.Trim('\"') == "MsBetweenPresents");
            int appIndex = Array.FindIndex(columns, x => x.Trim('\"') == "Application");
            if (msIndex < 0) return;
            stream.Seek(Math.Max(0, stream.Length - 65536), SeekOrigin.Begin);
            using (var reader = new StreamReader(stream))
            {
                if (stream.Position > 0) reader.ReadLine();
                var values = new Queue<double>(); string line;
                while ((line = reader.ReadLine()) != null)
                {
                    string[] parts = line.Split(',');
                    if (parts.Length <= msIndex || (game != null && (appIndex < 0 || parts.Length <= appIndex || !parts[appIndex].Trim('\"').Equals(game, StringComparison.OrdinalIgnoreCase)))) continue;
                    double ms;
                    if (!double.TryParse(parts[msIndex], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out ms) || ms <= 0 || ms > 1000) continue;
                    values.Enqueue(ms); if (values.Count > 60) values.Dequeue();
                }
                if (values.Count > 1) { double sum = 0; foreach (double value in values) sum += value; snap.fps = Math.Round(1000.0 * values.Count / sum, 1); snap.fpsSource = "PresentMon CSV"; }
            }
        }
    }
    static double Clamp(double value) { return Math.Round(Math.Max(0, Math.Min(100, value)), 1); }
}
