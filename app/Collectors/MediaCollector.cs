using Windows.Media.Control;

namespace CrtMonitor.Collectors;

/// <summary>正在播放的媒体（Windows 媒体会话，免管理员）：标题/艺术家/进度/状态。
/// WinRT API 是异步的，照 WeatherCollector 的模式后台刷新 + 缓存。</summary>
public sealed class MediaCollector : ICollector
{
    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private MediaDto? _cache;
    private bool _busy;

    public MediaCollector()
    {
        Task.Run(async () =>
        {
            try
            {
                _manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
                Program.Log("media session manager ready");
            }
            catch (Exception ex)
            {
                Program.Log($"media init failed: {ex.Message}");
            }
        });
    }

    public void Poll(TickDto tick)
    {
        if (_manager is null || _busy)
        {
            if (_cache is not null) tick.Metrics.Media = _cache;
            return;
        }
        _busy = true;
        Task.Run(async () =>
        {
            try
            {
                var dto = new MediaDto();
                var session = _manager.GetCurrentSession();
                if (session is not null)
                {
                    var props = await session.TryGetMediaPropertiesAsync();
                    dto.Title = props.Title ?? "";
                    dto.Artist = props.Artist ?? "";
                    dto.Status = session.GetPlaybackInfo().PlaybackStatus switch
                    {
                        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => "playing",
                        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => "paused",
                        _ => "stopped",
                    };
                    var tl = session.GetTimelineProperties();
                    dto.PosSec = tl.Position.TotalSeconds;
                    dto.DurSec = tl.EndTime.TotalSeconds;
                }
                _cache = dto;
            }
            catch { /* 会话瞬断等下一拍 */ }
            finally
            {
                _busy = false;
            }
        });
        if (_cache is not null) tick.Metrics.Media = _cache;
    }
}
