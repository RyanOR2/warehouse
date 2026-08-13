// 通用格式化工具（纯函数）

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// 金额：四舍五入保留两位小数，返回字符串
function formatMoney(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toFixed(2);
}

// Date / 时间戳 / ISO 字符串 → 'YYYY-MM-DD'
function formatDate(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 到期日剩余天数（到期日 - 今天），向上取整；无到期日返回 null
function daysUntil(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

module.exports = {
  formatMoney,
  formatDate,
  daysUntil,
};
