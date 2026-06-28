# 抖音自动化工具 — 项目骨架

Electron + Playwright 桌面应用。主进程拥有完整文件系统权限（读视频文件夹、按商品编号归档到 `success/` / `error/`），用 Playwright 驱动独立 Chromium 自动登录、上传视频、填表发布。Mac 上开发与测试，打包输出 Windows `.exe`。

## 目录结构

```
douyin-tool/
├─ src/
│  ├─ main/                # 主进程（Node 全权限）
│  │  ├─ index.js          # 应用入口、窗口、IPC 注册
│  │  ├─ db.js             # better-sqlite3 账号/任务表
│  │  ├─ files.js          # 读文件夹、解析商品编号、success/error 归档
│  │  ├─ publish.js        # 关联逻辑（账号↔视频）+ 调度自动发布
│  │  ├─ automation.js     # Playwright 启动 Chromium、上传、填表、发布
│  │  └─ selectors.json    # 抖音页面选择器（可配置，避免硬编码）
│  ├─ preload/index.js     # 安全桥接，渲染进程经 window.api 调用主进程
│  └─ renderer/src/        # Vue 3 界面
│     ├─ App.vue           # 布局：侧边栏 + 顶栏 + 页面切换
│     ├─ main.js / styles.css / nav.js / toast.js
│     └─ pages/            # Dashboard / Accounts / Publish / PublishList / Placeholder
├─ electron.vite.config.mjs
├─ electron-builder.yml    # 打包配置（win / mac）
└─ .github/workflows/build-win.yml  # GitHub 上原生构建 .exe
```

## 你需要准备什么

| 项 | 说明 | 必须 |
|----|------|:--:|
| Node.js 20 LTS | 含 npm，[nodejs.org](https://nodejs.org) 下 LTS | ✅ |
| Xcode Command Line Tools | Mac 编译 better-sqlite3 原生模块：`xcode-select --install` | ✅ |
| Git + GitHub 账号 | 用 GitHub Actions 免费构建 Windows `.exe`（推荐，无需自己有 Windows 机器） | 推荐 |
| Windows 10/11 机器或虚拟机 | 备选打包方式：本地原生 `npm run build:win` | 可选 |
| 测试抖音账号 + 测试视频 | 联调真实上传/发布（King 提供） | 真机测试时 |
| 每账号代理 IP | 多账号隔离时配（单/少账号可先不配） | 可选 |

> **关键提醒**：本项目用了原生模块 `better-sqlite3`，它必须针对目标系统编译。**直接在 Mac 上交叉编译出 Windows `.exe` 很不可靠**（需 Wine + 工具链，常失败）。因此推荐：日常在 Mac 开发测试，**`.exe` 交给 GitHub Actions 的 Windows 机器构建**（见下），或在一台 Windows 机器/虚拟机上构建。

## Mac 上开发 & 测试

```bash
cd douyin-tool
npm install                 # 安装依赖（postinstall 会自动装 Chromium）
npm run dev                 # 启动应用（热重载）
```

启动后即可：选视频文件夹 → 勾账号 → 设日发布总数 →「开始关联」（真实移动文件到 `success/` / `error/`）。勾选"立即自动发布"会用 Playwright 打开 Chromium 走上传发布流程（首次需人工扫码登录，登录态会持久化复用）。

> 测试关联流程时，往一个文件夹丢几个形如 `商品123-1.mp4`、`商品456.mp4` 的视频，再放一个非视频文件（如 `说明.txt`）观察它被移入 `error/`。

## 快速测试自动化（不碰真实抖音）

真实抖音页面需要登录、有风控、不能拿来反复测。项目内置一个**本地假发布页**（`mock/creator-post.html`，选择器跟真页面对齐），用 MOCK 模式即可在 Mac 上跑通整条自动化：

```bash
npm run dev:mock        # = DOUYIN_MOCK=1 electron-vite dev
```

然后到「发布列表」点任意一行的 **发布**，会看到：

1. 弹出一个独立 Chromium 窗口（该账号专属 Profile）
2. 打开本地假发布页 → `setInputFiles` 注入视频（真实 `E:\` 路径在 Mac 不存在时，自动改用 `mock/sample.mp4`）
3. 显示「上传成功」→ 自动填标题、追加话题 → 点「发布作品」→ 显示「发布成功」
4. 右下角日志抽屉同步打印每一步

这样**编排逻辑、文件上传、填表、状态检测**全部验证到位，唯一没验证的是真实页面的选择器——那部分等对照线上 `creator.douyin.com` 校准 `selectors.json` 即可，编排代码不用动。

> 普通 `npm run dev` 则指向真实抖音页面（需要先登录、谨慎使用）。
> Windows 上跑 mock 需要把 `dev:mock` 改为 `set DOUYIN_MOCK=1&& electron-vite dev` 或装 `cross-env`。

## 打包成 Windows .exe

### 方式 A：GitHub Actions（推荐，Mac 用户首选）

1. 把 `douyin-tool` 推到一个 GitHub 仓库
2. 仓库 **Actions** 页 → 选 *Build Windows EXE* → **Run workflow**
   （或打 `git tag v0.1.0 && git push --tags` 自动触发）
3. 跑完在该次运行的 **Artifacts** 里下载 `douyin-auto-win`（含 `.exe`）

Windows 机器原生构建，自动解决 `better-sqlite3` 编译和 Chromium 下载，最省心。

### 方式 B：本地 Windows 机器/虚拟机

```bash
npm install
# 关键：必须设 PLAYWRIGHT_BROWSERS_PATH=0，让 Chromium 内核装进 node_modules 随包打进 exe，
# 否则用户机器上会报 "Executable doesn't exist at ...ms-playwright\chromium-xxxx\chrome.exe"。
# PowerShell:  $env:PLAYWRIGHT_BROWSERS_PATH="0"
# CMD:         set PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
npm run build:win           # 产物在 release/
```

> CI（方式 A）已在 workflow 里设好该变量，无需手动操作。

## 待补全（需 King 提供后落地）

- `selectors.json` 里的选择器为占位/最佳猜测，需对照线上创作者中心真实页面校准
- 商品绑定（`productId`）的页面流程与选择器
- 登录授权回调、发布/投流接口文档、联调账号与视频
- ~~Playwright 浏览器在打包产物中的内置策略~~ 已解决：用 `PLAYWRIGHT_BROWSERS_PATH=0` 随包内置 Chromium

## 技术栈

Electron · Playwright(+extra/stealth 反检测) · Vue 3 + Vite · better-sqlite3 · electron-builder
