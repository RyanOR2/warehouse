// pages/manage/index.js
const { formatMoney } = require("../../utils/format");

Page({
  data: {
    beers: [],
    categories: [],
    keyword: "",
    filterCatIndex: -1, // -1 表示全部分类
  },

  onShow() {
    this.loadCategories();
    this.loadBeers();
  },

  loadCategories() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getCategories" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          this.setData({ categories: result.data });
        }
      })
      .catch((e) => console.error(e));
  },

  loadBeers() {
    const { keyword, filterCatIndex, categories } = this.data;
    const categoryId = filterCatIndex >= 0 ? categories[filterCatIndex]._id : "";
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getBeers", keyword, categoryId },
      })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const list = (result.data || []).map((b) => {
          let shelfText = "—";
          let shelfClass = "tag-gray";
          if (b.expiryStatus === "unfilled") {
            shelfText = "未填生产日期";
            shelfClass = "tag-red";
          } else if (b.expiryStatus === "expired") {
            shelfText = `已过期 ${Math.abs(b.daysLeft)} 天`;
            shelfClass = "tag-red";
          } else if (b.expiryStatus === "expiring") {
            shelfText = `临期 ${b.daysLeft} 天`;
            shelfClass = "tag-orange";
          } else if (b.expiryStatus === "normal") {
            shelfText = `剩余 ${b.daysLeft} 天`;
            shelfClass = "tag-green";
          }
          return { ...b, shelfText, shelfClass, sellingPriceText: formatMoney(b.sellingPrice) };
        });
        this.setData({ beers: list });
      })
      .catch((e) => console.error(e));
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadBeers();
  },

  onClearSearch() {
    this.setData({ keyword: "" });
    this.loadBeers();
  },

  onFilterCategory(e) {
    this.setData({ filterCatIndex: Number(e.detail.value) });
    this.loadBeers();
  },

  onClearFilter() {
    this.setData({ filterCatIndex: -1 });
    this.loadBeers();
  },

  onAddBeer() {
    wx.navigateTo({ url: "/pages/beer-edit/index" });
  },

  onEditBeer(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/beer-edit/index?id=${id}` });
  },

  onCategoryManage() {
    wx.navigateTo({ url: "/pages/category/index" });
  },

  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = status === "disabled" ? "active" : "disabled";
    const action = next === "disabled" ? "停用" : "启用";
    wx.showModal({
      title: "提示",
      content: `确定${action}该品类吗？`,
      success: (res) => {
        if (res.confirm) this.updateBeer(id, { status: next });
      },
    });
  },

  updateBeer(id, data) {
    wx.showLoading({ title: "处理中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "updateBeer", id, ...data } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已更新", icon: "success" });
          this.loadBeers();
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
