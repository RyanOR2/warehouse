// pages/scrap/index.js
const { formatDate } = require("../../utils/format");

Page({
  data: {
    beers: [],
    beerIndex: -1,
    batches: [], // [{ _id, quantity, productionDate, expiryDate, prodText, expText, isUnfilled }]
    selectedBatchId: "",
    quantity: "",
    reasonOptions: ["临期", "损坏", "其他"],
    reasonIndex: 0,
  },

  onLoad() {
    this.loadBeers();
  },

  loadBeers() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getBeers", status: "active" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) this.setData({ beers: result.data });
      })
      .catch((e) => console.error(e));
  },

  onBeerChange(e) {
    const index = Number(e.detail.value);
    const beer = this.data.beers[index];
    this.setData({ beerIndex: index, batches: [], selectedBatchId: "", quantity: "" });
    if (beer) this.loadBatches(beer._id);
  },

  loadBatches(beerId) {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getBatches", beerId } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        let list = (result.data || []).map((b) => ({
          ...b,
          prodText: formatDate(b.productionDate),
          expText: formatDate(b.expiryDate),
          isUnfilled: !b.productionDate,
        }));
        // 有到期日的按到期日升序，未填生产日期的排最后
        list.sort((a, b) => {
          if (a.isUnfilled !== b.isUnfilled) return a.isUnfilled ? 1 : -1;
          if (!a.expiryDate || !b.expiryDate) return 0;
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        });
        // 默认选中最早到期批次
        const selectedBatchId = list.length ? list[0]._id : "";
        this.setData({ batches: list, selectedBatchId });
      })
      .catch((e) => console.error(e));
  },

  onSelectBatch(e) {
    this.setData({ selectedBatchId: e.currentTarget.dataset.id, quantity: "" });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onReasonChange(e) {
    this.setData({ reasonIndex: Number(e.detail.value) });
  },

  onSubmit() {
    const { beers, beerIndex, batches, selectedBatchId, quantity, reasonOptions, reasonIndex } = this.data;
    const beer = beers[beerIndex];
    if (!beer) return wx.showToast({ title: "请选择品类", icon: "none" });
    const batch = batches.find((b) => b._id === selectedBatchId);
    if (!batch) return wx.showToast({ title: "请选择报废批次", icon: "none" });

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0)
      return wx.showToast({ title: "报废数量必须为正整数", icon: "none" });
    if (qty > batch.quantity)
      return wx.showToast({ title: `批次库存不足（剩余 ${batch.quantity} 瓶）`, icon: "none" });

    const remark = reasonOptions[reasonIndex];
    const loss = (qty * (beer.costPrice || 0)).toFixed(2);
    wx.showModal({
      title: "确认报废",
      content: `报废 ${qty} 瓶（${remark}），预计损失 ¥${loss}，此操作不可撤销。`,
      confirmColor: "#ef4444",
      success: (res) => {
        if (res.confirm) this.doScrap(beer, batch, qty, remark);
      },
    });
  },

  doScrap(beer, batch, qty, remark) {
    wx.showLoading({ title: "报废中..." });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "scrap", beerId: beer._id, batchId: batch._id, quantity: qty, remark },
      })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "报废成功", icon: "success" });
          this.setData({ quantity: "" });
          this.loadBatches(beer._id);
        } else {
          wx.showToast({ title: result.errMsg || "报废失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "报废失败", icon: "none" });
      });
  },
});
