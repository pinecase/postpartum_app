# 月子中心护理记录系统

面向月子中心医护人员（护士、护士长、月嫂、医生）的母婴护理 tracking 应用：记录在住产妇与新生儿的日常护理数据，自动进行异常预警，支持护理任务与交接班管理。

## 功能

- **总览看板**：按房间展示在住母婴、今日喂养/尿布次数、最近体征，60 秒自动刷新
- **异常预警**（自动计算，简化临床阈值，供护理参考）
  - 宝宝：体温 ≥37.5°C / <36.0°C、黄疸 ≥12（关注）/ ≥15 mg/dL（预警）、体重较出生下降 ≥10%、超 4 小时未记录喂养、24 小时无排便
  - 产妇：发热 ≥38°C、血压 ≥140/90、恶露量多、情绪评分 ≤2、疼痛评分 ≥7
- **宝宝详情**：喂养（母乳亲喂/瓶喂/配方奶）、大小便、体征测量（体温/体重/黄疸/心率/呼吸）、护理项目（洗澡/抚触/脐部护理等），附体重、黄疸、体温、每日奶量趋势图
- **需求识别**：录入宝宝的哭声特征（参考 Dunstan 哭声分型）、表情/微表情、动作行为、身体皮肤征象与体温/室温/湿度，系统结合喂养、大小便等护理记录自动推断宝宝最可能的需求（饿了/困了/要拍嗝/胀气肚子疼/换尿布/太热/太冷/不舒服/求抱抱/受惊/想玩耍/无聊/满足），给出可能性排序、判断依据与护理建议；体温异常或尖锐哭叫会额外提示人工关注。推断引擎为 `shared/needs-engine.js`（Express 与 Workers 共用的启发式规则，仅供护理参考）
- **产妇详情**：查房记录（体温/血压/脉搏/恶露/伤口/乳房/情绪/疼痛评分），体温与血压趋势图，办理离所
- **护理任务**：按母婴对象创建待办（如复测黄疸、切口换药），一键完成并记录执行人
- **交接班**：白班/夜班交接记录
- **入住管理**：产妇 + 随行宝宝（支持双胞胎）一次登记，在住/已离所列表
- **记录人**：页头选择当前记录人，所有记录自动署名
- **拍照附件**：所有护理/查房记录可随附照片（每条最多 3 张）。手机浏览器直接唤起相机（需授权相机权限），客户端自动压缩（最长边 1280px JPEG，约 100-300KB/张）后存入数据库；表格中显示 📷 角标，点击查看大图
- **多语言**：中文 / English / Bahasa Melayu，页头切换，首次访问按浏览器语言自动选择

## 技术栈

- 后端（本地开发）：Node.js + Express + SQLite（better-sqlite3）
- 后端（Cloudflare 部署）：Cloudflare Workers + Hono + D1，与 Express 版行为一致
- 前端：React 18 + TypeScript + Vite + React Router + Recharts
- 表结构共用 `db/schema.sql`，演示数据共用 `db/seed-statements.mjs`

## 快速开始

```bash
npm install          # 安装全部依赖（workspaces）
npm run seed         # 生成演示数据（3 位产妇、4 名宝宝及护理记录）
npm run build        # 构建前端
npm run start        # 启动服务，访问 http://localhost:3000
```

开发模式（前端热更新，Vite 代理 /api 到 3000 端口）：

```bash
npm run dev          # 同时启动 server(3000) 与 client(5173)
```

数据库文件默认在 `server/data/care.db`（可用环境变量 `DB_PATH` 覆盖）；重建演示数据：`FORCE_SEED=1 npm run seed`。

> 本地 SQLite 启动时会自动执行 `db/schema.sql`（`CREATE TABLE IF NOT EXISTS`），新增表（如需求识别的 `baby_observations`）无需手动迁移；已部署的 D1 数据库需重跑一次 `npm run cf:db:schema`。

## 部署到 Cloudflare（Workers + D1）

免费套餐即可：Workers 每天 10 万请求，D1 5GB 存储。

```bash
# 1. 登录 Cloudflare（会打开浏览器授权）
npx wrangler login

# 2. 创建 D1 数据库，把输出的 database_id 填进 wrangler.jsonc
npx wrangler d1 create postpartum-care

# 3. 初始化表结构
npm run cf:db:schema

# 4.（可选）导入演示数据
npm run cf:db:seed

# 5. 构建并部署，完成后输出 https://postpartum-care.<你的子域>.workers.dev
npm run cf:deploy
```

本地模拟 Cloudflare 环境调试：

```bash
npx wrangler d1 execute postpartum-care --local --file=./db/schema.sql
npx wrangler d1 execute postpartum-care --local --file=./db/seed.sql   # 可选
npm run build && npm run cf:dev    # http://localhost:8787
```

### ⚠️ 访问控制（部署到公网前必读）

应用本身没有登录功能，直接公网可访问意味着任何人都能查看母婴健康数据。强烈建议用 **Cloudflare Access**（Zero Trust，50 用户内免费）加一层邮箱验证：

1. Cloudflare 控制台 → Zero Trust → Access → Applications → Add an application → Self-hosted
2. 域名填你的 `*.workers.dev` 地址（或自定义域名）
3. 策略里只允许医护人员的邮箱地址（或邮箱后缀）登录

配置后员工首次访问会收到邮箱验证码，通过后才能进入系统，无需修改任何代码。

## 说明

预警阈值为简化的参考值，不能替代医嘱与临床判断；异常情况请遵循机构流程联系医生。
