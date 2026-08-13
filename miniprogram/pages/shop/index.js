// pages/shop/index.js
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    beers: [],
    categories: [],
    catIndex: -1, // -1 表示全部
    cartCount: 0,
  },

  onShow() {
    this.loadCategories();
    this.loadBeers();
    this.updateCartCount();
  },

  loadCategories() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getCategories" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          // 只显示启用分类
          const categories = (result.data || []).filter((c) => c.status !== "disabled");
          this.setData({ categories });
        }
      })
      .catch((e) => console.error(e));
  },

  loadBeers() {
    const { catIndex, categories } = this.data;
    const categoryId = catIndex >= 0 ? categories[catIndex]._id : "";
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getShopBeers", categoryId } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const { qtyMap } = this.getQtyMap();
        const list = (result.data || []).map((b) => ({
          ...b,
          priceText: formatMoney(b.sellingPrice),
          quantity: qtyMap[b._id] || 0,
        }));
        this.setData({ beers: list });
      })
      .catch((e) => console.error(e));
  },

  // 从本地购物车计算「每个品类的已加数量」与总件数
  getQtyMap() {
    const qtyMap = {};
    let count = 0;
    const cart = wx.getStorageSync("cart") || [];
    cart.forEach((it) => {
      qtyMap[it.beerId] = (qtyMap[it.beerId] || 0) + (it.quantity || 0);
      count += it.quantity || 0;
    });
    return { qtyMap, count };
  },

  // 同步购物车角标 + 商品卡片上的已加数量
  syncCart() {
    const { qtyMap, count } = this.getQtyMap();
    const beers = this.data.beers.map((b) => ({ ...b, quantity: qtyMap[b._id] || 0 }));
    this.setData({ cartCount: count, beers });
  },

  updateCartCount() {
    this.setData({ cartCount: this.getQtyMap().count });
  },

  onFilterCategory(e) {
    this.setData({ catIndex: Number(e.currentTarget.dataset.index) });
    this.loadBeers();
  },

  onClearFilter() {
    this.setData({ catIndex: -1 });
    this.loadBeers();
  },

  onAddToCart(e) {
    const id = e.currentTarget.dataset.id;
    const beer = this.data.beers.find((b) => b._id === id);
    if (!beer) return;
    const cart = wx.getStorageSync("cart") || [];
    const idx = cart.findIndex((it) => it.beerId === id);
    if (idx >= 0) {
      cart[idx].quantity += 1;
    } else {
      cart.push({
        beerId: beer._id,
        name: beer.name,
        icon: beer.icon,
        image: beer.image || "",
        spec: beer.spec,
        unitPrice: beer.sellingPrice,
        quantity: 1,
      });
    }
    wx.setStorageSync("cart", cart);
    this.syncCart();
  },

  onMinus(e) {
    const id = e.currentTarget.dataset.id;
    const cart = wx.getStorageSync("cart") || [];
    const idx = cart.findIndex((it) => it.beerId === id);
    if (idx < 0) return;
    if (cart[idx].quantity <= 1) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity -= 1;
    }
    wx.setStorageSync("cart", cart);
    this.syncCart();
  },

  onGoCart() {
    wx.switchTab({ url: "/pages/cart/index" });
  },
});
