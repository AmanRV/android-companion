using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media;
using Windows.Media.Control;

// Windows' existing media-session integration. No browser extensions or player processes.
internal static class MediaBridge
{
    internal sealed class State
    {
        public bool available, playing, canPlay, canPause, canNext, canPrevious, canSeek;
        public string title = "", artist = "", source = "", kind = "unknown", session = "", artwork = "";
        public double position, duration, start, rate = 1;
        public string sampled = DateTime.UtcNow.ToString("o");
    }
    internal static readonly string Token = Guid.NewGuid().ToString("N");
    static readonly object gate = new object();
    static State state = new State();
    static byte[] artwork = new byte[0];
    static string artworkType = "image/jpeg";
    static GlobalSystemMediaTransportControlsSession session;
    static string sessionId = "";
    static int dirty = 1;
    internal static State Current { get { lock (gate) return state; } }
    internal static byte[] Artwork(out string type) { lock (gate) { type = artworkType; return artwork; } }
    internal static void Start() { new Thread(() => Loop().GetAwaiter().GetResult()) { IsBackground = true, Name = "media" }.Start(); }
    static async Task<T> Bounded<T>(Windows.Foundation.IAsyncOperation<T> task)
    {
        var until = DateTime.UtcNow.AddSeconds(3);
        while (task.Status == Windows.Foundation.AsyncStatus.Started) { if (DateTime.UtcNow > until) { task.Cancel(); throw new TimeoutException(); } await Task.Delay(20); }
        try { return task.GetResults(); } finally { task.Close(); }
    }
    static void Changed(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args) { Interlocked.Exchange(ref dirty, 1); }
    static async Task Loop()
    {
        GlobalSystemMediaTransportControlsSessionManager manager = null;
        GlobalSystemMediaTransportControlsSessionMediaProperties metadata = null;
        string artVersion = "";
        while (true)
        {
            try
            {
                if (manager == null) manager = await Bounded(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
                var selected = manager.GetCurrentSession();
                foreach (var candidate in manager.GetSessions())
                    if (candidate.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                    { selected = candidate; break; }
                if (!Object.Equals(selected, session))
                {
                    if (session != null) session.MediaPropertiesChanged -= Changed;
                    lock (gate) { session = selected; sessionId = Guid.NewGuid().ToString("N"); artwork = new byte[0]; }
                    metadata = null; artVersion = "";
                    if (session != null) session.MediaPropertiesChanged += Changed;
                    Interlocked.Exchange(ref dirty, 1);
                }
                var next = new State();
                if (selected != null)
                {
                    if (Interlocked.Exchange(ref dirty, 0) != 0 || metadata == null)
                    {
                        metadata = await Bounded(selected.TryGetMediaPropertiesAsync());
                        byte[] bytes = new byte[0]; string mime = "image/jpeg";
                        if (metadata.Thumbnail != null)
                        {
                            using (var stream = await Bounded(metadata.Thumbnail.OpenReadAsync()))
                            {
                                if (stream.Size > 0 && stream.Size <= 1048576 &&
                                    (stream.ContentType == "image/jpeg" || stream.ContentType == "image/png" || stream.ContentType == "image/webp"))
                                {
                                    mime = stream.ContentType;
                                    using (var reader = new Windows.Storage.Streams.DataReader(stream)) { uint size = await Bounded(reader.LoadAsync((uint)stream.Size)); bytes = new byte[size]; reader.ReadBytes(bytes); }
                                }
                            }
                        }
                        artVersion = bytes.Length == 0 ? "" : Guid.NewGuid().ToString("N");
                        lock (gate) { artwork = bytes; artworkType = mime; }
                    }
                    var playback = selected.GetPlaybackInfo(); var controls = playback.Controls;
                    var timeline = selected.GetTimelineProperties();
                    next.available = playback.PlaybackStatus != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Closed
                        && playback.PlaybackStatus != GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped
                        && !String.IsNullOrWhiteSpace(metadata.Title);
                    next.playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                    next.title = metadata.Title; next.artist = metadata.Artist; next.source = selected.SourceAppUserModelId;
                    var kind = metadata.PlaybackType ?? playback.PlaybackType;
                    next.kind = kind == MediaPlaybackType.Video ? "video" : kind == MediaPlaybackType.Music ? "music" : "unknown";
                    next.canPlay = controls.IsPlayEnabled; next.canPause = controls.IsPauseEnabled;
                    next.canNext = controls.IsNextEnabled; next.canPrevious = controls.IsPreviousEnabled;
                    next.canSeek = controls.IsPlaybackPositionEnabled;
                    next.start = timeline.StartTime.TotalSeconds;
                    next.duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
                    next.rate = playback.PlaybackRate ?? 1;
                    next.position = (timeline.Position - timeline.StartTime).TotalSeconds;
                    if (next.playing) next.position += Math.Max(0, (DateTimeOffset.UtcNow - timeline.LastUpdatedTime).TotalSeconds) * next.rate;
                    next.position = Math.Max(0, Math.Min(next.duration, next.position));
                    next.session = sessionId; next.artwork = artVersion;
                }
                lock (gate) state = next;
            }
            catch { Interlocked.Exchange(ref dirty, 1); lock (gate) state = new State(); }
            await Task.Delay(2000);
        }
    }
    internal static async Task<bool> Command(string id, string action, double seconds)
    {
        GlobalSystemMediaTransportControlsSession target; State current;
        lock (gate) { if (id != sessionId) return false; target = session; current = state; }
        if (target == null || !current.available) return false;
        try
        {
            switch (action)
            {
                case "play": return current.canPlay && await Bounded(target.TryPlayAsync());
                case "pause": return current.canPause && await Bounded(target.TryPauseAsync());
                case "next": return current.canNext && await Bounded(target.TrySkipNextAsync());
                case "previous": return current.canPrevious && await Bounded(target.TrySkipPreviousAsync());
                case "seek": return current.canSeek && !Double.IsNaN(seconds) && !Double.IsInfinity(seconds) && seconds >= 0 && seconds <= current.duration
                    && await Bounded(target.TryChangePlaybackPositionAsync((long)((seconds + current.start) * TimeSpan.TicksPerSecond)));
                default: return false;
            }
        }
        catch { return false; }
    }
}
