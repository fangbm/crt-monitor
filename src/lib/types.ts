/** metrics://tick 载荷协议 v1。前后端共用此结构，新增字段必须可选或递增 version。 */

export interface MetricsTick {
  version: 1;
  ts: number;
  uptime: number;
  host: HostInfo;
  metrics: {
    cpu: CpuReading;
    mem: MemReading;
    disks: DiskReading[];
    net: NetReading;
    proc: ProcReading[];
    sensors: SensorsReading | null;
    weather: WeatherReading | null;
    battery: BatteryReading | null;
    /** 触发中的告警消息（空数组 = 无） */
    alerts: string[];
    /** 最近告警记录（新→旧，最多 30 条；仅在有新告警的 tick 携带） */
    alert_history?: AlertEntry[];
    media: MediaReading | null;
    scripts: ScriptReading[];
    remotes: RemoteReading[];
    pings: PingReading[];
    events: EventReading[];
    boot: BootReading | null;
  };
}

export interface PingReading {
  name: string;
  ms: number;
  lost_pct: number;
  series: number[];
}

export interface EventReading {
  ts: number;
  level: string;
  source: string;
  msg: string;
}

export interface BootReading {
  booted_at: number;
  last_shutdown: number;
}

export interface MediaReading {
  title: string;
  artist: string;
  status: string;
  pos_sec: number;
  dur_sec: number;
  volume: number;
  muted: boolean;
}

export interface ScriptReading {
  name: string;
  value: string;
  age_ms: number;
}

export interface RemoteReading {
  name: string;
  cpu: number;
  mem_pct: number;
  mem_used: number;
  mem_total: number;
  rx_bps: number;
  tx_bps: number;
  age_ms: number;
}

export interface BatteryReading {
  present: boolean;
  charge_pct: number | null;
  ac_power: boolean;
}

export interface HistoryPoint {
  /** 分钟起点 unix 秒 */
  t: number;
  cpu: number;
  cpu_max: number;
  mem: number;
  rx: number;
  tx: number;
}

export interface HistoryStats {
  cpu_max: number;
  cpu_avg: number;
  mem_max: number;
  rx_max: number;
  tx_max: number;
  today_rx: number;
  today_tx: number;
}

export interface HistoryMsg {
  type: "history";
  points: HistoryPoint[];
  /** 7 天降采样（10 分钟粒度） */
  points10m?: HistoryPoint[];
  stats: HistoryStats;
}

export interface SensorsReading {
  cpu_temp: number | null;
  gpu_temp: number | null;
  gpu_load: number | null;
  gpu_name: string;
  gpu_mem_used_mb: number | null;
  gpu_mem_total_mb: number | null;
}

export interface WeatherReading {
  temp_c: number;
  humidity: number;
  wind_kmh: number;
  code: number;
  text: string;
  place: string;
  forecast: ForecastDay[];
}

export interface ForecastDay {
  code: number;
  min_c: number;
  max_c: number;
}

export interface AlertEntry {
  ts: number;
  msg: string;
}

export interface ProcReading {
  name: string;
  /** 0-100，全机归一（非单核） */
  cpu: number;
  /** 工作集合计 */
  mem_b: number;
}

export interface HostInfo {
  name: string;
  os: string;
  cpu_model: string;
  core_count: number;
}

export interface CpuReading {
  /** 0-100 */
  usage: number;
  /** 0-100, len == core_count */
  cores: number[];
  freq_mhz: number | null;
}

export interface MemReading {
  total_b: number;
  used_b: number;
  swap_total_b: number;
  swap_used_b: number;
}

export interface DiskReading {
  name: string;
  mount: string;
  total_b: number;
  available_b: number;
  read_bps: number | null;
  write_bps: number | null;
}

export interface NetReading {
  rx_bps: number;
  tx_bps: number;
  nics: NicReading[];
}

export interface NicReading {
  name: string;
  rx_bps: number;
  tx_bps: number;
}
