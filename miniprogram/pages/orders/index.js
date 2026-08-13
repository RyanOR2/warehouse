// pages/orders/index.js
const { formatMoney, formatDate } = require("../../utils/format");

const STATUS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "待处理", value: "pending" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" },
];
const STATUS_MAP = {
  pending: { label: "待处理", cls: "tag-orange" },
  completed: { label: "已完成", cls: "tag-green" },
  cancelled: { label: "已取消", cls: "tag-gray" },
};

Page({
  data: {
    statusOptions: STATUS_OPTIONS,
    statusIndex: 0,
    list: [],
  },

  onShow() {
    this.loadOrders();
  },

  loadOrders() {
    const status = STATUS_OPTIONS[this.data.statusIndex].value;
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getOrders", page: 1, pageSize: 50, status } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const list = (result.data.list || []).map((o) => {
          const st = STATUS_MAP[o.status] || { label: "未知", cls: "tag-gray" };
          return {
            ...o,
            statusLabel: st.label,
            statusCls: st.cls,
            timeText: formatDate(o.createdAt),
            amountText: formatMoney(o.totalAmount),
          };
        });
        this.setData({ list });
      })
      .catch((e) => console.error(e));
  },

  onStatusChange(e) {
    this.setData({ statusIndex: Number(e.detail.value) });
    this.loadOrders();
  },

  onComplete(e) {
    this.confirm(e.currentTarget.dataset.id, "completed", "完成");
  },

  onCancel(e) {
    this.confirm(e.currentTarget.dataset.id, "cancelled", "取消");
  },

  confirm(id, status, label) {
    const tip = status === "cancelled" ? "取消后库存将回补。" : "";
    wx.showModal({
      title: "提示",
      content: `确定${label}该订单吗？${tip}`,
      success: (res) => {
        if (res.confirm) this.updateStatus(id, status);
      },
    });
  },

  updateStatus(id, status) {
    wx.showLoading({ title: "处理中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "updateOrderStatus", orderId: id, status } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已更新", icon: "success" });
          this.loadOrders();
        } else {
          wx.showToast({ title: result.errMsg || "操作失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },
});
