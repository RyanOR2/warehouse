// pages/stock/index.js
const { formatMoney, formatDate } = require("../../utils/format");
const remind = require("../../utils/remind");

Page({
  data: {
    totalStock: 0,
    categorySummary: [],
    list: [],
    categories: [],
    filterCatIndex: -1,
    statusOptions: [
      { label: "全部", value: "" },
      { label: "临期", value: "expiring" },
      { label: "已过期", value: "expired" },
      { label: "未填生产日期", value: "unfilled" },
    ],
    statusIndex: 0,
    remindQuota: null, // { expiringQuota, expiredQuota, newOrderQuota }
  },

  onShow() {
    this.loadCategories();
    this.loadStats();
    this.loadRemindQuota();
  },

  loadRemindQuota() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getRemindQuota" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) this.setData({ remindQuota: result.data });
      })
      .catch((e) => console.error(e));
  },

  loadCategories() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getCategories" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) this.setData({ categories: result.data });
      })
      .catch((e) => console.error(e));
  },

  loadStats() {
    const { filterCatIndex, categories, statusIndex, statusOptions } = this.data;
    const categoryId = filterCatIndex >= 0 ? categories[filterCatIndex]._id : "";
    const expiryStatus = statusOptions[statusIndex].value;
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getStockStats", categoryId, expiryStatus },
      })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const list = (result.data.list || []).map((b) => {
          let shelfText = "—";
          let shelfClass = "tag-gray";
          if (b.expiryStatus === "unfilled") {
            shelfText = "未填生产日期";
            shelfClass = "tag-red";
          } else if (b.expiryStatus === "expired") {
            shelfText = `已过期 ${Math.abs(b.daysLeft)} 天`;
            shelfClass = "tag-red";
          } else if (b.expiryStatus === "expiring") {
            shelfText = `临期 ${b.daysLeft} 天`;
            shelfClass = "tag-orange";
          } else if (b.expiryStatus === "normal") {
            shelfText = `剩余 ${b.daysLeft} 天`;
            shelfClass = "tag-green";
          }
          return {
            ...b,
            shelfText,
            shelfClass,
            sellingPriceText: formatMoney(b.sellingPrice),
            earliestExpiryText: formatDate(b.earliestExpiryDate),
          };
        });
        this.setData({
          totalStock: result.data.totalStock,
          categorySummary: result.data.categorySummary,
          list,
        });
      })
      .catch((e) => console.error(e));
  },

  onFilterCategory(e) {
    this.setData({ filterCatIndex: Number(e.detail.value) });
    this.loadStats();
  },

  onFilterStatus(e) {
    this.setData({ statusIndex: Number(e.detail.value) });
    this.loadStats();
  },

  onClearFilter() {
    this.setData({ filterCatIndex: -1, statusIndex: 0 });
    this.loadStats();
  },

  onSubscribeRemind() {
    remind.subscribeRemind();
  },
});
