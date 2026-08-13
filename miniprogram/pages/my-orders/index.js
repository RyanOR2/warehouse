// pages/my-orders/index.js
const { formatMoney, formatDate } = require("../../utils/format");

const STATUS_MAP = {
  pending: { label: "待处理", cls: "tag-orange" },
  completed: { label: "已完成", cls: "tag-green" },
  cancelled: { label: "已取消", cls: "tag-gray" },
};

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
  },

  onShow() {
    this.setData({ list: [], page: 1, hasMore: true });
    this.loadOrders();
  },

  loadOrders() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getOrders", page: this.data.page, pageSize: this.data.pageSize } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const items = (result.data.list || []).map((o) => {
          const st = STATUS_MAP[o.status] || { label: "未知", cls: "tag-gray" };
          return {
            ...o,
            statusLabel: st.label,
            statusCls: st.cls,
            timeText: formatDate(o.createdAt),
            amountText: formatMoney(o.totalAmount),
          };
        });
        this.setData({
          list: this.data.list.concat(items),
          page: this.data.page + 1,
          hasMore: !!result.data.hasMore,
          loading: false,
        });
      })
      .catch((e) => {
        console.error(e);
        this.setData({ loading: false });
      });
  },

  onReachBottom() {
    this.loadOrders();
  },

  onLoadMore() {
    this.loadOrders();
  },
});
