// pages/outbound/index.js
const { formatDate } = require("../../utils/format");

Page({
  data: {
    beers: [],
    beerIndex: -1,
    batches: [], // [{ _id, quantity, productionDate, expiryDate, selected, outQty, prodText, expText, isUnfilled }]
    unitPrice: "",
    orderNo: "",
    remark: "",
    totalQty: "",
  },

  onLoad() {
    this.loadBeers();
  },

  loadBeers() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getBeers", status: "active" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          this.setData({ beers: result.data });
        }
      })
      .catch((e) => console.error(e));
  },

  onBeerChange(e) {
    const index = Number(e.detail.value);
    const beer = this.data.beers[index];
    this.setData({
      beerIndex: index,
      unitPrice: beer ? String(beer.sellingPrice) : "",
      batches: [],
      totalQty: "",
    });
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
          selected: false,
          outQty: "",
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
        this.setData({ batches: list });
      })
      .catch((e) => console.error(e));
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onToggleBatch(e) {
    const index = e.currentTarget.dataset.index;
    const batch = this.data.batches[index];
    this.setData({
      [`batches[${index}].selected`]: !batch.selected,
      [`batches[${index}].outQty`]: batch.selected ? "" : batch.outQty,
    });
  },

  onBatchQtyInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`batches[${index}].outQty`]: e.detail.value });
  },

  // 按到期日自动分配（先到期先出，FEFO）
  onFefo() {
    const total = Number(this.data.totalQty);
    if (!Number.isInteger(total) || total <= 0)
      return wx.showToast({ title: "请先填写总出库数量", icon: "none" });

    let remaining = total;
    const batches = this.data.batches.map((b) => {
      if (remaining <= 0) return { ...b, selected: false, outQty: "" };
      const alloc = Math.min(b.quantity, remaining);
      remaining -= alloc;
      return { ...b, selected: alloc > 0, outQty: alloc > 0 ? String(alloc) : "" };
    });
    this.setData({ batches });
    if (remaining > 0) wx.showToast({ title: "库存不足", icon: "none" });
  },

  onSubmit() {
    const { beers, beerIndex, batches, unitPrice, orderNo, remark } = this.data;
    const beer = beers[beerIndex];
    if (!beer) return wx.showToast({ title: "请选择品类", icon: "none" });
    if (!(Number(unitPrice) > 0))
      return wx.showToast({ title: "销售单价需大于 0", icon: "none" });

    const items = [];
    for (const b of batches) {
      const q = Number(b.outQty);
      if (b.selected) {
        if (!Number.isInteger(q) || q <= 0)
          return wx.showToast({ title: "出库数量必须为正整数", icon: "none" });
        if (q > b.quantity)
          return wx.showToast({ title: `批次库存不足（剩余 ${b.quantity} 瓶）`, icon: "none" });
        items.push({ batchId: b._id, quantity: q });
      }
    }
    if (!items.length) return wx.showToast({ title: "请选择出库批次并填写数量", icon: "none" });

    wx.showLoading({ title: "出库中..." });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "outbound",
          beerId: beer._id,
          unitPrice: Number(unitPrice),
          items,
          orderNo,
          remark,
        },
      })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "出库成功", icon: "success" });
          this.setData({ orderNo: "", remark: "", totalQty: "" });
          this.loadBatches(beer._id); // 刷新批次剩余
        } else {
          wx.showToast({ title: result.errMsg || "出库失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "出库失败", icon: "none" });
      });
  },
});
