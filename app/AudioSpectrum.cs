using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;

namespace CrtMonitor;

/// <summary>音频频谱：WASAPI loopback 采默认输出设备，FFT 后聚合成 24 个对数频段（0-1）。
/// 15Hz 刷新率，CollectJson 每拍取快照。静音/无声时无回调，前端自行衰减动画。</summary>
public sealed class AudioSpectrum : IDisposable
{
    public const int Bands = 24;

    private WasapiLoopbackCapture? _capture;
    private readonly float[] _ring = new float[4096]; // 交错采样（声道交错）
    private int _ringPos;
    private readonly object _gate = new();
    private readonly double[] _bands = new double[Bands];
    private readonly double[] _peaks = new double[Bands];
    private readonly Complex[] _fftBuffer = new Complex[2048];
    private System.Threading.Timer? _fftTimer;
    private bool _disposed;

    public AudioSpectrum()
    {
        Task.Run(Start);
    }

    private void Start()
    {
        try
        {
            _capture = new WasapiLoopbackCapture();
            _capture.DataAvailable += OnData;
            _capture.RecordingStopped += (_, _) => Program.Log("spectrum capture stopped");
            _capture.StartRecording();

            _fftTimer = new System.Threading.Timer(_ => ComputeFft(), null, 100, 66);
            Program.Log("spectrum capture started");
        }
        catch (Exception ex)
        {
            Program.Log($"spectrum init failed: {ex.Message}");
        }
    }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        var bytes = e.Buffer;
        int count = e.BytesRecorded / sizeof(float);
        lock (_gate)
        {
            for (int i = 0; i < count; i++)
            {
                _ring[_ringPos] = BitConverter.ToSingle(bytes, i * sizeof(float));
                _ringPos = (_ringPos + 1) % _ring.Length;
            }
        }
    }

    private void ComputeFft()
    {
        if (_disposed) return;
        float[] snapshot;
        lock (_gate)
        {
            snapshot = new float[_ring.Length];
            // 把环形缓冲整理成时间顺序
            for (int i = 0; i < _ring.Length; i++)
                snapshot[i] = _ring[(_ringPos + i) % _ring.Length];
        }

        // 取 2048 点（单声道：隔一个声道采样）
        int n = _fftBuffer.Length;
        int srcCount = snapshot.Length / 2; // 立体声交错 → 单声道点数
        int start = Math.Max(0, srcCount - n);
        for (int i = 0; i < n; i++)
        {
            int idx = (start + i) * 2;
            float s = idx < snapshot.Length ? snapshot[idx] : 0;
            // 汉宁窗抑制频谱泄漏
            double window = 0.5 * (1 - Math.Cos(2 * Math.PI * i / (n - 1)));
            _fftBuffer[i].X = (float)(s * window);
            _fftBuffer[i].Y = 0;
        }

        // m = log2(n)：2048 → 11
        FastFourierTransform.FFT(true, 11, _fftBuffer);

        // 24 个对数频段（跳过 DC，约 40Hz–20kHz）
        double nyquist = 48000.0 / 2; // loopback 通常 48k；对数刻度对 44.1k 同样成立
        var newBands = new double[Bands];
        for (int b = 0; b < Bands; b++)
        {
            double f0 = 40 * Math.Pow(nyquist / 40.0, b / (double)Bands);
            double f1 = 40 * Math.Pow(nyquist / 40.0, (b + 1) / (double)Bands);
            int i0 = Math.Max(1, (int)(f0 / nyquist * n / 2));
            int i1 = Math.Max(i0 + 1, (int)(f1 / nyquist * n / 2));
            double sum = 0;
            for (int i = i0; i < Math.Min(i1, n / 2); i++)
            {
                double mag = Math.Sqrt(_fftBuffer[i].X * _fftBuffer[i].X + _fftBuffer[i].Y * _fftBuffer[i].Y);
                sum += mag;
            }
            double v = sum / (i1 - i0) / 40.0; // 归一（经验系数）
            newBands[b] = Math.Min(1, v);
        }

        // 平滑 + 峰值保持缓降
        for (int b = 0; b < Bands; b++)
        {
            _bands[b] = Math.Max(newBands[b], _bands[b] * 0.72);
            _peaks[b] = Math.Max(_bands[b], _peaks[b] - 0.012);
        }
    }

    /// <summary>当前频段（0-1 ×24）。</summary>
    public double[] Snapshot()
    {
        lock (_gate)
        {
            var result = new double[Bands];
            for (int i = 0; i < Bands; i++) result[i] = Math.Round(_bands[i], 3);
            return result;
        }
    }

    public void Dispose()
    {
        _disposed = true;
        _fftTimer?.Dispose();
        try
        {
            _capture?.StopRecording();
            _capture?.Dispose();
        }
        catch { /* 退出时忽略 */ }
    }
}
