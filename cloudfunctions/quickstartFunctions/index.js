const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// ============ 通用工具 ============

// 金额保留两位小数（四舍五入）
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// 'YYYY-MM-DD' → 本地时区 Date（避免 ISO 字符串的 UTC 偏移）
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

// ============ 云开发 quickstart 示例（保留） ============

// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 登录：接收小程序端 wx.login 返回的 code，返回用户身份信息
const login = async (event) => {
  const wxContext = cloud.getWXContext();
  return {
    success: true,
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID || "",
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合（quickstart 示例）
const createCollection = async () => {
  try {
    await db.createCollection("sales");
    await db.collection("sales").add({
      data: { region: "华东", city: "上海", sales: 11 },
    });
    await db.collection("sales").add({
      data: { region: "华东", city: "南京", sales: 11 },
    });
    await db.collection("sales").add({
      data: { region: "华南", city: "广州", sales: 22 },
    });
    await db.collection("sales").add({
      data: { region: "华南", city: "深圳", sales: 22 },
    });
    return { success: true };
  } catch (e) {
    return { success: true, data: "create collection success" };
  }
};

// 查询数据
const selectRecord = async () => {
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({ _id: event.data[i]._id })
        .update({ data: { sales: event.data[i].sales } });
    }
    return { success: true, data: event.data };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return { success: true, data: event.data };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db.collection("sales").where({ _id: event.data._id }).remove();
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e };
  }
};

// ============ M1 啤酒仓库管理 ============

// 临期阈值（天），默认 45，可在「设置」页配置（存 settings/global 文档）
const EXPIRING_DAYS_DEFAULT = 45;

// 读取临期阈值（天）：优先读 settings/global 配置，未配置/读取失败用默认值
const getExpiringDays = async () => {
  try {
    const res = await db.collection("settings").doc("global").get();
    const v = Number(res && res.data && res.data.expiringDays);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  } catch (e) {
    // settings 集合或 global 文档尚不存在，用默认值
  }
  return EXPIRING_DAYS_DEFAULT;
};

// 将在库批次（quantity>0 且 expiryDate 非空）按临期/过期分类，写入 b.daysLeft
// 口径与 getBeersEnriched 一致：Math.ceil((到期-今日零点)/86400000)，days<=0 已过期，0<days<=N 临期
const classifyExpiry = (batches, expiringDays) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const expiring = [];
  const expired = [];
  for (const b of batches) {
    const exp = new Date(b.expiryDate).getTime();
    if (!Number.isFinite(exp)) continue;
    const days = Math.ceil((exp - todayMs) / 86400000);
    b.daysLeft = days;
    if (days <= 0) expired.push(b);
    else if (days <= expiringDays) expiring.push(b);
  }
  return { expiring, expired };
};

// ============ M6 订阅消息提醒 ============

// 订阅消息模板 ID（需在微信公众平台「订阅消息」申请后替换占位空串）
// 字段 key（thing1/time2/number3/thing5/character_string1/amount2 等）需与申请到的模板字段严格对齐，否则发送报 47003
const TEMPLATE_IDS = {
  expiring: "bhjHh5C2MMwfJma8w1sfjfoXNs67UeiNiyY3xksCSN8", // 临期提醒模板 ID（会员到期模板：到期时间 time2、剩余天数 number3、会员名称 thing1）
  expired: "bHJ4t-Z5B46yJBlyYXVsSLwBrSAnt90ohhzD_l2N400", // 过期提醒模板 ID（库存预警模板：商品名称 thing1、备注 thing5）
  newOrder: "z7lJAu3BImoV5ZMMqEzF3YzggFFmkSSn67n175y1a4c", // 新订单提醒模板 ID（订单编号 character_string1、备注 thing3、支付金额 amount2）
};

// 点击消息跳转页面
const REMINDER_PAGE = {
  expiring: "pages/stock/index",
  expired: "pages/stock/index",
  newOrder: "pages/orders/index",
};

// 初始化集合与默认分类（幂等）
const initDb = async () => {
  const collections = ["categories", "beers", "batches", "transactions", "orders", "admins", "invites", "subscriptions", "settings"];
  for (const name of collections) {
    try {
      await db.createCollection(name);
    } catch (e) {
      // 集合已存在，忽略
    }
  }
  const catCount = (await db.collection("categories").count()).total;
  if (catCount === 0) {
    await db.collection("categories").add({
      data: { name: "默认分类", sort: 1, status: "active", createdAt: db.serverDate() },
    });
  }
  return { success: true };
};

// 查询分类列表
const getCategories = async () => {
  const res = await db
    .collection("categories")
    .orderBy("sort", "asc")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();
  return { success: true, data: res.data };
};

// 新增分类
const addCategory = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const name = String((event && event.name) || "").trim();
  if (!name) return { success: false, errMsg: "分类名称不能为空" };
  const res = await db.collection("categories").add({
    data: {
      name,
      sort: Number(event.sort) || 0,
      status: "active",
      createdAt: db.serverDate(),
    },
  });
  return { success: true, data: { _id: res._id } };
};

// 重命名 / 停用分类（不物理删除，被引用分类仅可停用）
const updateCategory = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { id, name, status } = event || {};
  if (!id) return { success: false, errMsg: "缺少分类 id" };
  const data = {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return { success: false, errMsg: "分类名称不能为空" };
    data.name = trimmed;
  }
  if (status !== undefined) {
    data.status = status === "disabled" ? "disabled" : "active";
  }
  await db.collection("categories").doc(id).update({ data });
  return { success: true };
};

// 品类列表富化：join 分类名 + 最早到期日 + 临期/过期/未填状态（getBeers / getStockStats 共用）
const getBeersEnriched = async (cond) => {
  const beers = (
    await db.collection("beers").where(cond).orderBy("createdAt", "desc").limit(1000).get()
  ).data;

  const categories = (await db.collection("categories").limit(500).get()).data;
  const catMap = {};
  categories.forEach((c) => (catMap[c._id] = c.name));

  // 各品类最早到期日（在库批次 quantity>0 且 expiryDate 非空）
  const minExpiryRes = await db
    .collection("batches")
    .aggregate()
    .match({ quantity: _.gt(0), expiryDate: _.neq(null) })
    .group({ _id: "$beerId", minExpiry: $.min("$expiryDate") })
    .end();
  const minExpiryMap = {};
  (minExpiryRes.list || []).forEach((x) => (minExpiryMap[x._id] = x.minExpiry));

  // 存在未填生产日期在库批次的品类
  const unfilledRes = await db
    .collection("batches")
    .aggregate()
    .match({ quantity: _.gt(0), productionDate: _.eq(null) })
    .group({ _id: "$beerId", n: $.sum("$quantity") })
    .end();
  const unfilledMap = {};
  (unfilledRes.list || []).forEach((x) => (unfilledMap[x._id] = x.n));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiringDays = await getExpiringDays();

  const list = beers.map((b) => {
    const categoryName = catMap[b.categoryId] || "未分类";
    let expiryStatus = "none"; // none / normal / expiring / expired / unfilled
    let daysLeft = null;
    let earliestExpiryDate = null;
    if (minExpiryMap[b._id]) {
      earliestExpiryDate = minExpiryMap[b._id];
      const days = Math.ceil((new Date(minExpiryMap[b._id]) - today) / 86400000);
      daysLeft = days;
      if (days <= 0) expiryStatus = "expired";
      else if (days <= expiringDays) expiryStatus = "expiring";
      else expiryStatus = "normal";
    } else if (unfilledMap[b._id]) {
      expiryStatus = "unfilled";
    }
    return { ...b, categoryName, expiryStatus, daysLeft, earliestExpiryDate };
  });

  return { list };
};

// 查询品类列表（含分类名、最低保质期时长、在库批次状态）
const getBeers = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { keyword = "", categoryId = "", status = "" } = event || {};
  const cond = {};
  if (keyword) cond.name = db.RegExp({ regexp: keyword, options: "i" });
  if (categoryId) cond.categoryId = categoryId;
  if (status) cond.status = status;
  const { list } = await getBeersEnriched(cond);
  return { success: true, data: list };
};

// 库存统计：总库存（全局）+ 分类汇总 + 品类明细（支持按分类/临期状态筛选）
const getStockStats = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { categoryId = "", expiryStatus = "" } = event || {};
  const { list: all } = await getBeersEnriched({});

  // 总库存不受筛选影响（全局量）
  const totalStock = all.reduce((s, b) => s + (b.stock || 0), 0);

  // 筛选（内存，派生状态 expiryStatus 无法下推 where）
  let list = all;
  if (categoryId) list = list.filter((b) => b.categoryId === categoryId);
  if (expiryStatus) list = list.filter((b) => b.expiryStatus === expiryStatus);

  // 分类汇总（基于筛选后）
  const catMap = {};
  for (const b of list) {
    if (!catMap[b.categoryId]) {
      catMap[b.categoryId] = { categoryId: b.categoryId, categoryName: b.categoryName, total: 0, count: 0 };
    }
    catMap[b.categoryId].total += b.stock || 0;
    catMap[b.categoryId].count += 1;
  }
  const categorySummary = Object.values(catMap);

  return { success: true, data: { totalStock, categorySummary, list } };
};

// 新增品类
const addBeer = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { name, categoryId, spec = "", sellingPrice, costPrice, shelfLifeDays, icon = "", image = "" } = event || {};
  const trimmed = String(name || "").trim();
  if (!trimmed) return { success: false, errMsg: "啤酒名称不能为空" };
  if (!categoryId) return { success: false, errMsg: "请选择分类" };
  if (!(Number(sellingPrice) >= 0)) return { success: false, errMsg: "售价不能为负数" };
  if (!(Number(costPrice) >= 0)) return { success: false, errMsg: "成本价不能为负数" };
  if (!(Number(shelfLifeDays) > 0)) return { success: false, errMsg: "保质期天数需大于 0" };

  const res = await db.collection("beers").add({
    data: {
      name: trimmed,
      categoryId,
      spec: String(spec || ""),
      sellingPrice: Number(sellingPrice),
      costPrice: Number(costPrice),
      shelfLifeDays: Number(shelfLifeDays),
      icon: String(icon || ""),
      image: String(image || ""),
      stock: 0,
      status: "active",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { success: true, data: { _id: res._id } };
};

// 编辑品类（售价/成本/保质期/分类/停用启用）
const updateBeer = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { id, name, categoryId, spec, sellingPrice, costPrice, shelfLifeDays, status, icon, image } = event || {};
  if (!id) return { success: false, errMsg: "缺少品类 id" };

  const data = { updatedAt: db.serverDate() };
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return { success: false, errMsg: "啤酒名称不能为空" };
    data.name = trimmed;
  }
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (spec !== undefined) data.spec = String(spec || "");
  if (icon !== undefined) data.icon = String(icon || "");
  if (image !== undefined) data.image = String(image || "");
  if (sellingPrice !== undefined) {
    if (!(Number(sellingPrice) >= 0)) return { success: false, errMsg: "售价不能为负数" };
    data.sellingPrice = Number(sellingPrice);
  }
  if (costPrice !== undefined) {
    if (!(Number(costPrice) >= 0)) return { success: false, errMsg: "成本价不能为负数" };
    data.costPrice = Number(costPrice);
  }
  if (shelfLifeDays !== undefined) {
    if (!(Number(shelfLifeDays) > 0)) return { success: false, errMsg: "保质期天数需大于 0" };
    data.shelfLifeDays = Number(shelfLifeDays);
  }
  if (status !== undefined) data.status = status === "disabled" ? "disabled" : "active";

  await db.collection("beers").doc(id).update({ data });
  return { success: true };
};

// 查询某品类在库批次
const getBatches = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { beerId } = event || {};
  if (!beerId) return { success: false, errMsg: "缺少 beerId" };
  const res = await db
    .collection("batches")
    .where({ beerId, quantity: _.gt(0) })
    .orderBy("createdAt", "asc")
    .limit(500)
    .get();
  return { success: true, data: res.data };
};

// 进货入库：新建批次 + 增库存 + 写流水（事务）
const inbound = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { beerId, quantity, unitPrice, productionDate = "", orderNo = "", remark = "" } = event || {};
  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!beerId) return { success: false, errMsg: "请选择品类" };
  if (!Number.isInteger(qty) || qty <= 0) return { success: false, errMsg: "入库数量必须为正整数" };
  if (!(price > 0)) return { success: false, errMsg: "进货单价需大于 0" };

  const operatorId = cloud.getWXContext().OPENID;
  const production = parseDate(productionDate);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const beer = (await transaction.collection("beers").doc(beerId).get()).data;
      if (!beer) throw new Error("品类不存在");

      const expiry = production ? new Date(production.getTime() + beer.shelfLifeDays * 86400000) : null;

      const batchRes = await transaction.collection("batches").add({
        data: {
          beerId,
          quantity: qty,
          productionDate: production || null,
          expiryDate: expiry,
          createdAt: db.serverDate(),
        },
      });
      const batchId = batchRes._id;

      const txnRes = await transaction.collection("transactions").add({
        data: {
          type: "in",
          beerId,
          batchId,
          quantity: qty,
          unitPrice: price,
          productionDate: production || null,
          expiryDate: expiry,
          orderNo: String(orderNo || ""),
          operatorId,
          remark: String(remark || ""),
          createdAt: db.serverDate(),
        },
      });

      await transaction.collection("batches").doc(batchId).update({
        data: { inboundTxnId: txnRes._id },
      });

      await transaction.collection("beers").doc(beerId).update({
        data: { stock: beer.stock + qty, updatedAt: db.serverDate() },
      });

      return { batchId, txnId: txnRes._id };
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "入库失败" };
  }
};

// 销售出库：按所选批次扣减 + 减库存 + 写流水（事务）
const outbound = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { beerId, unitPrice, items, orderNo = "", remark = "" } = event || {};
  const price = Number(unitPrice);
  if (!beerId) return { success: false, errMsg: "请选择品类" };
  if (!Array.isArray(items) || items.length === 0) return { success: false, errMsg: "请选择出库批次" };
  if (!(price > 0)) return { success: false, errMsg: "销售单价需大于 0" };

  // 服务端合并同批次重复项并校验
  const merged = {};
  for (const it of items) {
    const q = Number(it.quantity);
    if (!it.batchId || !Number.isInteger(q) || q <= 0) {
      return { success: false, errMsg: "出库数量必须为正整数" };
    }
    merged[it.batchId] = (merged[it.batchId] || 0) + q;
  }
  const batchList = Object.keys(merged).map((batchId) => ({ batchId, quantity: merged[batchId] }));
  const totalQty = batchList.reduce((s, b) => s + b.quantity, 0);

  const operatorId = cloud.getWXContext().OPENID;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const beer = (await transaction.collection("beers").doc(beerId).get()).data;
      if (!beer) throw new Error("品类不存在");
      if (beer.stock < totalQty) throw new Error("库存不足");

      const costPrice = beer.costPrice;

      // 逐批次校验并扣减
      for (const b of batchList) {
        const batch = (await transaction.collection("batches").doc(b.batchId).get()).data;
        if (!batch || batch.beerId !== beerId) throw new Error("批次不存在或不属于该品类");
        if (batch.quantity < b.quantity) throw new Error("库存不足");
        await transaction.collection("batches").doc(b.batchId).update({
          data: { quantity: batch.quantity - b.quantity },
        });
      }

      // 减品类库存
      await transaction.collection("beers").doc(beerId).update({
        data: { stock: beer.stock - totalQty, updatedAt: db.serverDate() },
      });

      // 每条批次写一条出库流水（同一 orderNo 关联）
      const txns = [];
      for (const b of batchList) {
        const amount = round2(b.quantity * price);
        const profit = round2(amount - b.quantity * costPrice);
        const txnRes = await transaction.collection("transactions").add({
          data: {
            type: "out",
            beerId,
            batchId: b.batchId,
            quantity: b.quantity,
            unitPrice: price,
            costPrice,
            amount,
            profit,
            orderNo: String(orderNo || ""),
            operatorId,
            remark: String(remark || ""),
            createdAt: db.serverDate(),
          },
        });
        txns.push(txnRes._id);
      }

      return { totalQty, txns };
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "出库失败" };
  }
};

// ============ M2 销售统计 ============

// 计算统计周期的时间范围（当日/当月/当年）
const getPeriodRange = (period) => {
  const start = new Date();
  const end = new Date();
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1);
    end.setDate(1);
    end.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setFullYear(end.getFullYear() + 1, 0, 1);
    end.setHours(0, 0, 0, 0);
  } else {
    // day
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};

// 计算趋势图时间范围（周/月/季度/年）
const getTrendRange = (granularity) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  if (granularity === "week") start.setDate(start.getDate() - 12 * 7);
  else if (granularity === "quarter") start.setMonth(start.getMonth() - 8 * 3);
  else if (granularity === "year") start.setFullYear(start.getFullYear() - 5);
  else start.setMonth(start.getMonth() - 12); // month（默认）
  return { start, end };
};

// 分页拉取流水（内存聚合，避免大聚合查询）
const fetchTransactions = async (cond, fields) => {
  const count = (await db.collection("transactions").where(cond).count()).total;
  const pageSize = 500;
  const pages = Math.ceil(count / pageSize);
  let all = [];
  for (let i = 0; i < pages; i++) {
    const res = await db
      .collection("transactions")
      .where(cond)
      .field(fields)
      .orderBy("createdAt", "asc")
      .skip(i * pageSize)
      .limit(pageSize)
      .get();
    all = all.concat(res.data);
  }
  return all;
};

// 时间桶标签（周/月/季度/年）
const getBucketLabel = (date, granularity) => {
  if (granularity === "week") {
    const d = new Date(date);
    const day = d.getDay() || 7; // 周一为一周起点
    d.setDate(d.getDate() - (day - 1));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } else if (granularity === "month") {
    return `${date.getFullYear()}-${date.getMonth() + 1}`;
  } else if (granularity === "quarter") {
    const q = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}-Q${q}`;
  }
  return `${date.getFullYear()}`;
};

// 销售统计：销售额 / 净利润 / 订单笔数 / 销量 / 趋势 / 品类排行
const getSalesStats = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { period = "day", granularity = "month" } = event || {};

  // summary 与 ranking 用 period 范围
  const { start, end } = getPeriodRange(period);
  const cond = {
    type: _.in(["out", "return"]),
    createdAt: _.gte(start).and(_.lt(end)),
  };
  const rows = await fetchTransactions(cond, {
    type: true,
    beerId: true,
    quantity: true,
    amount: true,
    profit: true,
    orderNo: true,
  });

  let salesAmount = 0;
  let profit = 0;
  let salesQty = 0;
  const orderNos = new Set();
  const beerMap = {};
  for (const t of rows) {
    salesAmount += t.amount || 0;
    profit += t.profit || 0;
    salesQty += t.type === "out" ? t.quantity || 0 : -(t.quantity || 0);
    if (t.type === "out") orderNos.add(t.orderNo || "__empty__");
    if (!beerMap[t.beerId]) {
      beerMap[t.beerId] = { beerId: t.beerId, salesAmount: 0, salesQty: 0, profit: 0 };
    }
    beerMap[t.beerId].salesAmount += t.amount || 0;
    beerMap[t.beerId].profit += t.profit || 0;
    beerMap[t.beerId].salesQty += t.type === "out" ? t.quantity || 0 : -(t.quantity || 0);
  }

  // 品类名映射
  const beerIds = Object.keys(beerMap);
  const beerNameMap = {};
  if (beerIds.length) {
    const beers = (
      await db.collection("beers").where({ _id: _.in(beerIds) }).field({ name: true }).limit(1000).get()
    ).data;
    beers.forEach((b) => (beerNameMap[b._id] = b.name));
  }

  const ranking = Object.values(beerMap)
    .map((x) => ({
      beerId: x.beerId,
      name: beerNameMap[x.beerId] || "未知",
      salesAmount: round2(x.salesAmount),
      profit: round2(x.profit),
      salesQty: x.salesQty,
    }))
    .sort((a, b) => b.salesAmount - a.salesAmount)
    .slice(0, 20);

  const summary = {
    salesAmount: round2(salesAmount),
    profit: round2(profit),
    salesQty,
    orderCount: orderNos.size,
  };

  // trend 用 granularity 范围
  const tr = getTrendRange(granularity);
  const trendCond = {
    type: _.in(["out", "return"]),
    createdAt: _.gte(tr.start).and(_.lt(tr.end)),
  };
  const trendRows = await fetchTransactions(trendCond, { createdAt: true, amount: true, profit: true });

  const bucketMap = {};
  const bucketOrder = [];
  for (const t of trendRows) {
    const label = getBucketLabel(new Date(t.createdAt), granularity);
    if (!bucketMap[label]) {
      bucketMap[label] = { label, salesAmount: 0, profit: 0 };
      bucketOrder.push(label);
    }
    bucketMap[label].salesAmount += t.amount || 0;
    bucketMap[label].profit += t.profit || 0;
  }
  const trend = bucketOrder.map((label) => ({
    label,
    salesAmount: round2(bucketMap[label].salesAmount),
    profit: round2(bucketMap[label].profit),
  }));

  return { success: true, data: { summary, trend, ranking } };
};

// ============ M3 经营分析与库存调整 ============

// 退货入库：新建批次 + 增库存 + 写负金额 return 流水（事务）
const returnGoods = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { beerId, quantity, unitPrice, productionDate = "", orderNo = "", remark = "" } = event || {};
  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!beerId) return { success: false, errMsg: "请选择品类" };
  if (!Number.isInteger(qty) || qty <= 0) return { success: false, errMsg: "退货数量必须为正整数" };
  if (!(price > 0)) return { success: false, errMsg: "退货单价需大于 0" };

  const operatorId = cloud.getWXContext().OPENID;
  const production = parseDate(productionDate);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const beer = (await transaction.collection("beers").doc(beerId).get()).data;
      if (!beer) throw new Error("品类不存在");

      const expiry = production ? new Date(production.getTime() + beer.shelfLifeDays * 86400000) : null;

      const batchRes = await transaction.collection("batches").add({
        data: {
          beerId,
          quantity: qty,
          productionDate: production || null,
          expiryDate: expiry,
          createdAt: db.serverDate(),
        },
      });
      const batchId = batchRes._id;

      // 退货冲减：amount/profit 记负
      const amount = round2(-qty * price);
      const profit = round2(-qty * (price - beer.costPrice));

      const txnRes = await transaction.collection("transactions").add({
        data: {
          type: "return",
          beerId,
          batchId,
          quantity: qty,
          unitPrice: price,
          productionDate: production || null,
          expiryDate: expiry,
          costPrice: beer.costPrice,
          amount,
          profit,
          orderNo: String(orderNo || ""),
          operatorId,
          remark: String(remark || ""),
          createdAt: db.serverDate(),
        },
      });

      await transaction.collection("beers").doc(beerId).update({
        data: { stock: beer.stock + qty, updatedAt: db.serverDate() },
      });

      return { batchId, txnId: txnRes._id };
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "退货入库失败" };
  }
};

// 报废出库：扣减批次 + 减库存 + 写损失 scrap 流水（事务，单批次）
const scrap = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { beerId, batchId, quantity, remark = "" } = event || {};
  const qty = Number(quantity);
  if (!beerId) return { success: false, errMsg: "请选择品类" };
  if (!batchId) return { success: false, errMsg: "请选择报废批次" };
  if (!Number.isInteger(qty) || qty <= 0) return { success: false, errMsg: "报废数量必须为正整数" };

  const operatorId = cloud.getWXContext().OPENID;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const beer = (await transaction.collection("beers").doc(beerId).get()).data;
      if (!beer) throw new Error("品类不存在");
      if (beer.stock < qty) throw new Error("库存不足");

      const batch = (await transaction.collection("batches").doc(batchId).get()).data;
      if (!batch || batch.beerId !== beerId) throw new Error("批次不存在或不属于该品类");
      if (batch.quantity < qty) throw new Error("库存不足");

      const costPrice = beer.costPrice;
      const amount = round2(qty * costPrice); // 报废损失

      await transaction.collection("batches").doc(batchId).update({
        data: { quantity: batch.quantity - qty },
      });

      await transaction.collection("beers").doc(beerId).update({
        data: { stock: beer.stock - qty, updatedAt: db.serverDate() },
      });

      const txnRes = await transaction.collection("transactions").add({
        data: {
          type: "scrap",
          beerId,
          batchId,
          quantity: qty,
          unitPrice: costPrice,
          costPrice,
          amount,
          remark: String(remark || ""),
          operatorId,
          createdAt: db.serverDate(),
        },
      });

      return { txnId: txnRes._id, amount };
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "报废出库失败" };
  }
};

// 库存盘点：对比账面与实际，调整库存 + 写 adjust 流水（事务，支持局部）
const stocktake = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { items, remark = "" } = event || {};
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, errMsg: "请至少盘点一个品类" };
  }

  const operatorId = cloud.getWXContext().OPENID;
  const orderNo = `PD${Date.now()}`;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const adjustments = [];
      for (const it of items) {
        if (!it.beerId) continue;
        const actualQty = Number(it.actualQty);
        if (!Number.isInteger(actualQty) || actualQty < 0) {
          throw new Error("盘点数量必须为非负整数");
        }
        const beer = (await transaction.collection("beers").doc(it.beerId).get()).data;
        if (!beer) continue;
        const diff = actualQty - beer.stock;
        if (diff === 0) continue;

        await transaction.collection("beers").doc(it.beerId).update({
          data: { stock: actualQty, updatedAt: db.serverDate() },
        });

        // 盘亏记损失（正数），盘盈 amount 记 0
        const amount = diff < 0 ? round2(-diff * beer.costPrice) : 0;
        await transaction.collection("transactions").add({
          data: {
            type: "adjust",
            beerId: it.beerId,
            batchId: null,
            quantity: diff,
            costPrice: beer.costPrice,
            amount,
            orderNo,
            operatorId,
            remark: String(remark || ""),
            createdAt: db.serverDate(),
          },
        });
        adjustments.push({ beerId: it.beerId, diff });
      }
      return { adjustments, orderNo };
    });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "盘点失败" };
  }
};

// 流水查询：分页 + 筛选 + 汇总（销售额/净利润/损失）
const getTransactions = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { page = 1, pageSize = 20, txnType = "", beerId = "", startDate = "", endDate = "" } = event || {};

  const cond = {};
  if (txnType) cond.type = txnType;
  if (beerId) cond.beerId = beerId;
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start && end) {
    cond.createdAt = _.gte(start).and(_.lt(new Date(end.getTime() + 86400000)));
  } else if (start) {
    cond.createdAt = _.gte(start);
  } else if (end) {
    cond.createdAt = _.lt(new Date(end.getTime() + 86400000));
  }

  const total = (await db.collection("transactions").where(cond).count()).total;

  // 汇总（对筛选全集内存累加，复用 fetchTransactions）
  const all = await fetchTransactions(cond, { type: true, amount: true, profit: true });
  let salesAmount = 0;
  let profit = 0;
  let loss = 0;
  for (const t of all) {
    if (t.type === "out" || t.type === "return") {
      salesAmount += t.amount || 0;
      profit += t.profit || 0;
    } else if (t.type === "scrap" || t.type === "adjust") {
      loss += t.amount || 0;
    }
  }
  const summary = {
    salesAmount: round2(salesAmount),
    profit: round2(profit),
    loss: round2(loss),
    count: total,
  };

  // 当前页（时间倒序）
  const res = await db
    .collection("transactions")
    .where(cond)
    .orderBy("createdAt", "desc")
    .skip((Number(page) - 1) * Number(pageSize))
    .limit(Number(pageSize))
    .get();
  const rows = res.data;

  // join 品类名
  const beerIds = [...new Set(rows.map((t) => t.beerId).filter(Boolean))];
  const beerNameMap = {};
  if (beerIds.length) {
    const beers = (
      await db.collection("beers").where({ _id: _.in(beerIds) }).field({ name: true }).limit(1000).get()
    ).data;
    beers.forEach((b) => (beerNameMap[b._id] = b.name));
  }
  const list = rows.map((t) => ({ ...t, beerName: beerNameMap[t.beerId] || "未知" }));

  const hasMore = Number(page) * Number(pageSize) < total;
  return { success: true, data: { list, total, hasMore, summary } };
};

// ============ M4 消费者商城与权限 ============

// 判断 openid 是否为有效管理员
const isAdmin = async (openid) => {
  if (!openid) return false;
  const res = await db
    .collection("admins")
    .where({ openid, status: "active" })
    .limit(1)
    .get();
  return res.data.length > 0;
};

// 判断 openid 是否为 owner（仅 owner 可成员管理）
const isOwner = async (openid) => {
  if (!openid) return false;
  const res = await db
    .collection("admins")
    .where({ openid, role: "owner", status: "active" })
    .limit(1)
    .get();
  return res.data.length > 0;
};

// 获取当前用户角色（首位打开者自动成为 owner）
const getMyRole = async () => {
  const openid = cloud.getWXContext().OPENID;
  const res = await db.collection("admins").where({ openid }).limit(1).get();
  if (res.data.length > 0) {
    const admin = res.data[0];
    return { success: true, data: { role: admin.role || "operator", isAdmin: true, openid } };
  }
  const count = (await db.collection("admins").count()).total;
  if (count === 0) {
    await db.collection("admins").add({
      data: { openid, nickname: "", role: "owner", status: "active", createdAt: db.serverDate() },
    });
    return { success: true, data: { role: "owner", isAdmin: true, openid } };
  }
  return { success: true, data: { role: "customer", isAdmin: false, openid } };
};

// 商城商品列表（公开）：只返回展示字段，不下发成本价
const getShopBeers = async (event) => {
  const { keyword = "", categoryId = "" } = event || {};
  const cond = { status: "active", stock: _.gt(0) };
  if (keyword) cond.name = db.RegExp({ regexp: keyword, options: "i" });
  if (categoryId) cond.categoryId = categoryId;
  const beers = (
    await db
      .collection("beers")
      .where(cond)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get()
  ).data;

  const categories = (await db.collection("categories").limit(500).get()).data;
  const catMap = {};
  categories.forEach((c) => (catMap[c._id] = c.name));

  const list = beers.map((b) => ({
    _id: b._id,
    name: b.name,
    spec: b.spec || "",
    sellingPrice: b.sellingPrice,
    stock: b.stock,
    categoryName: catMap[b.categoryId] || "未分类",
    icon: b.icon || "🍺",
    image: b.image || "",
  }));
  return { success: true, data: list };
};

// 客人下单：FEFO 扣批次 + 减库存 + 写 out 流水 + 建订单（事务）
const createOrder = async (event) => {
  const { customerName, customerPhone, items, remark = "" } = event || {};
  const name = String(customerName || "").trim();
  const phone = String(customerPhone || "").trim();
  if (!name) return { success: false, errMsg: "请填写联系人姓名" };
  if (!phone) return { success: false, errMsg: "请填写联系电话" };
  if (!Array.isArray(items) || items.length === 0) return { success: false, errMsg: "购物车为空" };

  // 合并同品类重复项并校验
  const merged = {};
  for (const it of items) {
    const q = Number(it.quantity);
    if (!it.beerId || !Number.isInteger(q) || q <= 0) {
      return { success: false, errMsg: "购买数量必须为正整数" };
    }
    merged[it.beerId] = (merged[it.beerId] || 0) + q;
  }
  const beerList = Object.keys(merged).map((beerId) => ({ beerId, quantity: merged[beerId] }));

  const openid = cloud.getWXContext().OPENID;
  const orderNo = `ORD${Date.now()}`;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const orderItems = [];
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const item of beerList) {
        const beer = (await transaction.collection("beers").doc(item.beerId).get()).data;
        if (!beer) throw new Error("商品不存在");
        if (beer.stock < item.quantity) throw new Error(`${beer.name} 库存不足`);

        // FEFO：按到期日升序（未填到期日排后）自动扣减批次
        const batches = (
          await transaction
            .collection("batches")
            .where({ beerId: item.beerId, quantity: _.gt(0) })
            .limit(500)
            .get()
        ).data;
        batches.sort((a, b) => {
          if (a.expiryDate == null && b.expiryDate == null) return 0;
          if (a.expiryDate == null) return 1;
          if (b.expiryDate == null) return -1;
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        });

        let remaining = item.quantity;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantity, remaining);
          await transaction.collection("batches").doc(batch._id).update({
            data: { quantity: batch.quantity - take },
          });
          const amount = round2(take * beer.sellingPrice);
          const profit = round2(amount - take * beer.costPrice);
          await transaction.collection("transactions").add({
            data: {
              type: "out",
              beerId: item.beerId,
              batchId: batch._id,
              quantity: take,
              unitPrice: beer.sellingPrice,
              costPrice: beer.costPrice,
              amount,
              profit,
              orderNo,
              operatorId: openid,
              remark: "商城订单",
              createdAt: db.serverDate(),
            },
          });
          remaining -= take;
        }
        if (remaining > 0) throw new Error(`${beer.name} 库存不足`);

        await transaction.collection("beers").doc(item.beerId).update({
          data: { stock: beer.stock - item.quantity, updatedAt: db.serverDate() },
        });

        const itemAmount = round2(item.quantity * beer.sellingPrice);
        totalQuantity += item.quantity;
        totalAmount = round2(totalAmount + itemAmount);
        orderItems.push({
          beerId: item.beerId,
          name: beer.name,
          spec: beer.spec || "",
          unitPrice: beer.sellingPrice,
          quantity: item.quantity,
          amount: itemAmount,
        });
      }

      const orderRes = await transaction.collection("orders").add({
        data: {
          orderNo,
          customerOpenid: openid,
          customerName: name,
          customerPhone: phone,
          items: orderItems,
          totalQuantity,
          totalAmount,
          status: "pending",
          remark: String(remark || ""),
          createdAt: db.serverDate(),
        },
      });

      return { orderId: orderRes._id, orderNo, totalQuantity, totalAmount, items: orderItems, remark: String(remark || "") };
    });
    // 新订单提醒（事件触发，失败静默，不阻塞下单）
    await sendNewOrderReminder({ orderNo: result.orderNo, items: result.items, totalAmount: result.totalAmount, totalQuantity: result.totalQuantity, remark: result.remark });
    return { success: true, data: result };
  } catch (e) {
    return { success: false, errMsg: e.message || "下单失败" };
  }
};

// 订单查询：管理员看全部（可筛状态），客人只看自己
const getOrders = async (event) => {
  const { page = 1, pageSize = 20, status = "" } = event || {};
  const openid = cloud.getWXContext().OPENID;
  const admin = await isAdmin(openid);

  const cond = {};
  if (status) cond.status = status;
  if (!admin) cond.customerOpenid = openid;

  const total = (await db.collection("orders").where(cond).count()).total;
  const res = await db
    .collection("orders")
    .where(cond)
    .orderBy("createdAt", "desc")
    .skip((Number(page) - 1) * Number(pageSize))
    .limit(Number(pageSize))
    .get();

  const hasMore = Number(page) * Number(pageSize) < total;
  return { success: true, data: { list: res.data, total, hasMore } };
};

// 更新订单状态：completed 仅改状态；cancelled 回补库存 + 写 return 负流水（事务）
const updateOrderStatus = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { orderId, status } = event || {};
  if (!orderId) return { success: false, errMsg: "缺少订单 id" };
  if (status !== "completed" && status !== "cancelled") {
    return { success: false, errMsg: "无效的状态" };
  }

  const operatorId = cloud.getWXContext().OPENID;

  try {
    await db.runTransaction(async (transaction) => {
      const order = (await transaction.collection("orders").doc(orderId).get()).data;
      if (!order) throw new Error("订单不存在");
      if (order.status !== "pending") throw new Error("订单已处理");

      if (status === "cancelled") {
        // 回补库存 + 写 return 负流水（复用退货口径）
        for (const item of order.items || []) {
          const beer = (await transaction.collection("beers").doc(item.beerId).get()).data;
          if (!beer) continue;

          const batchRes = await transaction.collection("batches").add({
            data: {
              beerId: item.beerId,
              quantity: item.quantity,
              productionDate: null,
              expiryDate: null,
              createdAt: db.serverDate(),
            },
          });

          const amount = round2(-item.quantity * item.unitPrice);
          const profit = round2(-item.quantity * (item.unitPrice - beer.costPrice));
          await transaction.collection("transactions").add({
            data: {
              type: "return",
              beerId: item.beerId,
              batchId: batchRes._id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              productionDate: null,
              expiryDate: null,
              costPrice: beer.costPrice,
              amount,
              profit,
              orderNo: order.orderNo || "",
              operatorId,
              remark: "订单取消回补",
              createdAt: db.serverDate(),
            },
          });

          await transaction.collection("beers").doc(item.beerId).update({
            data: { stock: beer.stock + item.quantity, updatedAt: db.serverDate() },
          });
        }
      }

      await transaction.collection("orders").doc(orderId).update({
        data: { status, updatedAt: db.serverDate() },
      });
    });
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message || "操作失败" };
  }
};

// 添加管理员（仅 owner 录入 openid，角色固定 operator）
const addAdmin = async (event) => {
  if (!(await isOwner(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { openid: targetOpenid, nickname = "" } = event || {};
  if (!targetOpenid) return { success: false, errMsg: "缺少 openid" };
  const exists = await db.collection("admins").where({ openid: targetOpenid }).limit(1).get();
  if (exists.data.length > 0) return { success: false, errMsg: "该用户已是管理员" };
  await db.collection("admins").add({
    data: {
      openid: targetOpenid,
      nickname: String(nickname || ""),
      role: "operator",
      status: "active",
      createdAt: db.serverDate(),
    },
  });
  return { success: true };
};

// ============ M5 数据导出与成员管理 ============

// 查询全部管理员（仅 owner）
const getAdmins = async () => {
  if (!(await isOwner(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const res = await db.collection("admins").orderBy("createdAt", "asc").limit(500).get();
  return { success: true, data: res.data };
};

// 移除管理员（软删除，仅 owner；保护：不能移除自己、不能移除唯一 owner）
const removeAdmin = async (event) => {
  if (!(await isOwner(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const self = cloud.getWXContext().OPENID;
  const { id } = event || {};
  if (!id) return { success: false, errMsg: "缺少成员 id" };
  const targetRes = await db.collection("admins").where({ _id: id }).limit(1).get();
  const target = targetRes.data[0];
  if (!target) return { success: false, errMsg: "成员不存在" };
  if (target.openid === self) return { success: false, errMsg: "不能移除自己" };
  if (target.role === "owner") {
    const ownerCount = (
      await db.collection("admins").where({ role: "owner", status: "active" }).count()
    ).total;
    if (ownerCount <= 1) return { success: false, errMsg: "至少保留一个 owner" };
  }
  await db.collection("admins").doc(id).update({
    data: { status: "disabled", updatedAt: db.serverDate() },
  });
  return { success: true };
};

// 移交 owner：将某 operator 提升为 owner（自己保持 owner，允许多 owner）
const transferOwner = async (event) => {
  if (!(await isOwner(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { id } = event || {};
  if (!id) return { success: false, errMsg: "缺少成员 id" };
  const targetRes = await db.collection("admins").where({ _id: id }).limit(1).get();
  const target = targetRes.data[0];
  if (!target) return { success: false, errMsg: "成员不存在" };
  if (target.status !== "active") return { success: false, errMsg: "该成员已停用" };
  if (target.role === "owner") return { success: false, errMsg: "该成员已是 owner" };
  await db.collection("admins").doc(id).update({
    data: { role: "owner", updatedAt: db.serverDate() },
  });
  return { success: true };
};

// 生成邀请码（仅 owner，7 天有效期）
const createInvite = async () => {
  if (!(await isOwner(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.collection("invites").add({
    data: {
      code,
      createdBy: cloud.getWXContext().OPENID,
      createdAt: db.serverDate(),
      expiresAt,
      status: "active",
    },
  });
  return { success: true, data: { code, expiresAt } };
};

// 邀请码加入（公开：customer 输入邀请码成为 operator）
const joinByInvite = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const code = String((event && event.code) || "").trim().toUpperCase();
  if (!code) return { success: false, errMsg: "请输入邀请码" };
  const res = await db.collection("invites").where({ code, status: "active" }).limit(1).get();
  if (res.data.length === 0) return { success: false, errMsg: "邀请码无效或已使用" };
  const invite = res.data[0];
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await db.collection("invites").doc(invite._id).update({ data: { status: "cancelled" } });
    return { success: false, errMsg: "邀请码已过期" };
  }
  const exists = await db.collection("admins").where({ openid }).limit(1).get();
  if (exists.data.length > 0) return { success: false, errMsg: "你已是管理员" };
  await db.collection("admins").add({
    data: {
      openid,
      nickname: "",
      role: "operator",
      status: "active",
      createdAt: db.serverDate(),
    },
  });
  await db.collection("invites").doc(invite._id).update({
    data: { status: "used", usedBy: openid, usedAt: db.serverDate() },
  });
  return { success: true };
};

// ============ 数据导出（CSV 剪贴板） ============

const TYPE_LABEL = { in: "进货", out: "销售", return: "退货", scrap: "报废", adjust: "调整" };
const EXPIRY_LABEL = { normal: "正常", expiring: "临期", expired: "过期", unfilled: "未填", none: "无批次" };

// CSV 字段转义（含逗号/引号/换行时加引号）
const csvEscape = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
};

// header + rows → CSV 字符串
const toCsv = (header, rows) => {
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\r\n");
};

// 时间格式化（YYYY-MM-DD HH:mm）
const formatCsvDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

// 数据导出：生成 CSV 字符串（含 BOM），前端复制到剪贴板
const exportData = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const { target = "transactions", startDate = "", endDate = "", period = "month" } = event || {};
  const d = new Date();
  const dateTag = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  let csv = "";
  let filename = "";

  if (target === "transactions" || target === "adjust") {
    const cond = {};
    if (target === "adjust") cond.type = "adjust";
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (start && end) cond.createdAt = _.gte(start).and(_.lt(new Date(end.getTime() + 86400000)));
    else if (start) cond.createdAt = _.gte(start);
    else if (end) cond.createdAt = _.lt(new Date(end.getTime() + 86400000));

    const all = await fetchTransactions(cond, {
      type: true, beerId: true, quantity: true, unitPrice: true, amount: true,
      costPrice: true, profit: true, orderNo: true, operatorId: true, remark: true, createdAt: true,
    });
    const beerIds = [...new Set(all.map((t) => t.beerId).filter(Boolean))];
    const beerNameMap = {};
    if (beerIds.length) {
      const beers = (
        await db.collection("beers").where({ _id: _.in(beerIds) }).field({ name: true }).limit(1000).get()
      ).data;
      beers.forEach((b) => (beerNameMap[b._id] = b.name));
    }
    const header = ["时间", "类型", "品类", "数量", "单价", "金额", "成本", "利润", "订单号", "操作人", "备注"];
    const rows = all.map((t) => ({
      时间: formatCsvDate(t.createdAt),
      类型: TYPE_LABEL[t.type] || t.type,
      品类: beerNameMap[t.beerId] || "未知",
      数量: t.quantity,
      单价: t.unitPrice,
      金额: t.amount,
      成本: t.costPrice,
      利润: t.profit,
      订单号: t.orderNo || "",
      操作人: t.operatorId || "",
      备注: t.remark || "",
    }));
    csv = toCsv(header, rows);
    filename = `${target === "adjust" ? "盘点记录" : "流水明细"}_${dateTag}.csv`;
  } else if (target === "stock") {
    const { list } = await getBeersEnriched({});
    const header = ["品类", "分类", "规格", "售价", "成本", "库存(瓶)", "最早到期日", "保质期状态", "保质期(天)"];
    const rows = list.map((b) => ({
      品类: b.name,
      分类: b.categoryName,
      规格: b.spec || "",
      售价: b.sellingPrice,
      成本: b.costPrice,
      "库存(瓶)": b.stock,
      最早到期日: b.earliestExpiryDate ? formatCsvDate(b.earliestExpiryDate).slice(0, 10) : "",
      保质期状态: EXPIRY_LABEL[b.expiryStatus] || b.expiryStatus,
      "保质期(天)": b.shelfLifeDays || "",
    }));
    csv = toCsv(header, rows);
    filename = `库存清单_${dateTag}.csv`;
  } else if (target === "sales") {
    const sales = await getSalesStats({ period, granularity: "month" });
    if (!sales.success) return sales;
    const { summary, ranking } = sales.data;
    const lines = [
      [csvEscape("指标"), csvEscape("数值")].join(","),
      [csvEscape("销售额(元)"), csvEscape(summary.salesAmount)].join(","),
      [csvEscape("净利润(元)"), csvEscape(summary.profit)].join(","),
      [csvEscape("销量(瓶)"), csvEscape(summary.salesQty)].join(","),
      [csvEscape("订单笔数"), csvEscape(summary.orderCount)].join(","),
      "",
      ["品类", "销量", "销售额", "净利润"].map(csvEscape).join(","),
    ];
    for (const r of ranking) {
      lines.push([r.name, r.salesQty, r.salesAmount, r.profit].map(csvEscape).join(","));
    }
    csv = lines.join("\r\n");
    filename = `销售统计_${dateTag}.csv`;
  } else {
    return { success: false, errMsg: "未知导出类型" };
  }

  return { success: true, data: { csv: "﻿" + csv, filename } };
};

// ============ M6 订阅消息提醒（handler） ============

// 时间格式化：Date → 'YYYY年M月D日 HH:mm'（订阅消息 time 字段）
const formatDateTime = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  const t = new Date(d);
  if (!Number.isFinite(t.getTime())) return "";
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${p(t.getHours())}:${p(t.getMinutes())}`;
};

// 发送一条订阅消息（封装 openapi，失败静默返回 false，不抛异常）
const sendSubscribeMessage = async (openid, templateId, page, data) => {
  if (!templateId) return false; // 模板未配置，跳过
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId,
      page,
      miniprogramState: "formal", // 正式版；开发调试可改 "developer"
      data,
    });
    return true;
  } catch (e) {
    // 43101 用户未订阅/额度耗尽等，静默跳过，不影响主流程
    console.error("订阅消息发送失败", (e && (e.errCode || e.errcode)) || "", (e && e.errMsg) || "");
    return false;
  }
};

// 扣减某管理员的某类额度（发送成功后调用）
const decrementQuota = async (openid, quotaField) => {
  const res = await db.collection("subscriptions").where({ openid }).limit(1).get();
  if (res.data.length === 0) return;
  await db.collection("subscriptions").doc(res.data[0]._id).update({
    data: {
      [quotaField]: _.inc(-1),
      totalSent: _.inc(1),
      updatedAt: db.serverDate(),
    },
  });
};

// 记录订阅授权（管理员点击授权后调用，累加可发条数）
const subscribeRemind = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  if (!(await isAdmin(openid))) return { success: false, errMsg: "无权限" };
  const expiring = Math.max(0, Number(event && event.expiring) || 0);
  const expired = Math.max(0, Number(event && event.expired) || 0);
  const newOrder = Math.max(0, Number(event && event.newOrder) || 0);
  const granted = expiring + expired + newOrder;
  if (granted === 0) return { success: false, errMsg: "未接受任何提醒授权" };

  const res = await db.collection("subscriptions").where({ openid }).limit(1).get();
  if (res.data.length > 0) {
    await db.collection("subscriptions").doc(res.data[0]._id).update({
      data: {
        expiringQuota: _.inc(expiring),
        expiredQuota: _.inc(expired),
        newOrderQuota: _.inc(newOrder),
        totalGranted: _.inc(granted),
        updatedAt: db.serverDate(),
      },
    });
  } else {
    await db.collection("subscriptions").add({
      data: {
        openid,
        expiringQuota: expiring,
        expiredQuota: expired,
        newOrderQuota: newOrder,
        totalGranted: granted,
        totalSent: 0,
        updatedAt: db.serverDate(),
      },
    });
  }
  return { success: true };
};

// 定时触发：扫描临期/过期批次，向已订阅管理员发送提醒
const scanAndSendReminders = async () => {
  if (!TEMPLATE_IDS.expiring && !TEMPLATE_IDS.expired) {
    return { success: true, skipped: "模板未配置" };
  }
  const expiringDays = await getExpiringDays();

  // 扫描在库批次：quantity > 0 且 expiryDate 非空（未填生产日期不参与）
  const batches = (
    await db.collection("batches").where({ quantity: _.gt(0), expiryDate: _.neq(null) }).limit(1000).get()
  ).data;

  const { expiring: expiringBatches, expired: expiredBatches } = classifyExpiry(batches, expiringDays);

  // join 品类名
  const beerIds = [...new Set([...expiringBatches, ...expiredBatches].map((b) => b.beerId))];
  const beerNameMap = {};
  if (beerIds.length) {
    const beers = (
      await db.collection("beers").where({ _id: _.in(beerIds) }).field({ name: true }).limit(1000).get()
    ).data;
    beers.forEach((x) => (beerNameMap[x._id] = x.name));
  }

  let sent = 0;

  // 临期提醒
  if (expiringBatches.length && TEMPLATE_IDS.expiring) {
    const subs = (await db.collection("subscriptions").where({ expiringQuota: _.gt(0) }).limit(100).get()).data;
    for (const sub of subs) {
      let quota = sub.expiringQuota;
      for (const b of expiringBatches) {
        if (quota <= 0) break;
        const ok = await sendSubscribeMessage(sub.openid, TEMPLATE_IDS.expiring, REMINDER_PAGE.expiring, {
          time2: { value: formatDateTime(b.expiryDate) },
          number3: { value: String(b.daysLeft) },
          thing1: { value: (beerNameMap[b.beerId] || "啤酒").slice(0, 20) },
        });
        if (ok) {
          await decrementQuota(sub.openid, "expiringQuota");
          quota--;
          sent++;
        }
      }
    }
  }

  // 过期提醒
  if (expiredBatches.length && TEMPLATE_IDS.expired) {
    const subs = (await db.collection("subscriptions").where({ expiredQuota: _.gt(0) }).limit(100).get()).data;
    for (const sub of subs) {
      let quota = sub.expiredQuota;
      for (const b of expiredBatches) {
        if (quota <= 0) break;
        const ok = await sendSubscribeMessage(sub.openid, TEMPLATE_IDS.expired, REMINDER_PAGE.expired, {
          thing1: { value: (beerNameMap[b.beerId] || "啤酒").slice(0, 20) },
          thing5: { value: `已过期 ${Math.abs(b.daysLeft)} 天，请尽快处理`.slice(0, 20) },
        });
        if (ok) {
          await decrementQuota(sub.openid, "expiredQuota");
          quota--;
          sent++;
        }
      }
    }
  }

  return { success: true, sent, expiring: expiringBatches.length, expired: expiredBatches.length };
};

// 新订单提醒（客人下单成功后调用，向已订阅管理员发送；不阻塞下单主流程）
// 模板字段：订单编号 character_string1、备注 thing3、支付金额 amount2（thing 限 20 字）
const sendNewOrderReminder = async (order) => {
  if (!TEMPLATE_IDS.newOrder) return;
  try {
    const subs = (await db.collection("subscriptions").where({ newOrderQuota: _.gt(0) }).limit(100).get()).data;
    if (!subs.length) return;
    const remark = String(order.remark || "").trim() || "无备注";
    for (const sub of subs) {
      const ok = await sendSubscribeMessage(sub.openid, TEMPLATE_IDS.newOrder, REMINDER_PAGE.newOrder, {
        character_string1: { value: String(order.orderNo || "") },
        thing3: { value: remark.slice(0, 20) },
        amount2: { value: String(order.totalAmount) },
      });
      if (ok) await decrementQuota(sub.openid, "newOrderQuota");
    }
  } catch (e) {
    console.error("新订单提醒发送失败", e);
  }
};

// ============ M7 打磨：设置 / 续订额度 / 兜底提醒 ============

// 读取全局设置（当前仅临期阈值）
const getSettings = async () => {
  const expiringDays = await getExpiringDays();
  return { success: true, data: { expiringDays } };
};

// 更新全局设置（仅 admin）：临期阈值
const updateSettings = async (event) => {
  if (!(await isAdmin(cloud.getWXContext().OPENID))) return { success: false, errMsg: "无权限" };
  const expiringDays = Number(event && event.expiringDays);
  if (!Number.isInteger(expiringDays) || expiringDays <= 0 || expiringDays > 365) {
    return { success: false, errMsg: "临期阈值需为 1~365 的整数（天）" };
  }
  await db.collection("settings").doc("global").set({
    data: { expiringDays, updatedAt: db.serverDate() },
  });
  return { success: true, data: { expiringDays } };
};

// 查询当前管理员订阅消息剩余额度（续订引导展示）
const getRemindQuota = async () => {
  const openid = cloud.getWXContext().OPENID;
  if (!(await isAdmin(openid))) return { success: false, errMsg: "无权限" };
  const res = await db.collection("subscriptions").where({ openid }).limit(1).get();
  if (res.data.length === 0) {
    return { success: true, data: { expiringQuota: 0, expiredQuota: 0, newOrderQuota: 0 } };
  }
  const s = res.data[0];
  return {
    success: true,
    data: {
      expiringQuota: s.expiringQuota || 0,
      expiredQuota: s.expiredQuota || 0,
      newOrderQuota: s.newOrderQuota || 0,
    },
  };
};

// 待处理提醒兜底列表：临期/过期批次清单（首页红点 + 列表）
const getRemindList = async () => {
  const openid = cloud.getWXContext().OPENID;
  if (!(await isAdmin(openid))) return { success: false, errMsg: "无权限" };
  const expiringDays = await getExpiringDays();
  const batches = (
    await db.collection("batches").where({ quantity: _.gt(0), expiryDate: _.neq(null) }).limit(1000).get()
  ).data;
  const { expiring, expired } = classifyExpiry(batches, expiringDays);

  const beerIds = [...new Set([...expiring, ...expired].map((b) => b.beerId))];
  const beerNameMap = {};
  if (beerIds.length) {
    const beers = (
      await db.collection("beers").where({ _id: _.in(beerIds) }).field({ name: true }).limit(1000).get()
    ).data;
    beers.forEach((x) => (beerNameMap[x._id] = x.name));
  }
  const toItem = (b) => ({
    batchId: b._id,
    beerId: b.beerId,
    beerName: beerNameMap[b.beerId] || "未知",
    daysLeft: b.daysLeft,
    expiryDate: b.expiryDate,
    quantity: b.quantity,
  });
  const expiringList = expiring.map(toItem);
  const expiredList = expired.map(toItem);
  return {
    success: true,
    data: {
      expiring: expiringList,
      expired: expiredList,
      expiringCount: expiringList.length,
      expiredCount: expiredList.length,
      total: expiringList.length + expiredList.length,
    },
  };
};

// 云函数入口函数
exports.main = async (event, context) => {
  // M6 定时触发器：每日扫描临期/过期批次并发送订阅消息
  if (event && event.Type === "Timer") {
    return await scanAndSendReminders();
  }
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "login":
      return await login(event);
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);

    // M1 啤酒仓库管理
    case "initDb":
      return await initDb();
    case "getCategories":
      return await getCategories();
    case "addCategory":
      return await addCategory(event);
    case "updateCategory":
      return await updateCategory(event);
    case "getBeers":
      return await getBeers(event);
    case "addBeer":
      return await addBeer(event);
    case "updateBeer":
      return await updateBeer(event);
    case "getBatches":
      return await getBatches(event);
    case "inbound":
      return await inbound(event);
    case "outbound":
      return await outbound(event);

    // M2 统计
    case "getStockStats":
      return await getStockStats(event);
    case "getSalesStats":
      return await getSalesStats(event);

    // M3 经营分析与库存调整
    case "returnGoods":
      return await returnGoods(event);
    case "scrap":
      return await scrap(event);
    case "stocktake":
      return await stocktake(event);
    case "getTransactions":
      return await getTransactions(event);

    // M4 消费者商城与权限
    case "getMyRole":
      return await getMyRole();
    case "getShopBeers":
      return await getShopBeers(event);
    case "createOrder":
      return await createOrder(event);
    case "getOrders":
      return await getOrders(event);
    case "updateOrderStatus":
      return await updateOrderStatus(event);
    case "addAdmin":
      return await addAdmin(event);

    // M5 数据导出与成员管理
    case "getAdmins":
      return await getAdmins();
    case "removeAdmin":
      return await removeAdmin(event);
    case "transferOwner":
      return await transferOwner(event);
    case "createInvite":
      return await createInvite();
    case "joinByInvite":
      return await joinByInvite(event);
    case "exportData":
      return await exportData(event);

    // M6 订阅消息提醒
    case "subscribeRemind":
      return await subscribeRemind(event);

    // M7 打磨：设置 / 续订额度 / 兜底提醒
    case "getSettings":
      return await getSettings();
    case "updateSettings":
      return await updateSettings(event);
    case "getRemindQuota":
      return await getRemindQuota();
    case "getRemindList":
      return await getRemindList();

    default:
      return { success: false, errMsg: "未知操作类型" };
  }
};
