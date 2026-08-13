// pages/login/login.js
Page({
  data: {
    loading: false, // 登录中
    hasLogin: false, // 是否已登录
    code: "", // wx.login 返回的临时登录凭证
    openid: "",
    appid: "",
    unionid: "",
    // 错误提示弹窗
    showTip: false,
    title: "",
    content: "",
  },

  // 点击登录按钮
  onLogin() {
    const app = getApp();
    // 云开发环境未配置时给出提示
    if (!app.globalData.env) {
      this.setData({
        showTip: true,
        title: "云开发环境未配置",
        content: "请在 `miniprogram/app.js` 中正确配置 `env` 参数后重试。",
      });
      return;
    }

    if (this.data.loading) return;
    this.setData({ loading: true });

    // 1. 调用 wx.login 获取临时登录凭证 code
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false });
          wx.showToast({ title: "获取登录凭证失败", icon: "none" });
          return;
        }
        this.setData({ code: res.code });
        // 2. 将 code 传给云函数换取用户身份信息
        this.loginWithCode(res.code);
      },
      fail: (err) => {
        this.setData({ loading: false });
        wx.showToast({ title: "登录失败，请重试", icon: "none" });
        console.error("wx.login fail", err);
      },
    });
  },

  // 通过云函数完成登录
  loginWithCode(code) {
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "login",
          code,
        },
      })
      .then((resp) => {
        const result = resp.result || {};
        this.setData({
          loading: false,
          hasLogin: true,
          openid: result.openid || "",
          appid: result.appid || "",
          unionid: result.unionid || "",
        });
        wx.showToast({ title: "登录成功", icon: "success" });
      })
      .catch((e) => {
        this.setData({ loading: false });
        console.error(e);
        const errMsg = (e && e.errMsg) || "";
        if (errMsg.includes("Environment not found")) {
          this.setData({
            showTip: true,
            title: "云开发环境未找到",
            content:
              "请检查环境ID与 `miniprogram/app.js` 中的 `env` 参数是否一致。",
          });
          return;
        }
        if (errMsg.includes("FunctionName parameter could not be found")) {
          this.setData({
            showTip: true,
            title: "请上传云函数",
            content:
              "在 'cloudfunctions/quickstartFunctions' 目录右键，选择【上传并部署】，等待云函数上传完成后重试。",
          });
          return;
        }
        wx.showToast({ title: "登录失败，请重试", icon: "none" });
      });
  },

  // 退出登录
  onLogout() {
    this.setData({
      hasLogin: false,
      code: "",
      openid: "",
      appid: "",
      unionid: "",
    });
  },

  // 关闭提示弹窗
  onCloseTip() {
    this.setData({ showTip: false });
  },
});
