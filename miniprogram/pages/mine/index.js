// pages/mine/index.js
const { formatMoney, formatDate } = require("../../utils/format");
const remind = require("../../utils/remind");

const STATUS_MAP = {
  pending: { label: "待处理", cls: "tag-orange" },
  completed: { label: "已完成", cls: "tag-green" },
  cancelled: { label: "已取消", cls: "tag-gray" },
};

Page({
  data: {
    role: "",
    isAdmin: false,
    orders: [],
    showJoin: false,
    inviteCode: "",
    remindQuota: null, // { expiringQuota, expiredQuota, newOrderQuota }
  },

  onShow() {
    this.loadRole();
    this.loadOrders();
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

  loadRole() {
    const app = getApp();
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getMyRole" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          app.globalData.role = result.data.role;
          app.globalData.isAdmin = !!result.data.isAdmin;
          this.setData({ role: result.data.role, isAdmin: !!result.data.isAdmin });
        }
      })
      .catch((e) => console.error(e));
  },

  loadOrders() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getOrders", page: 1, pageSize: 20 } })
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
        this.setData({ orders: list });
      })
      .catch((e) => console.error(e));
  },

  onGoAdmin() {
    wx.navigateTo({ url: "/pages/index/index" });
  },

  onGoOrders() {
    wx.navigateTo({ url: "/pages/orders/index" });
  },

  onGoMyOrders() {
    wx.navigateTo({ url: "/pages/my-orders/index" });
  },

  onGoMembers() {
    wx.navigateTo({ url: "/pages/members/index" });
  },

  onGoSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  onSubscribeRemind() {
    remind.subscribeRemind();
  },

  onOpenJoin() {
    this.setData({ showJoin: true, inviteCode: "" });
  },

  onCloseJoin() {
    this.setData({ showJoin: false });
  },

  noop() {},

  onJoinInput(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  onSubmitJoin() {
    const code = this.data.inviteCode.trim();
    if (!code) return wx.showToast({ title: "请输入邀请码", icon: "none" });
    wx.showLoading({ title: "加入中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "joinByInvite", code } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已加入", icon: "success" });
          this.setData({ showJoin: false });
          this.loadRole();
        } else {
          wx.showToast({ title: result.errMsg || "加入失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },
});
