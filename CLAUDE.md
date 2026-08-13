# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

啤酒仓库管理微信小程序，基于腾讯云开发 CloudBase（服务端单云函数 + 文档数据库 + 云存储）。PRD 见 [PRD.md](PRD.md)，按里程碑推进：**M1 进销存闭环已完成**，**M2 库存统计/销售统计已完成**，**M3 经营分析与库存调整已完成**，**M4 消费者商城与权限已完成**，**M5 数据导出与多管理员协作已完成**，**M6 订阅消息提醒已完成**，**M7 打磨已完成**（上线版本）。

## Running & developing

无本地 build/lint/test 工具链，开发在微信开发者工具中进行：

- 打开仓库根目录（`project.config.json` 设 `miniprogramRoot=miniprogram/`、`cloudfunctionRoot=cloudfunctions/`）。
- **必须先配置环境**：在 [miniprogram/app.js](miniprogram/app.js) 的 `this.globalData.env` 填入云环境 ID（默认空，未配置时首页会拦截跳转）。
- 改云函数后，右键 `cloudfunctions/quickstartFunctions` → 上传并部署（云端安装依赖）。
- 改 `config.json`（定时触发器/权限）后，右键 →「上传触发器」使其生效。
- 首次进入（`app.js` onLaunch）会自动调用 `initDb` 建集合与默认分类（含 orders/admins/invites/subscriptions/settings）；数据库索引（`beers.categoryId`、`batches.beerId+expiryDate`、`orders.customerOpenid`、`orders.status+createdAt`）需在云开发控制台手动建。

## Architecture

### 后端 = 单云函数 `quickstartFunctions` + `switch(event.type)` 分发

全部服务端逻辑在 [cloudfunctions/quickstartFunctions/index.js](cloudfunctions/quickstartFunctions/index.js)，每个操作一个 async handler，`exports.main` 用 `switch(event.type)` 路由。新增操作 = 加 handler + 加 `case`。

M1 已实现 type：

| type | 说明 | 事务 |
|------|------|------|
| `initDb` | 幂等建 8 集合 + 默认分类 | — |
| `getCategories` / `addCategory` / `updateCategory` | 分类维护（重命名/停用，不物理删除） | — |
| `getBeers` / `addBeer` / `updateBeer` | 品类维护；`getBeers` join 分类名 + 最低保质期时长 + 临期/过期/未填状态 | — |
| `getBatches` | 某品类在库批次（quantity>0） | — |
| `inbound` | 进货入库：新建批次 + `stock +=` + 写 `in` 流水 | ✅ |
| `outbound` | 销售出库：批次组合扣减 + `stock -=` + 写 `out` 流水（含 amount/profit） | ✅ |

M2 已实现 type：

| type | 说明 |
|------|------|
| `getStockStats` | 库存统计：`{categoryId, expiryStatus}` 入参；`totalStock`(全局) + `categorySummary` + `list`(内存筛选)；复用 `getBeersEnriched` |
| `getSalesStats` | 销售统计：`{period, granularity}` 入参；`summary`(销售额/净利润/销量/订单笔数) + `trend`(时间桶) + `ranking`(品类 Top20)；分页拉流水内存聚合 |

M3 已实现 type：

| type | 说明 | 事务 |
|------|------|------|
| `returnGoods` | 退货入库：新建批次 + `stock +=` + 写负金额 `return` 流水（amount/profit 记负冲减） | ✅ |
| `scrap` | 报废出库：扣批次 + `stock -=` + 写损失 `scrap` 流水（amount=数量×成本价，单批次） | ✅ |
| `stocktake` | 库存盘点：对比账面/实际，`stock=实际` + 写 `adjust` 流水（盘盈正/盘亏负，局部） | ✅ |
| `getTransactions` | 流水查询：`{page,pageSize,type,beerId,startDate,endDate}` 入参；分页 + 汇总（销售额/净利润/损失） | — |

M4 已实现 type：

| type | 说明 | 事务 |
|------|------|------|
| `getMyRole` | 角色判断：`admins` 命中→admin；空集合时首位打开者自动成为 owner；否则 customer | — |
| `getShopBeers` | 商城商品列表（公开）：仅展示字段 `name/spec/sellingPrice/stock/categoryName/icon`，`status=active` 且 `stock>0`，不下发 costPrice | — |
| `createOrder` | 客人下单：FEFO 扣批次 + `stock -=` + 写 `out` 流水（amount/profit）+ 建 `orders` | ✅ |
| `getOrders` | 订单查询：管理员看全部（可筛 status），客人仅自己（customerOpenid=自己） | — |
| `updateOrderStatus` | 订单状态：`completed` 仅改状态；`cancelled` 回补库存 + 写 `return` 负流水 | ✅ |
| `addAdmin` | 添加管理员（仅 owner 录入 openid，role 固定 operator） | — |

M5 已实现 type：

| type | 说明 | 事务 |
|------|------|------|
| `getAdmins` | 成员列表（仅 owner） | — |
| `removeAdmin` | 移除成员：软删除 `status=disabled`（仅 owner；不能移除自己/唯一 owner） | — |
| `transferOwner` | 移交 owner：operator→owner（仅 owner，原 owner 保持，支持多 owner） | — |
| `createInvite` | 生成 6 位邀请码（仅 owner，7 天有效，存 `invites`） | — |
| `joinByInvite` | 邀请码加入（公开：customer→operator） | — |
| `exportData` | 数据导出：`{target}` 生成 CSV（流水/库存/销售/盘点），返回 csv 文本供前端复制剪贴板 | — |

M6 已实现 type：

| type | 说明 |
|------|------|
| `subscribeRemind` | 记录订阅授权（仅 admin）：前端 `wx.requestSubscribeMessage` accept 后上报，累加 `subscriptions` 的临期/过期/新订单三类可发额度 |
| （定时触发器） | `exports.main` 顶部检测 `event.Type==="Timer"` → `scanAndSendReminders`：每日扫描在库批次，临期/过期分别向有额度管理员发订阅消息并扣额度 |
| （下单事件） | `createOrder` 事务成功后 `sendNewOrderReminder`：向已订阅管理员发新订单提醒（失败静默不阻塞下单） |

M7 已实现 type：

| type | 说明 |
|------|------|
| `getSettings` / `updateSettings` | 全局设置：读/写临期阈值 N（存 `settings/global` 单文档；仅 admin 可写，读回退默认 45） |
| `getRemindQuota` | 当前管理员订阅消息剩余额度（临期/过期/新订单，续订引导展示，仅 admin） |
| `getRemindList` | 待处理提醒兜底列表：临期/过期批次清单（首页红点+列表，仅 admin） |

模板遗留 demo type（`login`/`getOpenId`/`getMiniProgramCode`/`createCollection`/sales CRUD）仍保留，`pages/example`、`pages/login` 未删。

### 数据模型（9 集合）

- `categories` — 自定义分类：`name, sort, status`
- `beers` — 品类 SKU：`name, categoryId, spec, icon(商城 emoji 图标，可选), image(商品实拍图 cloud 文件 ID，可选，优先于 icon 显示), sellingPrice, costPrice, shelfLifeDays, stock(冗余汇总=Σbatches), status`
- `batches` — 批次库存：`beerId, quantity, productionDate(可空), expiryDate(可空), inboundTxnId`；临期/过期/未填判断的数据源
- `transactions` — 流水：`type(in/out/return/scrap/adjust), beerId, batchId, quantity, unitPrice, productionDate, expiryDate, costPrice, amount, profit, orderNo, operatorId, remark, createdAt`
- `orders` — 订单：`orderNo, customerOpenid, customerName, customerPhone, items[{beerId,name,spec,unitPrice,quantity,amount}], totalQuantity, totalAmount, status(pending/completed/cancelled), remark, createdAt`
- `admins` — 管理员白名单：`openid, nickname, role(owner/operator), status, createdAt`
- `invites` — 邀请码：`code, createdBy, createdAt, expiresAt, status(active/used/cancelled), usedBy, usedAt`
- `subscriptions` — 订阅消息额度：`openid, expiringQuota, expiredQuota, newOrderQuota, totalGranted, totalSent, updatedAt`（一次性订阅每条授权=1 条，发送成功后 `quota-=1`）
- `settings` — 全局设置：`_id:"global"` 单文档，`expiringDays`(临期阈值，默认 45)

### 关键约定

- **计量单位「瓶」**，不做瓶/箱换算；**金额「元」**存 number，`round2(n)=Math.round(n*100)/100`。
- **库存一致性**：`inbound`/`outbound` 必须用 `db.runTransaction`，禁止「先查后改」非原子写（PRD §7.1）。
- **生产日期可空**：未填时 `productionDate/expiryDate` 存 `null`，批次显示「未填」红点、不参与临期/过期判断；已填则 `expiryDate = productionDate + shelfLifeDays*86400000`。
- **临期阈值 N 默认 45 天**，可在「设置」页配置（存 `settings/global`，云函数 `getExpiringDays()` 读取、未配置回退默认 `EXPIRING_DAYS_DEFAULT`）。
- **operatorId**：云函数内 `cloud.getWXContext().OPENID`；M4 起引入 `admins` 白名单拦截——`isAdmin()` helper 校验，所有管理侧写操作（inbound/outbound/returnGoods/scrap/stocktake/addBeer/updateBeer/addCategory/updateCategory/updateOrderStatus）与读操作（getBeers/getBatches/getStockStats/getSalesStats/getTransactions/exportData）均拦截；M5 起 `isOwner()` helper 校验「仅 owner」操作（addAdmin/getAdmins/removeAdmin/transferOwner/createInvite）；`getMyRole`/`getShopBeers`/`getCategories`/`createOrder`/`getOrders`/`joinByInvite` 公开或内部区分角色。
- 日期经 picker 传 `YYYY-MM-DD`，云函数 `parseDate` 转本地时区 Date；聚合操作符用 `db.command.aggregate`（代码里 `const $ = db.command.aggregate`）。
- **订阅消息（M6）**：一次性订阅「每条授权=1 条」；前端 `wx.requestSubscribeMessage`（临期/过期/新订单三模板）+ `subscribeRemind` 上报累加 `subscriptions` 额度，发送用 `cloud.openapi.subscribeMessage.send` 成功后扣额度。三个模板 ID 已配置在 `TEMPLATE_IDS`（云函数）+ `utils/remind.js`（前端）两处：临期=会员到期（`time2` 到期时间/`number3` 剩余天数/`thing1` 品类名）、过期=库存预警（`thing1` 品类名/`thing5` 备注）、新订单（`character_string1` 订单号/`thing3` 备注/`amount2` 金额）；字段 key/类型须与各自模板一致（错配报 47003）。
- **定时触发器（M6）**：[config.json](cloudfunctions/quickstartFunctions/config.json) `triggers` 数组，cron 为 7 段（秒 分 时 日 月 周 年），`0 0 9 * * * *`=每天 9:00；触发时 `event.Type==="Timer"`。

### 前端结构

- [app.js](miniprogram/app.js) — `wx.cloud.init`；[app.json](miniprogram/app.json) 注册页面；[app.wxss](miniprogram/app.wxss) 全局配色（主色 `#F5A623`）/卡片/表单/按钮/标签。
- [utils/format.js](miniprogram/utils/format.js) — `formatMoney`/`formatDate`/`daysUntil` 纯函数。
- [utils/remind.js](miniprogram/utils/remind.js) — 订阅消息授权封装：`subscribeRemind()` 请求三模板授权并上报 `subscribeRemind`；`TEMPLATE_IDS` 与云函数占位对齐。
- [components/cloudTipModal](miniprogram/components/cloudTipModal/index.js) — 通用错误弹窗，`bind:close` 事件可重置外部 `showTip`。
- [components/trend-chart](miniprogram/components/trend-chart/index.js) — canvas 2d 自绘折线图组件（不依赖 echarts）；properties `labels:Array`/`series:Array[{name,color,data}]`，observer 重绘 + 触摸查看数据点。
- **tabBar 三页（客人端 + 管理入口）**：`shop`(商城：banner + 分类筛选 + 商品网格(实拍图/emoji) + 加购)、`cart`(购物车：本地 storage + 数量增减 + 结算下单)、`mine`(我的：角色识别 + 我的订单预览(查看全部→`my-orders`) + 管理后台入口 + 消息提醒订阅(显示剩余额度) + 设置入口 + 成员管理入口(仅 owner) + 加入管理(客人邀请码))。
- 顾客侧页：`my-orders`(我的订单：顾客历史订单分页列表，从 mine 页「查看全部」进入)。
- 管理后台页：`index`(首页宫格 + 待处理提醒红点/列表)、`orders`(订单管理：状态筛选 + 完成/取消)、`members`(成员管理：邀请码 + 录入 openid + 移交 owner + 移除)、`export`(数据导出：四对象 CSV 剪贴板)、`manage`(仓库管理/品类列表)、`beer-edit`(品类表单，含 emoji icon + 商品实拍图上传)、`category`(分类管理)、`inbound`(进货)、`outbound`(销售出库批次组合+FEFO)、`stock`(库存统计：总库存+分类汇总+明细筛选+订阅提醒横幅(含剩余额度))、`statistics`(销售统计：周期 tab+汇总卡+趋势图+品类排行)、`return`(退货入库)、`scrap`(报废出库：单批次+原因)、`stocktake`(库存盘点：局部+账实对比)、`ledger`(流水：筛选+汇总卡+明细分页)、`settings`(设置：临期阈值)。
- 购物车数据存本地 `wx.getStorageSync("cart")`；下单成功清空并跳「我的」。
- 页面统一 `wx.cloud.callFunction({ name:"quickstartFunctions", data:{ type, ... } })` 调用后端，无请求封装层。
