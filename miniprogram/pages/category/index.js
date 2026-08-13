// pages/category/index.js
Page({
  data: {
    categories: [],
  },

  onShow() {
    this.loadCategories();
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

  onAdd() {
    wx.showModal({
      title: "新增分类",
      editable: true,
      placeholderText: "请输入分类名称",
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.addCategory(res.content.trim());
        }
      },
    });
  },

  addCategory(name) {
    wx.showLoading({ title: "保存中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "addCategory", name } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已新增", icon: "success" });
          this.loadCategories();
        } else {
          wx.showToast({ title: result.errMsg || "新增失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },

  onRename(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: "重命名分类",
      editable: true,
      placeholderText: "请输入新名称",
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.updateCategory(id, { name: res.content.trim() });
        }
      },
    });
  },

  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = status === "disabled" ? "active" : "disabled";
    const action = next === "disabled" ? "停用" : "启用";
    wx.showModal({
      title: "提示",
      content: `确定${action}该分类吗？`,
      success: (res) => {
        if (res.confirm) {
          this.updateCategory(id, { status: next });
        }
      },
    });
  },

  updateCategory(id, data) {
    wx.showLoading({ title: "保存中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "updateCategory", id, ...data } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已更新", icon: "success" });
          this.loadCategories();
        } else {
          wx.showToast({ title: result.errMsg || "更新失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },
});
