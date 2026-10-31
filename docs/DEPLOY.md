# 部署指南 · 赵佳杰个人空间

纯静态单页应用（SPA），**零构建、零服务端**：所有文件原样上传即可运行。
路由采用 **hash 路由**（`#/home`、`#/projects`…），不依赖服务端 rewrite，任何静态托管都能直接跑。

---

## 0. 站点基本信息

| 项 | 值 |
|---|---|
| 入口文件 | `index.html`（小写，托管平台自动识别） |
| 总体积 | **约 37 MB**（其中视频 35 MB，代码+样式 < 170 KB） |
| 构建命令 | **无**（不需要 npm install / build，源码即产物） |
| 资源路径 | 全部为**相对路径**（`assets/…`、`css/…`、`js/…`），子目录部署也安全 |
| 路由方式 | hash 路由（`/#/projects`），无 404 风险 |
| 最大单文件 | `assets/videos/robocup.mp4` ≈ 14 MB（低于 GitHub 100 MB 限制） |

本地预览（ES Module 需要 HTTP 环境，双击 html 打不开）：

```bash
cd 项目目录
python -m http.server 8000        # 或 npx serve .
# 浏览器打开 http://127.0.0.1:8000/
```

---

## 1. GitHub Pages 部署

### 步骤

```bash
cd 项目目录                       # 简历个人空间/
git init
git add -A
git commit -m "个人空间静态站"

# 在 GitHub 新建空仓库（例如 my-space），然后：
git remote add origin https://github.com/<你的用户名>/my-space.git
git branch -M main
git push -u origin main
```

推送后：**仓库 Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main` / 目录选 `/ (root)` → Save**。
约 1 分钟后可访问：

```
https://<你的用户名>.github.io/my-space/
```

### 配置项

- 仓库已含 `.nojekyll`：跳过 Jekyll 处理，保证路径原样发布（必须保留）。
- 自定义域名（可选）：Settings → Pages → Custom domain，并在 DNS 加 CNAME 记录。

### 注意事项

- **单文件 100 MB 上限**：原始素材中「智能药房小车.mp4」有 397 MB，已压缩至 6.6 MB 入库；**切勿把原视频提交进仓库**。
- 仓库软上限 1 GB：当前 37 MB，余量充足。
- 国内访问 GitHub Pages 可能较慢/偶发打不开，微信内分享建议用艾可秀（见下）。
- 更新内容：改文件 → `git add -A && git commit -m "更新" && git push`，Pages 自动重新发布。

---

## 2. 艾可秀（AxureShow.com）部署

国内静态 HTML 托管，免备案、免 Git，拖拽即发布，国内访问快，适合微信/QQ 内分享。

### 步骤

1. 打开 <https://www.axureshow.com/>，手机号/微信登录。
2. 进入「项目管理」→「上传新项目」。
3. 将**整个项目文件夹拖入上传区**（或先打包成 ZIP 再上传）：
   - 平台自动识别 `index.html` 为入口；
   - `css/`、`js/`、`assets/` 保持目录结构原样上传即可，相对路径自动适配。
4. 等待解析完成，平台自动生成**公网链接 + 二维码**，复制链接即可分享。

### 注意事项

- 若平台对单项目体积有限制，37 MB 中 35 MB 是视频；可先在 `js/config.js` 中把暂不展示的视频条目删掉（文件不必删），或只保留重点项目视频再上传。
- 后续更新：重新上传覆盖即可，原链接不变。
- 平台支持访问密码/有效期设置（可选）。

---

## 3. 部署后：更新二维码指向

页面右下角「▦」按钮弹出的二维码，地址解析优先级：

```
localStorage('zjj_site_url')  >  js/config.js 的 SITE.url  >  当前访问地址
```

**推荐做法（长期生效）**：部署拿到最终地址后，改 `js/config.js` 一处并重新上传/推送：

```js
export const SITE = {
  url: 'https://<你的用户名>.github.io/my-space/',   // ← 改成你的最终地址
  ...
};
```

**临时做法（只影响本机浏览器）**：打开页面 → 点「▦」→ 粘贴新地址 →「设为默认地址」。

---

## 4. 第三方依赖清单

| 依赖 | 用途 | 形式 | 是否需你安装 |
|---|---|---|---|
| `qrcode-generator` (kazuhikoarase) | 生成分享二维码 | 已内嵌为 `js/vendor/qrcode.js`（单文件，MIT） | **不需要**，已随站点发布 |
| ffmpeg | 压缩视频/抽封面帧 | 开发期一次性使用（npm `ffmpeg-static`） | 不需要，素材已处理好 |
| pdfjs-dist | 开发期提取简历 PDF 文本 | 开发期一次性使用 | 不需要 |

运行时（浏览器端）除 `js/vendor/qrcode.js` 外**无任何第三方库**，无 CDN 引用，完全离线可用；
粒子背景、滚动动画、音效（Web Audio 合成）、打字机等均为原生实现。

---

## 5. 如何扩展（与 js/config.js 注释呼应）

| 需求 | 改动 |
|---|---|
| 新增项目卡片 | `config.js` → `PROJECTS` push 一个对象（含 video/poster/tech 等字段） |
| 新增演示视频 | `config.js` → `GALLERY` push；视频放 `assets/videos/`，封面放 `assets/posters/` |
| 新增经历/荣誉/技能组 | `config.js` → `TIMELINE` / `HONORS` / `SKILLS` push |
| 新增整页模块 | ① config 注册数据 ② `js/components/` 新建渲染函数 ③ `index.html` 加 `<section id>` ④ `core/router.js` 的 `ROUTES` 登记 ⑤ `main.js` 调用渲染 |
| 换头像 | 覆盖 `assets/img/avatar.png`（同名即可） |
| 改 Slogan | `config.js` → `PROFILE.slogans` 数组 |
