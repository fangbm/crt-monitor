using System.Globalization;
using System.Management;

namespace CrtMonitor.Collectors;

/// <summary>磁盘容量（DriveInfo）+ 读写速率（WMI PerfDisk 格式化类，失败时速率留 null）。</summary>
public sealed class DiskCollector : ICollector
{
    private ManagementObjectSearcher? _rateSearcher;

    public void Poll(TickDto tick)
    {
        var disks = new List<DiskDto>();
        foreach (var drive in DriveInfo.GetDrives())
        {
            if (drive.DriveType != DriveType.Fixed || !drive.IsReady) continue;
            disks.Add(new DiskDto
            {
                Name = string.IsNullOrEmpty(drive.VolumeLabel) ? "Local Disk" : drive.VolumeLabel,
                Mount = drive.Name.TrimEnd('\\'),
                TotalB = (ulong)drive.TotalSize,
                AvailableB = (ulong)drive.TotalFreeSpace,
                ReadBps = null,
                WriteBps = null,
            });
        }
        MergeRates(disks);
        tick.Metrics.Disks = disks;
    }

    private void MergeRates(List<DiskDto> disks)
    {
        try
        {
            _rateSearcher ??= new ManagementObjectSearcher(
                @"root\cimv2",
                "SELECT Name, DiskReadBytesPersec, DiskWriteBytesPersec " +
                "FROM Win32_PerfFormattedData_PerfDisk_LogicalDisk WHERE Name != '_Total'");

            var byMount = disks.ToDictionary(d => d.Mount, StringComparer.OrdinalIgnoreCase);
            using var results = _rateSearcher.Get();
            foreach (var row in results.Cast<ManagementObject>())
            {
                try
                {
                    if (row["Name"] is not string mount) continue;
                    // DriveInfo 的 mount 与 PerfDisk LogicalDisk.Name 都是 "C:"；
                    // 去掉冒号会让所有盘都无法匹配，读写速率始终显示为 "—"。
                    if (!byMount.TryGetValue(mount, out var disk)) continue;
                    disk.ReadBps = ToDouble(row["DiskReadBytesPersec"]);
                    disk.WriteBps = ToDouble(row["DiskWriteBytesPersec"]);
                }
                finally
                {
                    row.Dispose();
                }
            }
        }
        catch
        {
            // WMI 不可用（服务禁用/权限不足）时保持 null，界面显示 "—"
        }
    }

    private static double ToDouble(object? v) =>
        v is null ? 0 : Convert.ToDouble(v, CultureInfo.InvariantCulture);
}
