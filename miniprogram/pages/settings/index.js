// pages/settings/index.js
Page({
  data: {
    expiringDays: "",
  },

  onShow() {
    this.loadSettings();
  },

  loadSettings() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getSettings" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          this.setData({ expiringDays: String(result.data.expiringDays) });
        }
      })
      .catch((e) => console.error(e));
  },

  onInput(e) {
    this.setData({ expiringDays: e.detail.value });
  },

  onSave() {
    const v = Number(this.data.expiringDays);
    if (!Number.isInteger(v) || v <= 0 || v > 365) {
      return wx.showToast({ title: "阈值需为 1~365 的整数", icon: "none" });
    }
    wx.showLoading({ title: "保存中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "updateSettings", expiringDays: v } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已保存", icon: "success" });
        } else {
          wx.showToast({ title: result.errMsg || "保存失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  },
});
