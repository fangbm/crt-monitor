namespace CrtMonitor.Collectors;

/// <summary>新指标域 = 新增一个 ICollector 实现并注册进 Scheduler。</summary>
public interface ICollector
{
    /// <summary>填充 tick 中自己负责的部分。必须无阻塞异常（失败就留默认值）。</summary>
    void Poll(TickDto tick);
}
