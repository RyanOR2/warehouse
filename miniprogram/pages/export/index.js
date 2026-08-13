// pages/export/index.js
const TARGETS = [
  { key: "transactions", label: "流水明细", icon: "🧾" },
  { key: "stock", label: "库存清单", icon: "📦" },
  { key: "sales", label: "销售统计", icon: "💰" },
  { key: "adjust", label: "盘点记录", icon: "🧮" },
];

const PERIODS = [
  { key: "day", label: "今日" },
  { key: "month", label: "本月" },
  { key: "year", label: "今年" },
];

Page({
  data: {
    targets: TARGETS,
    target: "transactions",
    periods: PERIODS,
    periodIndex: 1,
    showDateRange: true,
    startDate: "",
    endDate: "",
    exporting: false,
  },

  onTargetTap(e) {
    const target = e.currentTarget.dataset.key;
    this.setData({
      target,
      showDateRange: target === "transactions" || target === "adjust",
    });
  },

  onPeriodChange(e) {
    this.setData({ periodIndex: Number(e.detail.value) });
  },

  onStartDate(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDate(e) {
    this.setData({ endDate: e.detail.value });
  },

  onExport() {
    if (this.data.exporting) return;
    const { target, periods, periodIndex, startDate, endDate } = this.data;
    const data = { type: "exportData", target };
    if (target === "transactions" || target === "adjust") {
      if (startDate) data.startDate = startDate;
      if (endDate) data.endDate = endDate;
    } else if (target === "sales") {
      data.period = periods[periodIndex].key;
    }

    this.setData({ exporting: true });
    wx.showLoading({ title: "生成中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data })
      .then((resp) => {
        wx.hideLoading();
        this.setData({ exporting: false });
        const result = resp.result || {};
        if (!result.success) {
          wx.showToast({ title: result.errMsg || "导出失败", icon: "none" });
          return;
        }
        wx.setClipboardData({
          data: result.data.csv,
          success: () => {
            wx.showModal({
              title: "已复制",
              content: "CSV 已复制到剪贴板，请粘贴到 Excel 或记事本保存。",
              showCancel: false,
              confirmText: "知道了",
            });
          },
        });
      })
      .catch((e) => {
        wx.hideLoading();
        this.setData({ exporting: false });
        console.error(e);
        wx.showToast({ title: "导出失败", icon: "none" });
      });
  },
});
