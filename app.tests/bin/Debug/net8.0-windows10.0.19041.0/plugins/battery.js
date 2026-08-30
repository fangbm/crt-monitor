// CRT-Monitor 前端插件示例：电池面板。
// 约定：纯 ES module，通过全局 CRT.registerWidget({id, title, span?, create}) 注册，
// create(host) 返回 {update(metricsTick)}。数据由同名 C# Collector（BatteryCollector）
// 写入 metrics.battery：{present, charge_pct, ac_power}。
(function () {
  "use strict";
  var CRT = globalThis.CRT;
  if (!CRT) throw new Error("CRT-Monitor host not found");

  function bar(ratio, cells) {
    cells = cells || 24;
    var filled = Math.round(Math.min(1, Math.max(0, ratio)) * cells);
    return "█".repeat(filled) + "░".repeat(cells - filled);
  }

  CRT.registerWidget({
    id: "battery",
    title: "BATT",
    span: 2,
    create: function (host) {
      var head = document.createElement("div");
      head.className = "w-head";
      head.textContent = "BATTERY";
      var big = document.createElement("div");
      big.className = "w-big";
      big.textContent = "—";
      var bar = document.createElement("div");
      bar.className = "w-batt-bar";
      var note = document.createElement("div");
      note.className = "w-weather-detail";
      host.append(head, big, bar, note);

      return {
        update: function (m) {
          var b = (m.metrics && m.metrics.battery) || null;
          if (!b || !b.present) {
            big.textContent = "N/A";
            bar.textContent = "";
            note.textContent = "NO BATTERY / PLUGIN";
            return;
          }
          big.textContent = Math.round(b.charge_pct || 0) + "%";
          bar.textContent = barfn((b.charge_pct || 0) / 100);
          note.textContent = b.ac_power ? "AC POWER ⚡ CHARGING" : "ON BATTERY";
        },
      };
    },
  });

  function barfn(r) {
    return bar(r);
  }
})();
