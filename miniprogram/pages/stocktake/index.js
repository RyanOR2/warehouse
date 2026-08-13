// pages/stocktake/index.js
Page({
  data: {
    beers: [], // [{ _id, name, stock, actualQty }]
    remark: "",
  },

  onShow() {
    this.loadBeers();
  },

  loadBeers() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getBeers", status: "active" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          const beers = result.data.map((b) => ({ ...b, actualQty: "" }));
          this.setData({ beers });
        }
      })
      .catch((e) => console.error(e));
  },

  onActualInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`beers[${index}].actualQty`]: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onSubmit() {
    const { beers, remark } = this.data;
    const items = [];
    for (const b of beers) {
      if (b.actualQty === "" || b.actualQty === undefined) continue;
      const actualQty = Number(b.actualQty);
      if (!Number.isInteger(actualQty) || actualQty < 0) {
        return wx.showToast({ title: `${b.name} 数量须为非负整数`, icon: "none" });
      }
      items.push({ beerId: b._id, actualQty });
    }
    if (!items.length)
      return wx.showToast({ title: "请至少填写一个品类的实际数量", icon: "none" });

    wx.showModal({
      title: "确认盘点",
      content: `共盘点 ${items.length} 个品类，提交后库存将调整为实际数量。`,
      success: (res) => {
        if (res.confirm) this.doStocktake(items, remark);
      },
    });
  },

  doStocktake(items, remark) {
    wx.showLoading({ title: "盘点中..." });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "stocktake", items, remark },
      })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          const adjustments = result.data.adjustments || [];
          const gain = adjustments.filter((a) => a.diff > 0).length;
          const loss = adjustments.filter((a) => a.diff < 0).length;
          const same = items.length - adjustments.length;
          wx.showModal({
            title: "盘点完成",
            content: `盘盈 ${gain} 项，盘亏 ${loss} 项，无差异 ${same} 项。`,
            showCancel: false,
            confirmText: "知道了",
            success: () => {
              this.setData({ remark: "" });
              this.loadBeers();
            },
          });
        } else {
          wx.showToast({ title: result.errMsg || "盘点失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "盘点失败", icon: "none" });
      });
  },
});
