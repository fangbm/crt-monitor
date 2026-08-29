using System.Runtime.InteropServices;

namespace CrtMonitor;

/// <summary>系统主音量（IAudioEndpointVolume COM，免管理员）。媒体卡滚轮调节用。</summary>
public static class AudioVolume
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private sealed class MMDeviceEnumeratorCom { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        // 后续方法未用到，不声明
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        int OpenPropertyStore(int access, out IntPtr store);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out int count);
        int SetMasterVolumeLevel(float levelDb, IntPtr ctx);
        int SetMasterVolumeLevelScalar(float level, IntPtr ctx);
        int GetMasterVolumeLevel(out float levelDb);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float levelDb, IntPtr ctx);
        int SetChannelVolumeLevelScalar(uint channel, float level, IntPtr ctx);
        int GetChannelVolumeLevel(uint channel, out float levelDb);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute(bool mute, IntPtr ctx);
        int GetMute(out bool mute);
    }

    private static IMMDevice? _device;

    private static IMMDevice? GetDevice()
    {
        if (_device is not null) return _device;
        try
        {
            var en = (IMMDeviceEnumerator)(object)new MMDeviceEnumeratorCom();
            // eRender=0, eMultimedia=1
            en.GetDefaultAudioEndpoint(0, 1, out var dev);
            _device = dev;
        }
        catch (Exception ex)
        {
            Program.Log($"audio init failed: {ex.Message}");
        }
        return _device;
    }

    public static (int volume, bool muted) Get()
    {
        var dev = GetDevice();
        if (dev is null) return (0, false);
        try
        {
            var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
            dev.Activate(ref iid, 1, IntPtr.Zero, out var obj);
            var vol = (IAudioEndpointVolume)obj;
            vol.GetMasterVolumeLevelScalar(out float level);
            vol.GetMute(out bool mute);
            return ((int)Math.Round(level * 100), mute);
        }
        catch
        {
            return (0, false);
        }
    }

    public static void Set(int percent)
    {
        var dev = GetDevice();
        if (dev is null) return;
        try
        {
            var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
            dev.Activate(ref iid, 1, IntPtr.Zero, out var obj);
            var vol = (IAudioEndpointVolume)obj;
            vol.SetMasterVolumeLevelScalar(Math.Clamp(percent, 0, 100) / 100f, IntPtr.Zero);
        }
        catch { /* 设备瞬断忽略 */ }
    }
}
