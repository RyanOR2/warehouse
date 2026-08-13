// pages/return/index.js
Page({
  data: {
    beers: [],
    beerIndex: -1,
    quantity: "",
    unitPrice: "",
    productionDate: "",
    orderNo: "",
    remark: "",
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
    // 退货单价默认取品类售价
    this.setData({ beerIndex: index, unitPrice: beer ? String(beer.sellingPrice) : "" });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ productionDate: e.detail.value });
  },

  onClearDate() {
    this.setData({ productionDate: "" });
  },

  onSubmit() {
    const { beers, beerIndex, quantity, unitPrice, productionDate, orderNo, remark } = this.data;
    const beer = beers[beerIndex];
    if (!beer) return wx.showToast({ title: "请选择品类", icon: "none" });

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0)
      return wx.showToast({ title: "退货数量必须为正整数", icon: "none" });
    if (!(Number(unitPrice) > 0))
      return wx.showToast({ title: "退货单价需大于 0", icon: "none" });

    wx.showLoading({ title: "退货入库中..." });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "returnGoods",
          beerId: beer._id,
          quantity: qty,
          unitPrice: Number(unitPrice),
          productionDate,
          orderNo,
          remark,
        },
      })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "退货成功", icon: "success" });
          this.setData({ quantity: "", productionDate: "", orderNo: "", remark: "" });
        } else {
          wx.showToast({ title: result.errMsg || "退货失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "退货失败", icon: "none" });
      });
  },
});
