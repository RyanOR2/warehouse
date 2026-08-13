// pages/beer-edit/index.js
Page({
  data: {
    id: "",
    categories: [],
    catIndex: -1,
    form: {
      name: "",
      categoryId: "",
      spec: "",
      icon: "",
      image: "",
      sellingPrice: "",
      costPrice: "",
      shelfLifeDays: "",
    },
  },

  onLoad(options) {
    this.setData({ id: options.id || "" });
    this.loadCategories();
    if (options.id) {
      this.loadBeer(options.id);
    }
  },

  loadCategories() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getCategories" } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const categories = result.data;
        // 编辑模式下根据已加载的 categoryId 回填选中索引
        const catIndex = this.data.form.categoryId
          ? categories.findIndex((c) => c._id === this.data.form.categoryId)
          : -1;
        this.setData({ categories, catIndex });
      })
      .catch((e) => console.error(e));
  },

  loadBeer(id) {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getBeers" } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const beer = (result.data || []).find((b) => b._id === id);
        if (!beer) return;
        const catIndex = this.data.categories.findIndex((c) => c._id === beer.categoryId);
        this.setData({
          catIndex,
          form: {
            name: beer.name,
            categoryId: beer.categoryId,
            spec: beer.spec || "",
            icon: beer.icon || "",
            image: beer.image || "",
            sellingPrice: String(beer.sellingPrice),
            costPrice: String(beer.costPrice),
            shelfLifeDays: String(beer.shelfLifeDays),
          },
        });
      })
      .catch((e) => console.error(e));
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value);
    const cat = this.data.categories[index];
    this.setData({
      catIndex: index,
      "form.categoryId": cat ? cat._id : "",
    });
  },

  onChooseImage() {
    const done = (filePath) => {
      if (!filePath) return;
      this.uploadImage(filePath);
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
        success: (res) => done((res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || ""),
      });
    } else {
      wx.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        success: (res) => done((res.tempFilePaths && res.tempFilePaths[0]) || ""),
      });
    }
  },

  uploadImage(filePath) {
    wx.showLoading({ title: "上传中..." });
    const ext = (filePath.match(/\.(\w+)$/) || [])[1] || "png";
    const cloudPath = `beer-images/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    wx.cloud
      .uploadFile({ cloudPath, filePath })
      .then((res) => {
        wx.hideLoading();
        this.setData({ "form.image": res.fileID });
        wx.showToast({ title: "已上传", icon: "success" });
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
        wx.showToast({ title: "上传失败", icon: "none" });
      });
  },

  onRemoveImage() {
    this.setData({ "form.image": "" });
  },

  onSave() {
    const { form, id, catIndex } = this.data;
    const name = form.name.trim();
    if (!name) return wx.showToast({ title: "请输入啤酒名称", icon: "none" });
    if (catIndex < 0) return wx.showToast({ title: "请选择分类", icon: "none" });
    if (Number(form.sellingPrice) < 0) return wx.showToast({ title: "售价不能为负数", icon: "none" });
    if (Number(form.costPrice) < 0) return wx.showToast({ title: "成本价不能为负数", icon: "none" });
    if (!(Number(form.shelfLifeDays) > 0))
      return wx.showToast({ title: "保质期天数需大于 0", icon: "none" });

    const data = {
      name,
      categoryId: form.categoryId,
      spec: form.spec.trim(),
      icon: form.icon.trim(),
      image: form.image,
      sellingPrice: Number(form.sellingPrice),
      costPrice: Number(form.costPrice),
      shelfLifeDays: Number(form.shelfLifeDays),
    };
    const type = id ? "updateBeer" : "addBeer";
    if (id) data.id = id;

    wx.showLoading({ title: "保存中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type, ...data } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已保存", icon: "success" });
          setTimeout(() => wx.navigateBack(), 600);
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
