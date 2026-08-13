// pages/statistics/index.js
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    periodOptions: [
      { label: "当日", value: "day" },
      { label: "当月", value: "month" },
      { label: "当年", value: "year" },
    ],
    periodIndex: 0,
    granOptions: [
      { label: "周", value: "week" },
      { label: "月", value: "month" },
      { label: "季", value: "quarter" },
      { label: "年", value: "year" },
    ],
    granIndex: 1,
    summary: { salesAmount: 0, profit: 0, salesQty: 0, orderCount: 0 },
    summarySalesAmountText: "0.00",
    summaryProfitText: "0.00",
    chartLabels: [],
    chartSeries: [],
    ranking: [],
  },

  onShow() {
    this.loadStats();
  },

  loadStats() {
    const { periodOptions, periodIndex, granOptions, granIndex } = this.data;
    const period = periodOptions[periodIndex].value;
    const granularity = granOptions[granIndex].value;
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getSalesStats", period, granularity },
      })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const { summary, trend, ranking } = result.data;
        this.setData({
          summary,
          summarySalesAmountText: formatMoney(summary.salesAmount),
          summaryProfitText: formatMoney(summary.profit),
          chartLabels: trend.map((t) => t.label),
          chartSeries: [
            { name: "销售额", color: "#F5A623", data: trend.map((t) => t.salesAmount) },
            { name: "净利润", color: "#3B82F6", data: trend.map((t) => t.profit) },
          ],
          ranking: ranking.map((r) => ({
            ...r,
            salesAmountText: formatMoney(r.salesAmount),
            profitText: formatMoney(r.profit),
          })),
        });
      })
      .catch((e) => console.error(e));
  },

  onPeriod(e) {
    this.setData({ periodIndex: Number(e.currentTarget.dataset.i) });
    this.loadStats();
  },

  onGran(e) {
    this.setData({ granIndex: Number(e.currentTarget.dataset.i) });
    this.loadStats();
  },
});
