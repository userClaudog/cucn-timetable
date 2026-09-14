# 南传课表 → 手机日历 + 课程查看前端

把正方教务系统的课表同步到手机日历（iOS 订阅，自动更新），并提供一个网页查看**本周 / 非本周 / 全部课程**。

## 工作原理

```
教务课表页（你已登录）
  └─ 油猴脚本「南传课表导出」v4.2+
       ├─ 下载 kechengbiao.ics   → 上传仓库 → 手机日历订阅（自动同步）
       └─ 下载 courses.json      → node update.mjs → data.js → 前端展示
```

- 抓取不用重新登录：油猴脚本跑在浏览器里，登录态由浏览器维持（这也是不用 GitHub Actions 自动登录的原因——正方有验证码，服务器端自动登录不可行）。
- 课表更新后：重新导出 → 上传 → 手机日历 12 小时内自动同步（ICS 里写了 `REFRESH-INTERVAL:PT12H`），前端立刻更新。

## 文件说明

- `index.html` — 前端页面（纯静态，无构建步骤，双击即可本地打开）
- `data.js` — 课表数据（自动生成，请勿手改；当前是**示例数据**，带 `_sample` 标记）
- `courses.json` — 油猴脚本导出的原始数据（update.mjs 的输入）
- `kechengbiao.ics` — 日历文件（手机订阅源）
- `update.mjs` — 一键更新脚本（Node 18+，无依赖）

## 首次部署（只做一次）

### 1. 准备 GitHub 仓库

1. 在 GitHub 新建仓库，例如 `cucn-timetable`（可以选 Private，Cloudflare Pages 也能访问私有仓库）。
2. 在本目录执行：

```powershell
git init
git add -A
git commit -m "课表系统初版"
git branch -M main
git remote add origin https://github.com/<你的用户名>/cucn-timetable.git
git push -u origin main
```

### 2. 部署到 Cloudflare Pages（推荐：国内访问比 GitHub Pages 快）

1. 注册/登录 [Cloudflare](https://dash.cloudflare.com/)（免费）。
2. 左侧进入 **Workers & Pages → Create → Pages → Connect to Git**。
3. 选择 GitHub 账号 → 选 `cucn-timetable` 仓库 → Begin setup。
4. 构建配置：Framework preset 选 **None**，Build command 留空，Output directory 填 `/`（根目录）→ **Save and Deploy**。
5. 部署完成后你会得到域名：`https://cucn-timetable-xxxx.pages.dev`。

以后每次 `git push`，Pages 自动重新部署，无需任何额外操作。

### 3. 手机（iOS）订阅日历

1. 打开 **设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历**。
2. 粘贴订阅地址（注意是 `.ics` 文件的完整网址）：

```
https://cucn-timetable-xxxx.pages.dev/kechengbiao.ics
```

3. 保存后打开「日历」App，底部「日历」里勾选「南京传媒学院课表」即可显示。

注意事项：

- iOS 订阅日历**不能手动刷新**，按 ICS 里的 `REFRESH-INTERVAL`（12 小时）自动同步；想立刻刷新可以删除订阅再重新添加。
- 订阅的是**云端文件**，本地改动不会生效——每次课表更新都要走「导出 → 上传 → push」流程。
- 若换设备，同样的 URL 再订阅一次即可。

## 课表更新流程（每次 2 分钟）

1. 打开教务系统课表页（登录态在浏览器里，不用重新登录），点右下角「课表」面板：
   - 点「1. 抓取课表」，确认预览里的课程数对；
   - 点「2. 下载 .ics」→ 得到 `kechengbiao.ics`；
   - 点「下载 courses.json」→ 得到 `courses.json`。
2. 把这两个文件放进本目录（覆盖旧的）。
3. 在本目录运行：

```powershell
node update.mjs --push
```

脚本会：校验数据 → 重新生成 `data.js` → 打印摘要（课程数、周次覆盖、ICS 节数）→ git 提交并推送。
推送后：前端自动更新；手机日历 12 小时内自动同步。

> 不想用命令行的话，也可以直接在 GitHub 网页上传 `data.js`、`kechengbiao.ics` 两个文件。
> 但注意 `data.js` 要用 `node update.mjs` 生成，不能直接传 `courses.json`。

## 前端使用

- 时间轴式周课表：按星期分组，每节课是一个彩色块，纵向位置对应真实起止时间，块与块之间的空隙就是课间真实间隔（间隔 ≥ 40 分钟时直接标出「间隔 X小时X分」）。
- 课程块颜色按课程名自动分配（同一门课始终同色）；块内显示课程名、起止时间、节次、地点、老师。
- 「今天」所在星期标有绿色标签；当天没课时头部会显示「没课 🎉」。
- 顶部下拉可跳转任意一周；直达链接支持 `?week=3`。
- 本地预览：双击 `index.html`（也可用 `?date=2026-09-13` 模拟任意一天）。

## 常见问题

### 抓取失败 / 课程解析不全

1. 确认脚本版本 ≥ 4.2.0（面板里的诊断信息会带上版本号）。
2. 在面板展开「诊断信息」→「复制诊断信息」，发给帮你维护脚本的人；里面包含页面表格结构和每格的解析结果，能直接定位。
3. 常见原因：教务页面改版（表格 id 变了）、作息表里缺某些节次（面板里补上）、周次写法特殊。

### 下载 .ics 时提示「0 节课时」

说明课程解析出来了但**周次或节次没对上**——不要上传这个空文件。看诊断信息里「跳过无周次 N 条、无作息时间 N 条」。

### update.mjs 提示「周次解析不出来」

courses.json 里某门课的 `zcd` 字段格式特殊。把该课的 zcd 内容发出来，扩充解析规则即可。

### 手机日历不更新

- 检查订阅 URL 是否返回最新内容（浏览器打开 `.../kechengbiao.ics` 看修改时间）。
- iOS 订阅刷新最长可能拖到 24 小时；急用就删掉订阅重新添加。

### 备选托管

- **GitHub Pages**：仓库 Settings → Pages → Deploy from a branch → main / root。国内访问慢一点，但能用。
- **jsDelivr 加速订阅**（只加速 ICS，不托管前端）：`https://cdn.jsdelivr.net/gh/<用户名>/cucn-timetable@main/kechengbiao.ics`（缓存最长 12 小时，与手机刷新频率匹配）。

## 安全与隐私

- 仓库如果含课程信息，建议 Private；Cloudflare Pages 绑私有仓库需要授权，部署后的 `.pages.dev` 链接任何人都能打开（但地址随机，别人不知道）。
- 不要在任何自动化里存放教务系统密码；抓取始终在你自己登录的浏览器里进行。
