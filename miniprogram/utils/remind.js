// utils/remind.js — 订阅消息授权（临期 / 过期 / 新订单提醒）
// 模板 ID 需与云函数 TEMPLATE_IDS 保持一致：在微信公众平台「订阅消息」申请后替换占位空串
const TEMPLATE_IDS = {
  expiring: "bhjHh5C2MMwfJma8w1sfjfoXNs67UeiNiyY3xksCSN8", // 临期提醒模板 ID
  expired: "bHJ4t-Z5B46yJBlyYXVsSLwBrSAnt90ohhzD_l2N400", // 过期提醒模板 ID
  newOrder: "z7lJAu3BImoV5ZMMqEzF3YzggFFmkSSn67n175y1a4c", // 新订单提醒模板 ID
};

// 引导管理员开启提醒：请求订阅授权，把 accept 结果上报后端累加可发额度
function subscribeRemind() {
  const tmplIds = [TEMPLATE_IDS.expiring, TEMPLATE_IDS.expired, TEMPLATE_IDS.newOrder].filter(Boolean);
  if (!tmplIds.length) {
    wx.showToast({ title: "提醒模板未配置", icon: "none" });
    return;
  }
  wx.requestSubscribeMessage({ tmplIds })
    .then((res) => {
      const accept = (id) => (id && res[id] === "accept" ? 1 : 0);
      const expiring = accept(TEMPLATE_IDS.expiring);
      const expired = accept(TEMPLATE_IDS.expired);
      const newOrder = accept(TEMPLATE_IDS.newOrder);
      if (!expiring && !expired && !newOrder) {
        wx.showToast({ title: "未开启任何提醒", icon: "none" });
        return;
      }
      wx.showLoading({ title: "开启中..." });
      wx.cloud
        .callFunction({
          name: "quickstartFunctions",
          data: { type: "subscribeRemind", expiring, expired, newOrder },
        })
        .then((resp) => {
          wx.hideLoading();
          const result = resp.result || {};
          if (result.success) {
            wx.showToast({ title: "已开启提醒", icon: "success" });
          } else {
            wx.showToast({ title: result.errMsg || "开启失败", icon: "none" });
          }
        })
        .catch((e) => {
          wx.hideLoading();
          console.error(e);
        });
    })
    .catch((e) => {
      // 用户取消授权等，静默
      console.error(e);
    });
}

module.exports = { TEMPLATE_IDS, subscribeRemind };
