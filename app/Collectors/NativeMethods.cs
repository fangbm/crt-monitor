using System.Runtime.InteropServices;

namespace CrtMonitor.Collectors;

/// <summary>全部原生 API 集中在这里。刻意避开性能计数器（分类名会随系统语言本地化）。</summary>
internal static class NativeMethods
{
    // ---- 内存 / 交换 ----

    [StructLayout(LayoutKind.Sequential)]
    private class MEMORYSTATUSEX
    {
        public uint dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>();
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX buffer);

    public static (ulong total, ulong avail, ulong swapTotal, ulong swapAvail) QueryMemory()
    {
        var s = new MEMORYSTATUSEX();
        return GlobalMemoryStatusEx(s)
            ? (s.ullTotalPhys, s.ullAvailPhys, s.ullTotalPageFile, s.ullAvailPageFile)
            : (0, 0, 0, 0);
    }

    // ---- 每核 CPU 时间 ----

    private const int SystemProcessorPerformanceInformation = 8;

    [DllImport("ntdll.dll")]
    private static extern int NtQuerySystemInformation(
        int infoClass, IntPtr info, int length, out int returnLength);

    /// <summary>返回每核 (idle, kernel+user) 的累计时间（100ns 单位）；kernel 已包含 idle。</summary>
    public static (long[] idle, long[] busy) QueryProcessorTimes()
    {
        int coreCount = Environment.ProcessorCount;
        int stride = 48; // x64 下每条记录 48 字节，返回后按 returnLength 校正
        IntPtr buf = Marshal.AllocHGlobal(stride * coreCount);
        try
        {
            int len = stride * coreCount;
            int status = NtQuerySystemInformation(SystemProcessorPerformanceInformation, buf, len, out int retLen);
            if (status != 0 || retLen <= 0) return (Array.Empty<long>(), Array.Empty<long>());
            stride = retLen / coreCount;

            var idle = new long[coreCount];
            var busy = new long[coreCount];
            for (int i = 0; i < coreCount; i++)
            {
                long idl = Marshal.ReadInt64(buf, i * stride);
                long krn = Marshal.ReadInt64(buf, i * stride + 8);
                long usr = Marshal.ReadInt64(buf, i * stride + 16);
                idle[i] = idl;
                busy[i] = krn + usr - idl;
            }
            return (idle, busy);
        }
        finally
        {
            Marshal.FreeHGlobal(buf);
        }
    }

    // ---- CPU 实时频率 ----

    [DllImport("powrprof.dll")]
    private static extern uint CallNtPowerInformation(
        int informationLevel, IntPtr inputBuffer, int inputSize,
        byte[] outputBuffer, int outputSize);

    private const int ProcessorInformation = 11;

    /// <summary>每核当前频率 MHz（PowerInformation 结构前三个 ULONG 为 Number/MaxMhz/CurrentMhz）。</summary>
    public static long[] QueryCoreFrequencies()
    {
        int coreCount = Environment.ProcessorCount;
        var buf = new byte[24 * coreCount];
        if (CallNtPowerInformation(ProcessorInformation, IntPtr.Zero, 0, buf, buf.Length) != 0)
            return Array.Empty<long>();
        var freqs = new long[coreCount];
        for (int i = 0; i < coreCount; i++)
            freqs[i] = BitConverter.ToUInt32(buf, i * 24 + 8);
        return freqs;
    }
}
