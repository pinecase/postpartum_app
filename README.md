# 月子中心护理记录系统

面向月子中心医护人员（护士、护士长、月嫂、医生）的母婴护理 tracking 应用：记录在住产妇与新生儿的日常护理数据，自动进行异常预警，支持护理任务与交接班管理。

## 功能

- **总览看板**：按房间展示在住母婴、今日喂养/尿布次数、最近体征，60 秒自动刷新
- **异常预警**（自动计算，简化临床阈值，供护理参考）
  - 宝宝：体温 ≥37.5°C / <36.0°C、黄疸 ≥12（关注）/ ≥15 mg/dL（预警）、体重较出生下降 ≥10%、超 4 小时未记录喂养、24 小时无排便
  - 产妇：发热 ≥38°C、血压 ≥140/90、恶露量多、情绪评分 ≤2、疼痛评分 ≥7
- **宝宝详情**：喂养（母乳亲喂/瓶喂/配方奶）、大小便、体征测量（体温/体重/黄疸/心率/呼吸）、护理项目（洗澡/抚触/脐部护理等），附体重、黄疸、体温、每日奶量趋势图
- **产妇详情**：查房记录（体温/血压/脉搏/恶露/伤口/乳房/情绪/疼痛评分），体温与血压趋势图，办理离所
- **护理任务**：按母婴对象创建待办（如复测黄疸、切口换药），一键完成并记录执行人
- **交接班**：白班/夜班交接记录
- **入住管理**：产妇 + 随行宝宝（支持双胞胎）一次登记，在住/已离所列表
- **记录人**：页头选择当前记录人，所有记录自动署名
- **拍照附件**：所有护理/查房记录可随附照片（每条最多 3 张）。手机浏览器直接唤起相机（需授权相机权限），客户端自动压缩（最长边 1280px JPEG，约 100-300KB/张）后存入数据库；表格中显示 📷 角标，点击查看大图
- **多语言**：中文 / English / Bahasa Melayu，页头切换，首次访问按浏览器语言自动选择
- **邮箱登录（v2.6）**：首次打开引导创建管理员账号；之后所有人用邮箱+密码登录（有效期 30 天）。原 PIN 访问码保留为共用兜底入口
- **会员管理（v2.6）**：管理后台 → 会员管理。管理员可添加成员账号、重置密码、设/撤管理员、停用/启用；系统保证至少保留一名管理员
- **自动双备份（v2.6）**：GitHub Actions 每天（马来西亚时间凌晨 3 点）自动导出 D1 数据库两份——① Actions 附件（留 90 天）② 仓库 `backups` 分支（留最近 60 份）。Cloudflare D1 自带 Time Travel 还能回滚最近 30 天任意时间点，等于第三重保险。需要配置与部署相同的 `CLOUDFLARE_API_TOKEN` Secret
- **手机 App（PWA）**：手机浏览器打开网址 → 菜单选「添加到主屏幕」（iPhone Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 安装应用/添加到主屏幕），即以全屏 App 形式使用，带图标

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
