// pages/index/index.js
const app = getApp();

Page({
  data: {
    menus: [
      { key: "inbound", title: "进货入库", icon: "📥", path: "/pages/inbound/index", disabled: false },
      { key: "outbound", title: "销售出库", icon: "📤", path: "/pages/outbound/index", disabled: false },
      { key: "return", title: "退货入库", icon: "↩️", path: "/pages/return/index", disabled: false },
      { key: "scrap", title: "报废出库", icon: "🗑️", path: "/pages/scrap/index", disabled: false },
      { key: "stocktake", title: "库存盘点", icon: "🧮", path: "/pages/stocktake/index", disabled: false },
      { key: "manage", title: "仓库管理", icon: "🍺", path: "/pages/manage/index", disabled: false },
      { key: "stock", title: "库存统计", icon: "📊", path: "/pages/stock/index", disabled: false },
      { key: "stats", title: "销售统计", icon: "💰", path: "/pages/statistics/index", disabled: false },
      { key: "ledger", title: "流水", icon: "🧾", path: "/pages/ledger/index", disabled: false },
      { key: "orders", title: "订单管理", icon: "📋", path: "/pages/orders/index", disabled: false },
      { key: "export", title: "数据导出", icon: "📄", path: "/pages/export/index", disabled: false },
      { key: "members", title: "成员管理", icon: "👥", path: "/pages/members/index", disabled: false },
      { key: "settings", title: "设置", icon: "⚙️", path: "/pages/settings/index", disabled: false },
    ],
    remind: { total: 0, list: [] },
    showTip: false,
    title: "",
    content: "",
  },

  onShow() {
    this.loadRemind();
  },

  // 兜底提醒：加载临期/过期批次清单，首页红点 + 列表展示
  loadRemind() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getRemindList" } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const { expiring = [], expired = [], total = 0 } = result.data;
        const mapItem = (it, isExpired) => ({
          ...it,
          _k: it.batchId,
          text: isExpired ? `已过期 ${Math.abs(it.daysLeft)} 天` : `临期 ${it.daysLeft} 天`,
          cls: isExpired ? "tag-red" : "tag-orange",
        });
        const list = [
          ...expired.map((it) => mapItem(it, true)),
          ...expiring.map((it) => mapItem(it, false)),
        ];
        this.setData({ remind: { total, list } });
      })
      .catch((e) => console.error(e));
  },

  onGoStock() {
    wx.navigateTo({ url: "/pages/stock/index" });
  },

  onMenuTap(e) {
    const { index } = e.currentTarget.dataset;
    const menu = this.data.menus[index];
    if (!menu) return;
    if (menu.disabled) {
      wx.showToast({ title: "敬请期待", icon: "none" });
      return;
    }
    if (!app.globalData.env) {
      this.setData({
        showTip: true,
        title: "云开发环境未配置",
        content: "请在 miniprogram/app.js 中正确配置 env 参数后重试。",
      });
      return;
    }
    wx.navigateTo({ url: menu.path });
  },

  onCloseTip() {
    this.setData({ showTip: false });
  },
});
