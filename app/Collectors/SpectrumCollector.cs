namespace CrtMonitor.Collectors;

/// <summary>音频频谱采集器：spectrum 配置开启时启动 WASAPI loopback + FFT，
/// 每拍回发 24 频段快照。Dispose 时停止采集。</summary>
public sealed class SpectrumCollector : ICollector, IDisposable
{
    private readonly AudioSpectrum? _spectrum;

    public SpectrumCollector(bool enabled)
    {
        _spectrum = enabled ? new AudioSpectrum() : null;
    }

    public void Poll(TickDto tick)
    {
        if (_spectrum is null) return;
        tick.Metrics.Spectrum = _spectrum.Snapshot().ToList();
    }

    public void Dispose() => _spectrum?.Dispose();
}
