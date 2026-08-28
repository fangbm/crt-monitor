using System.Diagnostics;
using System.Net.NetworkInformation;

namespace CrtMonitor.Collectors;

/// <summary>网络吞吐：BCL 网卡统计（累计字节）差分。过滤回环/隧道/非活动接口。
/// 附带分网卡速率（按总流量排序，最多 6 条）。</summary>
public sealed class NetCollector : ICollector
{
    private sealed class NicSlot
    {
        public long Rx;
        public long Tx;
        public long At;
        public double RxBps;
        public double TxBps;
    }

    private long _prevRx;
    private long _prevTx;
    private long _prevAt;
    private bool _hasPrev;
    private readonly Dictionary<string, NicSlot> _nics = new();

    public void Poll(TickDto tick)
    {
        long rx = 0, tx = 0;
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var seen = new HashSet<string>();

        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
            string id = nic.Id;
            try
            {
                // 部分虚拟网卡的 IPv4 统计会抛 NetworkInformationException，跳过而不是丢掉整拍
                var stats = nic.GetIPv4Statistics();
                rx += stats.BytesReceived;
                tx += stats.BytesSent;

                var slot = _nics.TryGetValue(id, out var s)
                    ? s
                    : _nics[id] = new NicSlot { Rx = stats.BytesReceived, Tx = stats.BytesSent, At = nowMs };
                seen.Add(id);
                if (slot.At > 0 && nowMs > slot.At)
                {
                    double dt = (nowMs - slot.At) / 1000.0;
                    slot.RxBps = Math.Max(0, stats.BytesReceived - slot.Rx) / dt;
                    slot.TxBps = Math.Max(0, stats.BytesSent - slot.Tx) / dt;
                }
                slot.Rx = stats.BytesReceived;
                slot.Tx = stats.BytesSent;
                slot.At = nowMs;
            }
            catch
            {
                // 忽略该网卡
            }
        }
        foreach (var dead in _nics.Keys.Where(k => !seen.Contains(k)).ToList())
            _nics.Remove(dead);

        double rxBps = 0, txBps = 0;
        long now = Stopwatch.GetTimestamp();
        if (_hasPrev)
        {
            double dt = (now - _prevAt) / (double)Stopwatch.Frequency;
            if (dt > 0.001)
            {
                rxBps = Math.Max(0, rx - _prevRx) / dt;
                txBps = Math.Max(0, tx - _prevTx) / dt;
            }
        }
        _prevRx = rx;
        _prevTx = tx;
        _prevAt = now;
        _hasPrev = true;

        tick.Metrics.Net = new NetDto
        {
            RxBps = Math.Round(rxBps, 1),
            TxBps = Math.Round(txBps, 1),
            Nics = _nics
                .Select(kv =>
                {
                    var nic = NetworkInterface.GetAllNetworkInterfaces()
                        .FirstOrDefault(n => n.Id == kv.Key);
                    return (kv.Key, kv.Value, Name: nic?.Name ?? kv.Key);
                })
                .OrderByDescending(t => t.Value.RxBps + t.Value.TxBps)
                .Take(6)
                .Select(t => new NicDto
                {
                    Name = t.Name.Length > 14 ? t.Name[..13] + "…" : t.Name,
                    RxBps = Math.Round(t.Value.RxBps, 1),
                    TxBps = Math.Round(t.Value.TxBps, 1),
                })
                .ToList(),
        };
    }
}
