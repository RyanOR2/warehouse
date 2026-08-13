// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env: "cloud1-d8gfkvozw70c4f033",
      role: "", // owner / operator / customer
      isAdmin: false,
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
      this.initDbOnce();
    }
  },

  // 首次进入初始化数据库集合与默认分类（幂等），随后刷新当前用户角色
  initDbOnce() {
    const key = "db_initialized_v3"; // v3：补建 invites / subscriptions / settings 集合
    const done = () => this.refreshRole();
    if (wx.getStorageSync(key)) {
      done();
      return;
    }
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "initDb" } })
      .then(() => {
        wx.setStorageSync(key, true);
        done();
      })
      .catch((e) => {
        console.error("initDb fail", e);
        done();
      });
  },

  // 刷新当前用户角色，缓存到 globalData
  refreshRole() {
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getMyRole" } })
      .then((resp) => {
        const result = resp.result || {};
        if (result.success) {
          this.globalData.role = result.data.role;
          this.globalData.isAdmin = !!result.data.isAdmin;
        }
      })
      .catch((e) => console.error("getMyRole fail", e));
  },
});
