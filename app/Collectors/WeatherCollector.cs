using System.Text.Json;

namespace CrtMonitor.Collectors;

/// <summary>天气：Open-Meteo（免 key）。定位用 ip-api（未配置坐标时），15 分钟刷新，失败静默退避。
/// HTTP 在壳侧做（规避 WebView 的 CORS/混合内容限制），tick 里只回缓存。</summary>
public sealed class WeatherCollector : ICollector
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };

    private readonly WeatherConfig _cfg;
    private WeatherDto? _cache;
    private DateTime _nextFetchUtc = DateTime.MinValue;
    private bool _busy;
    private double? _lat;
    private double? _lon;
    private string? _place;

    public WeatherCollector(WeatherConfig? cfg) => _cfg = cfg ?? new WeatherConfig();

    public void Poll(TickDto tick)
    {
        if (!_cfg.Enabled) return;
        if (DateTime.UtcNow >= _nextFetchUtc && !_busy)
        {
            _busy = true;
            _ = Task.Run(FetchAsync);
        }
        if (_cache is not null) tick.Metrics.Weather = _cache;
    }

    private async Task FetchAsync()
    {
        try
        {
            if (_lat is null)
            {
                if (_cfg.Lat is { } lat && _cfg.Lon is { } lon)
                {
                    _lat = lat;
                    _lon = lon;
                    _place = _cfg.Place;
                }
                else
                {
                    using var geo = JsonDocument.Parse(
                        await Http.GetStringAsync("http://ip-api.com/json?fields=status,lat,lon,city"));
                    var g = geo.RootElement;
                    if (g.GetProperty("status").GetString() != "success")
                        throw new InvalidOperationException("geo locate failed");
                    _lat = g.GetProperty("lat").GetDouble();
                    _lon = g.GetProperty("lon").GetDouble();
                    _place = _cfg.Place ?? g.GetProperty("city").GetString();
                }
            }

            string url = $"https://api.open-meteo.com/v1/forecast?latitude={_lat}&longitude={_lon}" +
                         "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
                         "&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto";
            using var doc = JsonDocument.Parse(await Http.GetStringAsync(url));
            var c = doc.RootElement.GetProperty("current");
            int code = c.GetProperty("weather_code").GetInt32();

            var forecast = new List<ForecastDayDto>();
            if (doc.RootElement.TryGetProperty("daily", out var daily))
            {
                var codes = daily.GetProperty("weather_code").EnumerateArray().ToArray();
                var maxs = daily.GetProperty("temperature_2m_max").EnumerateArray().ToArray();
                var mins = daily.GetProperty("temperature_2m_min").EnumerateArray().ToArray();
                // forecast_days=4 含今天，取后 3 天
                for (int i = 1; i < codes.Length; i++)
                {
                    forecast.Add(new ForecastDayDto
                    {
                        Code = codes[i].GetInt32(),
                        MaxC = Math.Round(maxs[i].GetDouble(), 0),
                        MinC = Math.Round(mins[i].GetDouble(), 0),
                    });
                }
            }

            _cache = new WeatherDto
            {
                TempC = Math.Round(c.GetProperty("temperature_2m").GetDouble(), 1),
                Humidity = c.GetProperty("relative_humidity_2m").GetInt32(),
                WindKmh = Math.Round(c.GetProperty("wind_speed_10m").GetDouble(), 0),
                Code = code,
                Text = WmoText(code),
                Place = _place ?? "",
                Forecast = forecast,
            };
            _nextFetchUtc = DateTime.UtcNow.AddMinutes(15);
        }
        catch
        {
            _nextFetchUtc = DateTime.UtcNow.AddMinutes(2); // 无网络/接口失败：退避重试
        }
        finally
        {
            _busy = false;
        }
    }

    private static string WmoText(int code) => code switch
    {
        0 => "晴",
        1 or 2 => "多云",
        3 => "阴",
        45 or 48 => "雾",
        >= 51 and <= 57 => "毛毛雨",
        >= 61 and <= 67 => "雨",
        >= 71 and <= 77 => "雪",
        >= 80 and <= 82 => "阵雨",
        85 or 86 => "阵雪",
        >= 95 => "雷雨",
        _ => "—",
    };
}
