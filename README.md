# dsh-pet-sayaka 🎴

[![npm](https://img.shields.io/npm/v/dsh-pet-sayaka?color=blue)](https://www.npmjs.com/package/dsh-pet-sayaka)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **English summary** — Sayaka Miki desktop pet for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI. Live session state is mapped onto eight sprites (idle sleep, sword while shell tools run, sad on failure, happy on success, thinking, calm, shy when poked, angry after five pokes in ten seconds); sprites swap instantly with no cross-fade; and a short per-state voice line plays every 8–15 encounters with that state, plus a one-time "good morning" line after the app starts.

美树沙耶香桌宠，住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 界面右下角。
她把 DSH 的会话状态翻译成表情：**没事就睡觉，跑代码拔刀，出错伤心，成功高兴。**

```
没事        → 睡觉      sayaka-睡觉    （常驻，直到有事发生）
模型思考中  → 思考      sayaka-思考    （一个回合开始到结束之间；跑代码时会被拔刀盖住）
跑代码      → 拔刀      sayaka-拔刀    （bash / pwsh 等命令类工具调用期间）
跑失败      → 伤心 5 秒  sayaka-伤心    （非零退出、isError、超时、被杀、整轮报错）
跑成功      → 高兴 5 秒  sayaka-高兴    （命令正常结束）
第一次跑完 之后的一分钟 → 平常心        sayaka-平常心 → 一分钟到 → 睡觉
被点一下    → 害羞 1 秒  sayaka-害羞    （本地互动，覆盖上面的状态）
十秒点五下  → 生气 3 秒  sayaka-生气    （本地互动，优先级最高）
```

另外她会**冒独白气泡**：云朵形状，每个状态**刚切换时冒 1 秒**。

| 状态 | 台词 |
|---|---|
| 思考 | emmmmm |
| 睡觉 | （不说） |
| 害羞 | 不要这样啦 |
| 拔刀 | 武装保卫见泷原！ |
| 伤心 | 呜呜呜 |
| 生气 | 我生气了！！！ |
| 高兴 | 耶✌️ |
| 平常心 | 快来吧 |

> 云朵是照着那张云图**描摹出来的 SVG path**（不是位图），文字按字数自动缩放塞在云肚子里，
> 尾巴尖永远对着她的头顶。睡觉 / 平常心这类长状态不会一直挂着字 —— 只在切换那一秒冒出来。

## 配音

每个状态都有一段录音（`assets/pet/<state>.wav`），跟着状态播放：

| 播报 | 文件 | 什么时候播 |
|---|---|---|
| 早上好 | `morning.wav` | 每次**启动**后说第一句（刷新页面不重播；浏览器拦住自动播放时，会在你第一次点/按键时补上） |
| 拔刀 | `sword.wav` | 每攒够 8~15 次「拔刀」播一次 |
| 高兴 | `happy.wav` | 每攒够 8~15 次「高兴」播一次 |
| 害羞 | `shy.wav` | 每攒够 8~15 次「害羞」播一次 |
| 伤心 | `sad.wav` | 每攒够 8~15 次「伤心」播一次 |
| 思考 | `thinking.wav` | 每攒够 8~15 次「思考」播一次 |
| 生气 | `angry.wav` | 每攒够 8~15 次「生气」播一次 |
| 睡觉 | `sleep.wav` | 每攒够 8~15 次「睡觉」播一次 |

「攒够几次」是**每个状态各记一份**：每进入该状态 +1，够数就播一次、清零，
然后重新掷一个 8~15 的随机间隔。平常心没有录音（她平常不说话）。
DSH 设置页 **sayaka** 分区里的「配音」开关能一键关掉声音。

---

## 安装

```bash
# 从 npm（推荐）
dsh plugin --profile web add dsh-pet-sayaka

# 或者直接从 GitHub 装
dsh plugin --profile web add github:KOGGUA-EDIT/dsh-pet-sayaka
```

装完重启一次 Web 服务（DSH 标题栏「⋯」→ 重启 Web 服务），刷新页面就能在右下角看到她。

## 安装状态（本机）

已经装好了，装在 **`web-desktop` profile** 上：

| 项 | 值 |
|---|---|
| 插件源码 | `D:\app edit\sayaka\dsh-pet-sayaka`（就是本目录） |
| 安装方式 | `link:` 软链 → `~/.dsh/profiles/web-desktop/node_modules/dsh-pet-sayaka` |
| profile 依赖 | `~/.dsh/profiles/web-desktop/package.json` 的 `dependencies` + `dsh.profile.bundles` |

改完源码（或在设置面板里改过偏好后想重来），需要**重启一次 Web 服务**才生效：
DSH Desktop 标题栏「⋯」菜单 → **重启 Web 服务**（不关应用）。装/卸载插件也是同一个流程。

> 为什么必须重启：浏览器插件的清单（哪些插件有前端 bundle）是 Web 服务启动时扫出来的，
> 页面加载时从服务端拿这份清单。重启后刷新页面即可看到桌宠。

## 卸载

```bash
# 用 DSH Desktop 自带的 CLI（不在 PATH 上，所以写全路径）
NODE="$LOCALAPPDATA/Deepseek Harness EAC/dsh-desktop/vendor/node/node.exe"
BIN="$LOCALAPPDATA/Deepseek Harness EAC/dsh-desktop/node_modules/@deepseek-ai/dsh/lib/bin.js"
"$NODE" --use-system-ca "$BIN" plugin --profile web-desktop remove dsh-pet-sayaka
```

然后重启 Web 服务。手工等价操作：删掉 `~/.dsh/profiles/web-desktop/package.json` 里
`dependencies.dsh-pet-sayaka` 和 `dsh.profile.bundles` 里的 `dsh-pet-sayaka`，
再删掉 `~/.dsh/profiles/web-desktop/node_modules/dsh-pet-sayaka` 这个软链。

## 重装 DSH / 换机器 / 备份

**插件源码不在 DSH 里** —— 它在 `D:\app edit\sayaka\dsh-pet-sayaka`，是以 `link:` 方式接进 profile 的。
所以重装 DSH 只需要恢复「接线」，代码和素材一个字节都不会丢。

### 卸载 / 重装之前

1. **别删 `C:\Users\koggua\.dsh`**（这就是 DSH_HOME：会话、profile、凭证、插件接线全在里面）。
   卸载器如果问「是否删除用户数据」→ 选**保留**；拿不准就整个复制一份（约 130MB）。
2. 想连桌宠的显示设置一起留着，把 `%APPDATA%\Deepseek Harness EAC\settings.json` 也留着 ——
   里面的 `webPort` 决定端口，端口不变，浏览器 `localStorage` 里的大小/开关/位置就对得上。
3. 源码目录想更保险就整个复制 `D:\app edit\sayaka`（约 700KB）。

### 重装之后

先自检（只读，不改任何东西）：

```bash
node "D:\app edit\sayaka\dsh-pet-sayaka\tools\install.mjs" --status
```

- 显示**接线完整**：什么都不用做，启动 DSH 后重启一次 Web 服务即可。
- 显示**接线不完整**（profile 被重建了）：一条命令补回来 ——

```bash
node "D:\app edit\sayaka\dsh-pet-sayaka\tools\install.mjs"
```

  它做三件事（幂等，重复跑没事）：写 `dependencies`、把 `dsh-pet-sayaka` 加进 `dsh.profile.bundles`、
  在 profile 的 `node_modules` 里建一个指向本目录的 junction。然后重启 Web 服务。

摘掉接线（源码保留）：

```bash
node "D:\app edit\sayaka\dsh-pet-sayaka\tools\install.mjs" --uninstall
```

### 换 profile / 换机器

- 换 profile：加 `--profile <名字>`（默认 `web-desktop`）。
- 换机器：把 `dsh-pet-sayaka` 整个拷过去，跑 `install.mjs` 时用 `--home <DSH_HOME>` 指到新机器的家目录。
- 大版本升级后如果桌宠不出现：先跑 `--status` 确认接线；再看新版本是否还提供 `shell.overlay` / `settings.section` 这两个槽位
  （Dsh 换 API 时插件要跟着改，`lib/client.js` 顶部的注释里写了依赖的槽位名）。

## 配置

改 `~/.dsh/profiles/web-desktop/cordis.patch.yml` 里 `dsh-pet-sayaka` 那一行的 `config`（改完重启 Web 服务）。
默认值（也就是本目录 `cordis.patch.yml` 里写的那份）：

| 配置 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 关掉后宿主不再推送状态 |
| `size` | `280` | 展示高度（CSS px）；浏览器端设置面板里还能单独再调 |
| `sadMs` | `5000` | 伤心时长 |
| `happyMs` | `5000` | 高兴时长 |
| `calmMs` | `60000` | 第一次跑完代码后「平常心」持续多久 |
| `shyMs` | `1000` | 被点一下的害羞时长 |
| `clickThreshold` / `clickWindowMs` | `5` / `10000` | 十秒内点够五下 → 生气 |
| `angryMs` | `3000` | 生气时长 |
| `includeSubagents` | `true` | 是否跟随子 Agent 的活动 |
| `runToolPattern` | `^(bash\|pwsh\|powershell\|shell\|sh\|cmd\|zsh\|fish\|exec\|command\|terminal\|run)$` | 哪些工具算「跑代码」，命中就拔刀 |
| `monologueMs` | `1000` | 独白气泡出现多久（毫秒） |
| `monologues` | 见上表 | 各状态台词；**逐键合并** —— 只写想改的几句就行，空字符串表示不说话 |

浏览器端（大小百分比、显示开关、拖拽位置）存在 `localStorage`：`dsh-pet-sayaka:settings:v1` / `:pos:v1`，在 DSH 设置页的 **sayaka** 分区里调。

## 交互

- **拖拽**：按住她拖到任意位置（位置按窗口比例存，窗口缩放后还在原地）
- **点一下**：害羞 1 秒
- **十秒内点五下**：生气 3 秒
- **设置**：全在 DSH 设置页里 —— 侧栏「设置」→ 左栏选 **sayaka**（见下节）。
  桌宠身上**不再挂设置面板和关闭键**，界面保持干净。

## DSH 设置页里的「sayaka」分区

侧栏「设置」→ 左栏里的 **sayaka**，里面四样东西：

| 控件 | 作用 |
|---|---|
| 会呼吸的预览 | 实时显示她当前的状态精灵与当前台词（跟着会话变） |
| 显示桌宠（开关） | 关掉 = 界面上的她消失；状态照常跟随会话，随时开回来 |
| 配音（开关） | 关掉 = 不出声（表情照常动） |
| 大小（0–200%） | 相对宿主配置里 `size`（默认 280px）的百分比：0% = 看不见，200% = 两倍大 |

这几项存在浏览器本地（`localStorage: dsh-pet-sayaka:settings:v1`），改完**立刻生效、不用重启**，
只影响这台机器的这个浏览器。台词、时长、判定规则这类"行为"设置仍在 profile 的 `cordis.patch.yml` 里。

## 目录结构

```
dsh-pet-sayaka/
├── package.json          # 声明：main = 宿主半侧，exports["./client"] = 浏览器半侧，dsh.bundle.patch = 挂载行
├── cordis.patch.yml      # 挂载声明：往 DSH 配置树里插一行 dsh-pet-sayaka（config 也在这里）
├── lib/
│   ├── index.js          # 宿主半侧：听 session/event → 归纳成活动状态；提供 /sayaka 三个接口
│   └── client.js         # 浏览器半侧：悬浮桌宠（画状态、点击互动、拖拽、设置面板）
├── assets/pet/*.png      # 8 张精灵（784×720，同一画布，脚底对齐）
├── assets/pet/*.wav      # 8 段配音（morning / sword / happy / shy / sad / thinking / angry / sleep）
├── assets/pet/manifest.json  # 画布尺寸 + 精灵清单（由 build-assets.mjs 生成）
├── assets/pet/bubble.json    # 独白云朵的 SVG path（由 trace-bubble.mjs 描摹云图得到）
└── tools/
    ├── install.mjs       # 接线：装/卸/自检（重装 DSH 后用这个恢复）
    ├── build-assets.mjs  # 把原始素材归一化成 assets/pet（需要 sharp）
    ├── trace-bubble.mjs  # 把云朵图描摹成 SVG path → assets/pet/bubble.json（需要 sharp）
    ├── test-state.mjs    # 状态机自测（含真实事件信封夹具）
    └── test-routes.mjs   # HTTP 路由自测（含目录穿越、SSE 推送）
```

## 原理

**状态机放在宿主半侧**，因为浏览器侧拿不到稳定的会话事件 API，而宿主侧的 `session/event` 是稳定事件流
（`dsh-dafeiyu`、`dsh-agent-loop` 等官方/内置插件都用它）。好处是两个窗口打开同一页面时活动状态一致，
点击互动仍各自本地。

### 状态分层（越靠上优先级越高）

```
1. 有一行代码正在跑      → sword（拔刀）
2. 瞬时反应（伤心/高兴）  → 到点自动过期
3. 有回合正在跑          → thinking（思考）
4. 第一次跑完代码后的一分钟 → calm（平常心）
5. 其余                  → sleep（睡觉）
```

宿主在「下一个会自己过期的状态」到点时主动再推一帧，浏览器不用自己算时间。

### 「跑代码」和「跑失败」怎么判

- 思考 = `turn/start` 到 `turn/end` 之间（`step/start`、`assistant/chunk`、`assistant/message` 也会把思考点起来作兜底）；
  没收到 `turn/end` 的会话在销毁时会自动清掉，不会一直"思考"下去
- 跑代码 = `tool/call` 的工具名命中 `runToolPattern`（默认 bash/pwsh/shell/…）
- 跑失败 = 下面任意一条命中：
  - 结果里有结构化 `error`
  - 消息里 `isError: true`
  - 正文里带 `[exit code: N]`（N≠0）—— DSH 的 bash 工具把非零退出写进正文，而不是标成错误
  - 正文里带 `[timed out after …]` / `[killed by signal: …]`
- `turn/end` 的 `reason.kind` 不是 `completed`/`aborted`/`blocked`/`disposed`（比如 `error`、`max-tokens`）→ 也算有错误
- 用户主动中止（`aborted`）、等待批准（`blocked`）、正常结束（`completed`）→ 不给反应

### 独白气泡怎么画

气泡是**矢量的**，不是贴图：

1. `tools/trace-bubble.mjs` 读云朵图 → 取「纯白内部」的中心连通块 → 形态学膨胀（把 path 推到描边中线上）
   → Moore 邻域边界跟踪 → 按弧长均匀重采样 → Catmull-Rom 转三次贝塞尔；
2. 尾巴尖、最高点这些**极值点会被钉住**，并用直线段保住尖角（否则样条会把尾巴抹圆）；
3. 描摹时顺手算一个**最大内接矩形**（逐行取左右边界交集，枚举上下边找面积最大者，再内缩 8%），
   和 viewBox / path / 尾尖坐标 / 描边样式一起写进 `assets/pet/bubble.json`，宿主随状态快照下发；
4. 浏览器把 path 画成内联 SVG；文字就放在那个内接矩形里居中排版；
5. 字号先按「中文算 1 字宽、西文算 0.56」估一个起手值，**渲染完再用真实排版量一次**：
   `scrollWidth/clientWidth` 超了就按比例缩，最多迭代 5 次（还会等 80ms 再量一次，避开中文字体晚加载）。
   所以像 `emmmmm` 这种 m 特别宽的英文也不会撑破云朵 —— 实测会从估价 44px 自动收到 29px。
6. 气泡按尾尖坐标对齐 —— 尾巴尖永远指着她的头顶，位置和大小都跟着桌宠尺寸走。

描摹质量：与原图内部区域的交并比 IoU ≈ 0.97。想换云朵图就重跑一次（三个可调参数见脚本头部）。

### 消息信封的版本兼容

不同 DSH 版本 `tool/result` 的字段位置不一样，所以解析是「多路兜底」而不是死认一种形状：

| 字段 | 试的顺序 |
|---|---|
| callId | `message.source.callId` → `message.content[].toolCallId` → `message.callId` → `message.toolCallId` → `data.callId` |
| 触发关系 | `data.sourceEventSeqs[0]` 指回 `tool/call` 的 seq |
| 正文 | 递归走 `message.content`（兼容 `content[].content[].text` 这种多一层的老/新信封） |
| 兜底 | 该会话里只剩一个在跑的代码调用时，认领给它 |

## 排障

桌宠不动的时候，先看宿主侧到底收到了什么：

```bash
curl "http://127.0.0.1:14395/sayaka/state"
```

```jsonc
{
  "activity": "sleep",          // 当前活动
  "stats": {
    "events": 128,              // 收到过多少条会话事件 —— 0 说明事件流没接上
    "runs": 3,                  // 识别到几次「跑代码」—— 一直是 0 说明 runToolPattern 没匹配上工具名
    "turns": 5,                 // 收到几次 turn/start —— 有回合但没「思考」说明事件没接上
    "lastEventType": "tool/result",
    "firstRunAt": 1789407284885, // 第一次跑完代码的时间（平常心窗口的起点）
    "running": 0                // 当前还在跑的代码调用数；卡在 >0 就是「一直拔刀」
  }
}
```

其它入口：

- `GET /sayaka/state` 快照 · `GET /sayaka/stream` SSE 推送 · `GET /sayaka/asset/<state>.png` 精灵 · `/sayaka/asset/<state>.wav` 配音
- 状态名：`sleep` `thinking` `sword` `sad` `happy` `calm`（`shy` / `angry` 只在浏览器侧）
- 画布尺寸由 `assets/pet/manifest.json` 声明，宿主通过 `snapshot.canvas` 转给浏览器 —— 换素材后画布大小变了也不用改代码
- 页面里看不清就开 DevTools 看 `[dsh-pet-sayaka]` 相关报错；插件的 `<style>` 标签带 `data-plugin="dsh-pet-sayaka"`

## 换素材

原始素材尺寸不一（1254×1254 / 1024×1536 / 1672×941…），直接塞给浏览器会出现「状态切换时角色忽大忽小、上下跳」。
`tools/build-assets.mjs` 把每张图铺到同一张公共画布上（水平居中、**垂直贴底**），再等比缩到 784×720：

```bash
node tools/build-assets.mjs "D:/app edit/sayaka" "D:/app edit/sayaka/dsh-pet-sayaka/assets/pet"
```

需要 `sharp`（DSH Desktop 自带，脚本会自动去 `%LOCALAPPDATA%\Programs\Deepseek Harness EAC\resources\app\node_modules` 找，
也可以用 `DSH_APP_SHARP` 指定）。文件名对应关系写在脚本顶部的 `SOURCES` 表里。

## 自测

```bash
node tools/test-state.mjs    # 状态机 + 独白配置：80 条断言（含真实会话日志里的两种事件信封）
node tools/test-routes.mjs   # 路由 + 素材（精灵与配音）+ 气泡数据 + 文字框：61 条断言（快照 / 素材 / 防目录穿越 / SSE 推送与断开 / 到期自动推送）
```

## 已知边界

- 「第一次跑代码」是**进程级**的：重启 Web 服务后重新计一次（符合「这次启动的第一次跑代码」的直觉）。
  平常心窗口不因再次跑代码而延长 —— 窗口结束就回睡觉。
- 只有命令类工具算「跑代码」。读文件、改文件、搜索这些不算，桌宠继续睡觉；要改判就调 `runToolPattern`。
- 桌宠画在 Web 界面里（DSH 的 `shell.overlay` 覆盖层），不是独立桌面窗口。
- 「思考」按回合算（`turn/start` → `turn/end`），不是按"模型正在吐 token"算：
  回合里等工具返回、等批准期间也算思考。多会话并发时只要有一个回合在跑就一直思考。
