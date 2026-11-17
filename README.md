# Android Companion

A lightweight, USB-only Windows 11 hardware dashboard and animated picture display for an Android 11 phone. The Windows side is one .NET Framework executable. The phone uses a tiny Android WebView app, or a browser as a fallback. No Wi-Fi, Bluetooth, cloud service, external runtime assets, or package manager dependencies are needed at runtime.

The **monitor** is a dark, neutral, full-screen display with six compact tiles, muted hardware names, and layouts you can cycle with **[layout]**. Readings roll up or down like a small slot reel when a new sample arrives, and history graphs scroll between samples on the phone; Windows telemetry still runs every 2 seconds. The heading uses the Windows PC hostname at runtime; it is never hardcoded into this public repository.

The **scenes** tab contains all 34 animated scenes from [ascii.rest](https://ascii.rest/), copied into this repository under its MIT license. Each scene fills the display; its edges may crop slightly to match the phone's aspect ratio. Tap to reveal controls, swipe to change scenes, or use **[all scenes]** to choose one. **[pause]** holds a still frame. Your last scene is saved locally on the phone. Scenes load only when selected and never request ascii.rest or any other website.

## Metrics

| Metric | Source | Notes |
| --- | --- | --- |
| CPU usage | Windows `GetSystemTimes` | Sampled every 2 seconds |
| CPU name | Windows registry | Read once at startup |
| RAM | Windows `GlobalMemoryStatusEx` | Used and total physical memory |
| GPU name | Windows `Win32_VideoController` | Read once at startup |
| AMD GPU usage and edge temperature | AMD ADL PMLog from the installed Radeon driver | Tested on Radeon RX 7900 GRE; support depends on card and driver |
| AMD VRAM | AMD ADL memory info and dedicated VRAM usage | Tested on Radeon RX 7900 GRE |
| NVIDIA GPU usage and temperature | NVIDIA NVML from the installed driver | Used when available |
| NVIDIA VRAM | NVIDIA NVML memory info | Driver dependent |
| Other GPU usage | Windows GPU Engine 3D performance counters | Approximation; multiple engines or GPUs may be combined |
| Fixed storage volumes | .NET `DriveInfo` | Used and total space; refreshed every 10 seconds |
| CPU temperature | — | `n/a` until a supported local sensor provider is available |
| AMD display FPS | AMD ADL frame metrics | No extra app; reports GPU display output across apps, **not** per-game; unverified during a game on the tested PC |
| Per-game FPS | Optional [Intel PresentMon](https://github.com/GameTechDev/PresentMon) CSV capture | Requires a separate capture; support varies by game and graphics API |

Unknown readings show `n/a` or `--`. The AMD display frame counter reports no active frames on the tested desktop; a game may produce a reading, but this has not yet been verified. Accurate per-game FPS needs a present-event capture such as PresentMon. The Windows APIs do not expose a reliable universal CPU package temperature: Microsoft's `Win32_TemperatureProbe.CurrentReading` is not populated, and this PC exposes no ACPI thermal-zone reading. AMD's [Ryzen Master Monitoring SDK](https://www.amd.com/en/developer/ryzen-master-monitoring-sdk.html) and [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) can read CPU sensors, but require additional components or privileges. The app does not install a hardware-access driver by default.

## Install on Windows 11 and Android 11

1. Clone or download this repository on the Windows PC. Windows 11's .NET Framework C# compiler builds the service; no .NET SDK or Node is needed.
2. Get [Android SDK Platform-Tools for Windows](https://developer.android.com/tools/releases/platform-tools) and extract it **outside** this repository. Note the path to `adb.exe`.
3. On the phone, enable **Developer options → USB debugging**. Connect by USB, unlock the phone, and accept the debugging authorization prompt.
4. For the immersive app, download `android-companion-debug-apk` from the latest **Android APK** run under this repository's GitHub **Actions** tab. Extract its `app-debug.apk` into `bin\android-companion-debug-apk\` in this checkout, then run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-android.ps1 -AdbPath 'C:\path\to\platform-tools\adb.exe'
   ```

   The APK is built from the public `android/` source. To build it yourself, use JDK 17, Android SDK 35, and Gradle 8.11.1, then run `gradle -p android :app:assembleDebug`.
5. In PowerShell, from this repository, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -AdbPath 'C:\path\to\platform-tools\adb.exe'
   ```

6. The launcher builds the service, selects a physical USB ADB device, sets up `adb reverse tcp:8765 tcp:8765`, and opens the installed app. The app stays in landscape, hides system bars, and keeps the display awake. Without the APK, the launcher opens a browser fallback; tap **[fullscreen]** there if supported.

Leave PowerShell open for automatic USB reconnection. Press Ctrl+C to stop. The page is also available on the PC at `http://127.0.0.1:8765/`. If ADB reports `unauthorized`, unlock the phone and accept its prompt. A data-capable cable and the phone maker's USB driver may be needed.

## Optional game FPS

Download PresentMon from its [official releases](https://github.com/GameTechDev/PresentMon/releases). In a separate terminal, run a capture with the executable name and a local CSV path:

```powershell
& 'C:\path\to\PresentMon.exe' --process_name game.exe --output_file "$env:TEMP\companion-fps.csv"
```

Then launch Android Companion with the same file and process name:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -AdbPath 'C:\path\to\platform-tools\adb.exe' -FpsCsv "$env:TEMP\companion-fps.csv" -Game 'game.exe'
```

PresentMon may need administrator access or Performance Log Users membership for ETW capture. Its separate capture has additional overhead; leave it off when per-game FPS is not needed. Android Companion never launches PresentMon or a game. The built-in AMD display FPS reading works independently when the driver supports it, but it cannot identify a game's frames.

## Security and resource use

- The HTTP service binds only `127.0.0.1:8765`. ADB reverse carries traffic over USB. The application makes no outbound requests.
- The service accepts GET only for the stats endpoint and a fixed allowlist of local assets. It has no command, upload, write, or arbitrary file endpoint. A Content Security Policy allows only same-origin resources.
- Stats are sampled and fetched every 2 seconds; fixed-drive capacity is refreshed every 10 seconds. Smooth number and graph motion runs only in the phone browser between real samples. Browser polling pauses when hidden or in scenes mode. The scene renderer uses an optimized canvas, caps animation at 10 fps, and stops when its tab is hidden or monitor mode is selected.
- Layout and scene preferences stay in local WebView storage on the phone. Generated executables, APKs, local tools, logs, and captures are ignored by Git.
- USB debugging gives an authorized PC broad access to the phone. Revoke its authorization in Android Developer options if that PC is no longer trusted.

## Development and provenance

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1`, then `.\bin\Monitor.exe`. The UI is plain HTML, CSS, and JavaScript. The Android wrapper is a single Java Activity and has no third-party runtime libraries. GitHub Actions builds a debug APK; its artifact is not committed.

Scene source and the original license are under `vendor/ascii-source/`; browser-ready local modules are under `web/vendor/ascii/`. They were copied from [bas3line/ascii](https://github.com/bas3line/ascii) at commit `9ba5ab1` (MIT). To regenerate them for development, clone that project locally and run `node scripts/vendor-scenes.mjs <path-to-ascii-checkout>` with Node 24+. Node is unnecessary for installing or running this app. See [third-party notices](THIRD_PARTY_NOTICES.md).

The project itself is MIT licensed; see [LICENSE](LICENSE).

## Limitations

There is no automatic launch at phone boot. CPU temperature requires an optional sensor integration that is not included. AMD/NVIDIA readings depend on installed drivers. The fallback Windows GPU counter is a 3D approximation. The AMD FPS fallback covers display output rather than a specific game; accurate per-game FPS requires PresentMon CSV or another present-event capture. GitHub Actions debug builds use temporary signing keys; replacing an APK from another run may require uninstalling the old app first, which clears its local preferences.

## Research

- [AMD ADL PMLog API](https://gpuopen-librariesandsdks.github.io/adl/group__OVERDRIVE8API.html)
- [AMD ADL VRAM APIs](https://gpuopen-librariesandsdks.github.io/adl/group__ADAPTERMAINAPI.html)
- [AMD ADL display frame metrics](https://gpuopen-librariesandsdks.github.io/adl/group__PERFORMANCEAPI.html)
- [NVIDIA NVML device memory API](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html)
- [Windows memory API](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex)
- [Microsoft's unpopulated temperature probe reading](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-temperatureprobe)
- [PresentMon console capture](https://github.com/GameTechDev/PresentMon/blob/main/README-ConsoleApplication.md)
- [Android immersive mode](https://developer.android.com/develop/ui/views/layout/immersive)
