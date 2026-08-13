// pages/members/index.js
Page({
  data: {
    members: [],
    myOpenid: "",
    inviteCode: "",
    inviteExpires: "",
    showInvite: false,
    addOpenid: "",
    showAdd: false,
  },

  onShow() {
    this.loadMyOpenid();
    this.loadAdmins();
  },

  loadMyOpenid() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getMyRole" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) this.setData({ myOpenid: result.data.openid });
      })
      .catch((e) => console.error(e));
  },

  loadAdmins() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getAdmins" } })
      .then((resp) => {
        const result = resp.result || {};
        if (!result.success) return;
        const members = (result.data || []).map((m) => ({
          ...m,
          roleLabel: m.role === "owner" ? "所有者" : "操作员",
          roleCls: m.role === "owner" ? "tag-orange" : "tag-green",
          openidShort: m.openid ? m.openid.slice(0, 8) + "…" : "",
        }));
        this.setData({ members });
      })
      .catch((e) => console.error(e));
  },

  onGenerateInvite() {
    wx.showLoading({ title: "生成中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "createInvite" } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          this.setData({
            inviteCode: result.data.code,
            inviteExpires: this.formatExpires(result.data.expiresAt),
            showInvite: true,
          });
        } else {
          wx.showToast({ title: result.errMsg || "生成失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },

  formatExpires(d) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  },

  onCopyInvite() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    });
  },

  onCloseInvite() {
    this.setData({ showInvite: false });
  },

  onOpenAdd() {
    this.setData({ showAdd: true, addOpenid: "" });
  },

  onCloseAdd() {
    this.setData({ showAdd: false });
  },

  onAddOpenidInput(e) {
    this.setData({ addOpenid: e.detail.value });
  },

  onSubmitAdd() {
    const openid = this.data.addOpenid.trim();
    if (!openid) return wx.showToast({ title: "请输入 openid", icon: "none" });
    wx.showLoading({ title: "添加中..." });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "addAdmin", openid } })
      .then((resp) => {
        wx.hideLoading();
        const result = resp.result || {};
        if (result.success) {
          wx.showToast({ title: "已添加", icon: "success" });
          this.setData({ showAdd: false });
          this.loadAdmins();
        } else {
          wx.showToast({ title: result.errMsg || "添加失败", icon: "none" });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        console.error(e);
      });
  },

  onTransferOwner(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: "移交 owner",
      content: `确定将「${name}」提升为所有者（owner）？你本人仍保持 owner。`,
      confirmText: "移交",
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "处理中..." });
        wx.cloud
          .callFunction({ name: "quickstartFunctions", data: { type: "transferOwner", id } })
          .then((resp) => {
            wx.hideLoading();
            const result = resp.result || {};
            if (result.success) {
              wx.showToast({ title: "已移交", icon: "success" });
              this.loadAdmins();
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
  },

  onRemove(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: "移除成员",
      content: `确定移除「${name}」？移除后该成员将无法访问后台。`,
      confirmColor: "#ef4444",
      confirmText: "移除",
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "移除中..." });
        wx.cloud
          .callFunction({ name: "quickstartFunctions", data: { type: "removeAdmin", id } })
          .then((resp) => {
            wx.hideLoading();
            const result = resp.result || {};
            if (result.success) {
              wx.showToast({ title: "已移除", icon: "success" });
              this.loadAdmins();
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
  },

  noop() {},
});
