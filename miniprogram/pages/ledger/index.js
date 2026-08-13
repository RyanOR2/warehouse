// pages/ledger/index.js
const { formatMoney, formatDate } = require("../../utils/format");

const TYPE_OPTIONS = [
  { label: "全部", value: "" },
  { label: "进货", value: "in" },
  { label: "出库", value: "out" },
  { label: "退货", value: "return" },
  { label: "报废", value: "scrap" },
  { label: "盘点", value: "adjust" },
];
const TIME_OPTIONS = [
  { label: "全部", value: "" },
  { label: "近7天", value: "7" },
  { label: "近30天", value: "30" },
  { label: "本月", value: "month" },
];
const TYPE_MAP = {
  in: { label: "进货", cls: "tag-green" },
  out: { label: "出库", cls: "tag-orange" },
  return: { label: "退货", cls: "tag-gray" },
  scrap: { label: "报废", cls: "tag-red" },
  adjust: { label: "盘点", cls: "tag-gray" },
};

Page({
  data: {
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
    timeOptions: TIME_OPTIONS,
    timeIndex: 0,
    summary: { salesAmount: 0, profit: 0, loss: 0, count: 0 },
    summaryText: { salesAmount: "0.00", profit: "0.00", loss: "0.00" },
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
  },

  onLoad() {
    this.loadLedger(true);
  },

  getDateRange() {
    const { timeOptions, timeIndex } = this.data;
    const value = timeOptions[timeIndex].value;
    const now = new Date();
    let startDate = "";
    if (value === "7") startDate = formatDate(new Date(now.getTime() - 6 * 86400000));
    else if (value === "30") startDate = formatDate(new Date(now.getTime() - 29 * 86400000));
    else if (value === "month") startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    return { startDate, endDate: "" };
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
    this.loadLedger(true);
  },

  onTimeChange(e) {
    this.setData({ timeIndex: Number(e.detail.value) });
    this.loadLedger(true);
  },

  loadLedger(reset) {
    if (this.data.loading) return;
    const { typeOptions, typeIndex, pageSize } = this.data;
    const page = reset ? 1 : this.data.page;
    const txnType = typeOptions[typeIndex].value;
    const { startDate, endDate } = this.getDateRange();

    this.setData({ loading: true });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getTransactions", page, pageSize, txnType, startDate, endDate },
      })
      .then((resp) => {
        this.setData({ loading: false });
        const result = resp.result || {};
        if (!result.success) return;
        const { list, summary, hasMore } = result.data;
        const formatted = list.map((t) => this.formatRow(t));
        this.setData({
          summary,
          summaryText: {
            salesAmount: formatMoney(summary.salesAmount),
            profit: formatMoney(summary.profit),
            loss: formatMoney(summary.loss),
          },
          list: reset ? formatted : this.data.list.concat(formatted),
          page,
          hasMore,
        });
      })
      .catch((e) => {
        this.setData({ loading: false });
        console.error(e);
      });
  },

  formatRow(t) {
    const tm = TYPE_MAP[t.type] || { label: "其他", cls: "tag-gray" };
    let qtyText = String(t.quantity || 0);
    let qtyCls = "text-green";
    if (t.type === "out" || t.type === "scrap") {
      qtyText = "-" + qtyText;
      qtyCls = "text-danger";
    } else if (t.type === "return" || t.type === "in") {
      qtyText = "+" + qtyText;
    } else if (t.type === "adjust") {
      qtyText = (t.quantity > 0 ? "+" : "") + qtyText;
      qtyCls = t.quantity < 0 ? "text-danger" : "text-green";
    }

    let amountLabel = "";
    if (t.type === "out") amountLabel = "销售额";
    else if (t.type === "return") amountLabel = "退货额";
    else if (t.type === "scrap" || t.type === "adjust") amountLabel = "损失";

    return {
      ...t,
      typeLabel: tm.label,
      typeCls: tm.cls,
      qtyText,
      qtyCls,
      timeText: formatDate(t.createdAt),
      unitPriceText: t.unitPrice != null ? formatMoney(t.unitPrice) : "",
      amountLabel,
      amountText: t.amount != null ? formatMoney(t.amount) : "",
      amountCls: t.type === "out" ? "" : "text-danger",
      profitText: t.profit != null ? formatMoney(t.profit) : "",
      profitCls: t.profit >= 0 ? "text-green" : "text-danger",
      showProfit: t.type === "out" || t.type === "return",
      showAmount: t.amount != null && t.amount !== 0,
    };
  },

  onReachBottom() {
    if (this.data.hasMore) this.loadLedger(false);
  },
});
