using System.Drawing.Drawing2D;

namespace CrtMonitor;

/// <summary>托盘图标：显示 CPU% 数字，左键切窗口显隐，右键菜单（页面提示/退出）。</summary>
public sealed class TrayService : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly Func<int> _getScreenIndex;
    private int _lastPercent = -1;

    public TrayService(Form owner, Func<int> getScreenIndex)
    {
        _getScreenIndex = getScreenIndex;
        _icon = new NotifyIcon
        {
            Text = "CRT-Monitor",
            Icon = MakeIcon(100),
            Visible = true,
        };
        _icon.MouseClick += (s, e) =>
        {
            if (e.Button == MouseButtons.Left)
                ToggleVisible(owner);
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("显示 / 隐藏", null, (_, _) => ToggleVisible(owner));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("导出配置…", null, (_, _) => ExportConfig(owner));
        menu.Items.Add("导入配置…", null, (_, _) => ImportConfig(owner));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, (_, _) => owner.Close());
        _icon.ContextMenuStrip = menu;
    }

    public void ShowBalloon(string title, string message)
    {
        _icon.BalloonTipTitle = title;
        _icon.BalloonTipText = message;
        _icon.ShowBalloonTip(4000);
    }

    private static void ExportConfig(Form owner)
    {
        using var dlg = new SaveFileDialog
        {
            Title = "导出 CRT-Monitor 配置",
            Filter = "config.json|config.json",
            FileName = "config.json",
        };
        string src = Path.Combine(AppContext.BaseDirectory, "config.json");
        if (dlg.ShowDialog(owner) == DialogResult.OK && File.Exists(src))
            File.Copy(src, dlg.FileName, overwrite: true);
    }

    private static void ImportConfig(Form owner)
    {
        using var dlg = new OpenFileDialog
        {
            Title = "导入 CRT-Monitor 配置（重启后生效）",
            Filter = "config.json|config.json",
        };
        string dest = Path.Combine(AppContext.BaseDirectory, "config.json");
        if (dlg.ShowDialog(owner) == DialogResult.OK)
        {
            File.Copy(dlg.FileName, dest, overwrite: true);
            MessageBox.Show(owner, "配置已导入，重启 CRT-Monitor 后生效。", "CRT-Monitor",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    /// <summary>CPU% 变化时重绘图标（限 10% 步进，避免频繁重绘）。</summary>
    public void UpdateCpu(double percent)
    {
        int p = (int)Math.Round(percent / 10) * 10;
        if (p == _lastPercent) return;
        _lastPercent = p;
        // NotifyIcon.Icon 可空；先替换再释放旧图标，避免空引用和短暂无图标。
        Icon? oldIcon = _icon.Icon;
        _icon.Icon = MakeIcon(Math.Clamp(p, 0, 100));
        oldIcon?.Dispose();
        _icon.Text = $"CRT-Monitor  CPU {Math.Round(percent)}%";
    }

    private void ToggleVisible(Form owner)
    {
        if (owner.Visible)
        {
            owner.Hide();
        }
        else
        {
            owner.Show();
            owner.Bounds = Screen.AllScreens[_getScreenIndex()].Bounds;
            owner.WindowState = FormWindowState.Maximized;
        }
    }

    /// <summary>动态画一个绿底百分比数字图标。</summary>
    private static Icon MakeIcon(int percent)
    {
        using var bmp = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.FromArgb(3, 9, 5));
        using var pen = new Pen(Color.FromArgb(0x0e, 0x5a, 0x28), 2);
        g.DrawRectangle(pen, 1, 1, 29, 29);
        using var brush = new SolidBrush(Color.FromArgb(0x3d, 0xff, 0x7c));
        using var font = new Font("Segoe UI", percent >= 100 ? 11 : 13, FontStyle.Bold, GraphicsUnit.Pixel);
        var text = percent.ToString();
        var size = g.MeasureString(text, font);
        g.DrawString(text, font, brush, (32 - size.Width) / 2, (32 - size.Height) / 2);
        return Icon.FromHandle(bmp.GetHicon());
    }

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Icon?.Dispose();
        _icon.Dispose();
    }
}
