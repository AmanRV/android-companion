# Android Companion

A USB-only Windows 11 hardware dashboard for an old Android 11 phone. The Windows side is one .NET Framework executable. The phone uses its existing browser: no APK, account, cloud service, Wi-Fi connection, or app permission to install. The page has no external fonts, libraries, images, or requests.

The visual direction takes inspiration from [ascii.rest](https://ascii.rest/): restrained monospace type, technical labels, and a gentle field of animated characters. The artwork is original and rendered locally at low frame rate.

## Metrics

| Metric | MVP source | Availability |
| --- | --- | --- |
| CPU load | Windows `GetSystemTimes` | Built in; sampled every 2 seconds |
| RAM usage | Windows `GlobalMemoryStatusEx` | Built in |
| GPU 3D load | NVIDIA NVML if available; otherwise Windows WDDM GPU Engine counters | Depends on driver and counter availability; multi-GPU values are approximate |
| GPU temperature | NVIDIA NVML | NVIDIA cards with supported driver only; otherwise `N/A` |
| CPU temperature | — | `N/A` in this dependency-free MVP; Windows has no reliable universal CPU package sensor API |
| Per-game FPS | Optional [Intel PresentMon](https://github.com/GameTechDev/PresentMon) CSV | Requires a separate PresentMon capture; game and graphics API support vary |

Unknown readings are displayed as `N/A` or `--`, never made up. The FPS card returns to standby when its CSV stops updating.

## Install on Windows 11 and Android 11

1. On Windows, clone this repository. No .NET SDK is required; Windows 11's .NET Framework C# compiler builds the server.
2. Download **Android SDK Platform-Tools for Windows** from [Google's official page](https://developer.android.com/tools/releases/platform-tools) and extract it. Note the full path to `platform-tools\adb.exe`. Do not add the tools to this repository.
3. On the phone, enable **Developer options → USB debugging**. Connect by USB, unlock the phone, and accept its USB debugging authorization prompt. A current Chrome browser is recommended.
4. In PowerShell, from this repository, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -AdbPath 'C:\path\to\platform-tools\adb.exe'
   ```

5. The script compiles the server, checks for a **USB** ADB device, establishes `adb reverse tcp:8765 tcp:8765`, and opens `http://127.0.0.1:8765/` on the phone. Tap **FULLSCREEN** on the dashboard, then rotate the phone to landscape if needed. The page adapts to portrait, landscape, screen density, and narrow displays. The browser may require a tap before allowing fullscreen; Android may briefly show system bars on edge swipes.

Leave PowerShell open. It restores the reverse link after USB reconnects. Press Ctrl+C to stop it. On the PC, the same page is available at `http://127.0.0.1:8765/` for a quick check.

If the phone shows `unauthorized`, unlock it and accept the debugging prompt, then retry. If Windows does not detect the phone, try a data-capable cable and install the phone maker's USB driver. If port 8765 is already in use, stop the other process using it.

## Optional game FPS

Download PresentMon from its [official GitHub releases](https://github.com/GameTechDev/PresentMon/releases). Start a capture in a separate terminal, replacing the executable name and paths:

```powershell
& 'C:\path\to\PresentMon.exe' --process_name game.exe --output_file "$env:TEMP\companion-fps.csv"
```

Then start Android Companion with the same file and exact game executable name:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -AdbPath 'C:\path\to\platform-tools\adb.exe' -FpsCsv "$env:TEMP\companion-fps.csv" -Game 'game.exe'
```

The monitor reads recent frame intervals from PresentMon's CSV and displays their rolling average. PresentMon may require administrator access or membership in **Performance Log Users** to capture ETW events. This optional capture has its own overhead; keep it off when FPS is not needed. The monitor never launches a game or PresentMon itself.

## Security and resource use

- The HTTP server binds only `127.0.0.1:8765`. The phone reaches it through USB ADB reverse, using `adb -d` to select a physical USB device. There is no LAN listener or outbound request in the application.
- The server accepts only GET requests for three fixed local assets and `/api/stats`. It exposes no command, file upload, configuration write, or filesystem browsing endpoint. A Content Security Policy blocks remote assets.
- Telemetry is sampled once every 2 seconds. The browser polls once every 2 seconds, pauses polling when hidden, and paints the ASCII wallpaper at at most about 6 frames per second, or less when reduced motion is requested. Rendering uses a small canvas at CSS pixel resolution and no GPU-heavy effects.
- Browser layout preference is saved only in local browser storage. Generated executables, local tools, CSV captures, logs, and local config files are ignored by Git.
- USB debugging gives the authorized PC broad access to the phone. Revoke the PC's USB debugging authorization in Android Developer options when you no longer trust that PC.

## Development

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1`, then `.\bin\Monitor.exe`. The source uses only Windows and .NET Framework APIs. The UI is plain HTML, CSS, and JavaScript. There are no package manager dependencies or build-time downloads.

## Limitations

The MVP has no Android APK or automatic launch at phone boot; the Windows script opens the browser when USB first connects. Browser fullscreen and landscape lock depend on browser support and can be exited with Android gestures. CPU temperature and non-NVIDIA GPU temperature need a supported hardware sensor library or vendor integration in a future release. The GPU Engine fallback is 3D utilization, not an exact all-engine total. PresentMon CSV is required for real game FPS.

## Research sources

- [Windows memory API](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex)
- [Windows GPU engine performance counters](https://learn.microsoft.com/en-us/windows/win32/direct3dtools/pix/articles/timing-captures/pix-timing-captures)
- [LibreHardwareMonitor sensor coverage and privilege requirements](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) — a candidate for broader temperature support; recent versions removed its WMI export, so it is not used here
- [PresentMon console capture and CSV options](https://github.com/GameTechDev/PresentMon/blob/main/README-ConsoleApplication.md)
- [Android immersive mode](https://developer.android.com/develop/ui/views/layout/immersive)

## License

MIT. See [LICENSE](LICENSE).
