using System.Diagnostics;
using System.Net.NetworkInformation;

namespace CrtMonitor.Collectors;

/// <summary>网络吞吐：BCL 网卡统计（累计字节）差分。过滤回环/隧道/非活动接口。</summary>
public sealed class NetCollector : ICollector
{
    private long _prevRx;
    private long _prevTx;
    private long _prevAt;
    private bool _hasPrev;

    public void Poll(TickDto tick)
    {
        long rx = 0, tx = 0;
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
            try
            {
                // 部分虚拟网卡的 IPv4 统计会抛 NetworkInformationException，跳过而不是丢掉整拍
                var stats = nic.GetIPv4Statistics();
                rx += stats.BytesReceived;
                tx += stats.BytesSent;
            }
            catch
            {
                // 忽略该网卡
            }
        }

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

        tick.Metrics.Net = new NetDto { RxBps = Math.Round(rxBps, 1), TxBps = Math.Round(txBps, 1) };
    }
}
