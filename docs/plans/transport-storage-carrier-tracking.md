# Shiplog — Transport / Storage / 船司查询 开发计划

> 制定于 2026-11-03。导航新增 **Transport**、**Storage** 两个 tab，**Market Data** 扩充船司查询。
> 前端骨架已上线（示例数据 + 黄色 Preview 提示），下面是把每个模块做成可商用的完整计划。
> 用法：完成一项就把 `[ ]` 改成 `[x]`，在「进度日志」里记一行。

## 总原则

- **先后端，后前端**：同一功能先上线并验证后端，再让前端接上（见 `AGENTS.md`——前端跑在后端前面会直接坏给真实用户）。
- 所有数据按 workspace 隔离；viewer 只读，沿用现有权限模型。
- 前端从示例数据切到真实 API 时：在 `lib/api.ts` 加类型化函数，删掉对应的 `sample-data.ts`，去掉 `PreviewNotice`。

## 建议顺序

1. **船司查询**——工作量最小、立刻有价值（接聚合 API）。
2. **Storage**——入库 → 库存 → 出库主线，再接装箱单 AI 识别。
3. **Transport**——先做网页版 MVP，验证需求后再决定是否做原生 App。

---

## 0. 前端骨架（已完成）

- [x] 导航新增 Transport / Storage tab，带子路由的 section 按前缀高亮（`components/NavBar.tsx`）
- [x] 共享组件 `StatTile`、`Badge`、`PreviewNotice`（`components/ui/`）
- [x] Storage 页：仓库切换、KPI、Inventory / Inbound / Outbound / Packing lists（`app/storage/`）
- [x] Transport 页：车辆列表 + 状态过滤 + 地图占位 + 行程详情（`app/transport/page.tsx`）
- [x] 司机手机端：本地读取 GPS、任务进度步骤（`app/transport/driver/page.tsx`）
- [x] Market Data 拆分子页：Carrier tracking（新）/ FX & rates（原有）（`app/market-data/`）
- [x] 船司前缀自动识别 + 测试（`app/market-data/carriers.ts`）
- [x] 渲染测试（`app/skeleton-pages.test.tsx`），已合并到 main（`6f36984`）

---

## 1. Market Data → 船司查询

### 数据来源决策（先定这个）

⚠️ 这 13 家船司官网（MSK / ONE / YML / TSL / EMC / ZIM / HPL / HMM / MSC / OOCL / CMA / COSCO / ANL）
大多在使用条款里禁止自动抓取，并有 Akamai / Cloudflare / 验证码防护，页面结构也常改。
在 Vercel 上直接爬会很不稳定，商用也有法律风险，**不作为主方案**。

- [ ] 评估聚合 API（推荐，最快能商用）：Vizion / Terminal49 / ShipsGo / SeaRates 等——对比覆盖船司、单价、免费额度、更新频率
- [ ] 逐家核实官方 API（Maersk、Hapag-Lloyd、CMA CGM 等有开发者平台，多遵循 DCSA Track & Trace）——是否开放、注册条件、条款
- [ ] 定方案并记录在本文件「决策记录」

### 后端

- [ ] `CarrierAdapter` 接口：每个来源一个 adapter，统一转换为标准 `TrackingResult`（事件用 DCSA 事件码）
- [ ] `GET /workspaces/{id}/tracking?ref=&carrier=`：查询 + 缓存 1–3 小时（控制 API 费用）
- [ ] `tracked_containers` 表：ref、carrier、kind、最新状态、ETA、last_checked_at、关联 shipment_id
- [ ] Watch / Unwatch 接口
- [ ] Vercel Cron 每 6 小时刷新已关注柜号；ETA 变化时生成提醒
- [ ] Shipments 中已有柜号的自动加入追踪，结果回写状态和 ETA
- [ ] 查不到时的兜底：返回船司官网查询链接（能带单号的就带上）

### 前端

- [ ] `lib/api.ts` 加 `trackReference` / `watchReference` 等函数，替换示例时间线
- [ ] 批量查询（一行一个号，最多 50 个）
- [ ] 「Link to shipment」：查询结果关联到现有 shipment
- [ ] 已关注柜号列表 + ETA 变化标记
- [ ] 补全 TSL、ANL 的前缀（目前留空，确认后再加，不要猜）

### 第二期

- [ ] 船期查询（DCSA Commercial Schedules）：起运港 → 目的港的航线和船期

---

## 2. Storage（仓库 WMS）

### 数据模型

| 表 | 关键字段 |
|---|---|
| `warehouses` / `locations` | 仓库；库位编码（区-排-层，如 A-01-03） |
| `skus` | sku、描述、货主（customer_id）、单位、单件体积和重量 |
| `inventory_movements` | **只追加的流水**：receive / putaway / pick / adjust / ship，数量、库位、关联单据、操作人 |
| `stock_levels` | 由流水汇总的库存缓存（sku × location），加速查询 |
| `inbound_orders` + `lines` | ASN：柜号、ETA、每行预期 / 实收数量、差异原因 |
| `outbound_orders` + `lines` | 收货人、要求发货日期、分配的库存 |
| `packing_lists` + `lines` | 箱号段、SKU、每箱件数、箱数、净重 / 毛重、尺寸、CBM |

### 后端

- [ ] 建表 + 迁移（以上全部）
- [ ] 仓库 / 库位 / SKU 的 CRUD
- [ ] 入库流程：Expected → Arrived → Receiving（逐行清点，差异必须填原因）→ Put away → Closed
- [ ] 出库流程：Pending → Allocated（锁定库存）→ Picking → Packed → Dispatched
- [ ] 每一步状态变化都写 `inventory_movements`，库存永远可追溯
- [ ] 库存调整（adjust）要求 owner / admin 且必须填原因
- [ ] 装箱单上传：复用现有文档上传 + AI 识别，生成入库单草稿（**人工确认后才提交**）
- [ ] 出库 Packed 时自动生成装箱单 PDF
- [ ] 出库 Dispatched 时自动生成一条 Transport 行程

### 前端

- [ ] 各子页接入真实 API，替换 `app/storage/sample-data.ts`
- [ ] 新建入库 / 出库表单
- [ ] 收货清点界面（逐行输入实收数）
- [ ] 打印拣货单、导出 CSV
- [ ] 搜索、筛选、分页（参考 ShipmentsTable 的做法）

### 第二期

- [ ] 手机扫码收货和拣货（PWA 调摄像头扫条码）
- [ ] 按托盘 / CBM 计算仓储费
- [ ] 库龄报表

---

## 3. Transport（GPS 实时位置）

### 结构

司机手机网页（magic link）→ 每 15–30 秒批量上传定位 → 后端存储 → 网页端每 10 秒轮询刷新。

### 后端

- [ ] `trips` 表：车辆、司机、关联 shipment / 出库单、状态、最新位置、ETA
- [ ] `location_pings` 表：trip_id、经纬度、精度、速度、方向、recorded_at；保留 90 天
- [ ] 司机 magic link：一次性 token 绑定行程、到期失效，**司机无需注册账号**
- [ ] `POST /trips/{id}/pings`：批量接收定位（token 鉴权）
- [ ] `GET /workspaces/{id}/transport/live`：所有在途车辆的最新位置
- [ ] 超过 15 分钟无定位 → 标记 offline
- [ ] 地理围栏：自动识别「到达提货点 / 送货点」
- [ ] ETA：接路线规划 API 计算
- [ ] 客户只读追踪链接

### 前端

- [ ] 接入地图：MapLibre GL + MapTiler 或 Mapbox 底图，替换当前的地图占位
- [ ] 车辆列表 / 详情接真实 API，替换 `app/transport/sample-data.ts`
- [ ] Assign driver：选司机、车辆、关联货运，发送 magic link
- [ ] 司机端把定位上传到后端，并支持断网时本地缓存、恢复后补传
- [ ] 司机端显示定位共享同意说明（首次必须明确同意）
- [ ] 行程历史轨迹回放
- [ ] 送达签收（POD）拍照上传

### 已知限制 / 合规

- [ ] **网页版做不到后台定位**：锁屏或切走 App 后 iOS Safari 停止 GPS。要全程上报 → 第二期评估 Capacitor 原生 App，或对接车队现有 GPS 设备
- [ ] **维州 Surveillance Devices Act**：追踪需当事人同意 → 司机端明确同意 + 只在行程进行中共享
- [ ] 如需显示中国境内车辆：改用高德地图并转换 GCJ-02 坐标
- [ ] 实时性：Vercel serverless 不能维持 WebSocket，MVP 用轮询；需要秒级时再接 Ably / Pusher / Supabase Realtime

---

## 决策记录

| 日期 | 决策 | 原因 |
|---|---|---|
| 2026-11-03 | 船司查询不以爬官网为主方案 | 条款禁止 + 反爬防护 + 结构常变，商用风险高 |
| 2026-11-03 | Transport MVP 用轮询而非 WebSocket | 后端跑在 Vercel serverless |
| 2026-11-03 | 库存用只追加流水 + 汇总缓存 | 每笔库存变动可追溯 |

## 进度日志

- 2026-11-03：三个模块的前端骨架完成并合并到 main（`6f36984`）。
