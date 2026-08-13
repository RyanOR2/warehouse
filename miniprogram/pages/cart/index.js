// pages/cart/index.js
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    cart: [],
    totalAmount: 0,
    totalAmountText: "0.00",
    showCheckout: false,
    form: { customerName: "", customerPhone: "", remark: "" },
  },

  onShow() {
    this.loadCart();
  },

  loadCart() {
    const cart = wx.getStorageSync("cart") || [];
    const list = cart.map((it) => ({ ...it, priceText: formatMoney(it.unitPrice) }));
    const total = cart.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 0), 0);
    this.setData({
      cart: list,
      totalAmount: Math.round(total * 100) / 100,
      totalAmountText: formatMoney(total),
    });
  },

  onMinus(e) {
    const id = e.currentTarget.dataset.id;
    let cart = wx.getStorageSync("cart") || [];
    const idx = cart.findIndex((it) => it.beerId === id);
    if (idx < 0) return;
    if (cart[idx].quantity <= 1) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity -= 1;
    }
    wx.setStorageSync("cart", cart);
    this.loadCart();
  },

  onPlus(e) {
    const id = e.currentTarget.dataset.id;
    let cart = wx.getStorageSync("cart") || [];
    const idx = cart.findIndex((it) => it.beerId === id);
    if (idx < 0) return;
    cart[idx].quantity += 1;
    wx.setStorageSync("cart", cart);
    this.loadCart();
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    let cart = wx.getStorageSync("cart") || [];
    cart = cart.filter((it) => it.beerId !== id);
    wx.setStorageSync("cart", cart);
    this.loadCart();
  },

  onCheckout() {
    if (!this.data.cart.length) return wx.showToast({ title: "购物车为空", icon: "none" });
    this.setData({ showCheckout: true });
  },

  onCloseCheckout() {
    this.setData({ showCheckout: false });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSubmit() {
    const { form, cart } = this.data;
    const customerName = form.customerName.trim();
    const customerPhone = form.customerPhone.trim();
    if (!customerName) return wx.showToast({ title: "请填写联系人姓名", icon: "none" });
    if (!customerPhone) return wx.showToast({ title: "请填写联系电话", icon: "none" });

    const items = cart.map((it) => ({ beerId: it.beerId, quantity: it.quantity }));
    wx.showLoading({ title: "下单中..." });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "createOrder",
          customerName,
          customerPhone,
          items,
          remark: form.remark,
        },
      })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.removeStorageSync("cart");
          this.setData({ showCheckout: false, cart: [], totalAmount: 0, totalAmountText: "0.00" });
          wx.showToast({ title: "下单成功", icon: "success" });
          setTimeout(() => wx.switchTab({ url: "/pages/mine/index" }), 600);
        } else {
          wx.showToast({ title: result.errMsg || "下单失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "下单失败", icon: "none" });
      });
  },
});
