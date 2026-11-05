# dsh-pet-sayaka 🎴

[![npm](https://img.shields.io/npm/v/dsh-pet-sayaka?color=blue)](https://www.npmjs.com/package/dsh-pet-sayaka)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![release](https://img.shields.io/github/v/release/KOGGUA-EDIT/dsh-pet-sayaka?display_name=tag&sort=semver)](https://github.com/KOGGUA-EDIT/dsh-pet-sayaka/releases)

> **English summary** — Sayaka Miki desktop pet for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI. Live session state is mapped onto twelve sprites: idle sleep, sword while shell tools run, sad on failure, happy on success, thinking, calm, tired for five seconds whenever a whole turn finishes, shy when poked, angry after five pokes in ten seconds, furious after ten, quietly polishing her sword while idle, and hanging from the cursor while dragged. Sprites swap instantly with no cross-fade. A short per-state voice line plays every 5–8 encounters with that state, situational quips have their own recordings, and a one-time "good morning" line plays after the app starts.

美树沙耶香桌宠，住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 界面右下角。
她把 DSH 的会话状态翻译成表情：**没事就睡觉，跑代码拔刀，出错伤心，成功高兴。**

```
没事         → 睡觉        sayaka-睡觉    （常驻，直到有事发生；闲着会时不时擦剑）
模型思考中   → 思考        sayaka-思考    （一个回合开始到结束之间；跑代码时会被拔刀盖住）
跑代码       → 拔刀        sayaka-拔刀    （bash / pwsh 等命令类工具调用期间）
跑失败       → 伤心 5 秒    sayaka-伤心    （非零退出、isError、超时、被杀、整轮报错）
跑成功       → 高兴 5 秒    sayaka-高兴    （命令正常结束）
一轮对话跑完 → 累倒 5 秒    sayaka-累倒    （整轮结束，且没有别的会话还在跑）
第一次跑完之后的一分钟 → 平常心  sayaka-平常心 → 一分钟到 → 睡觉
闲着没事     → 擦剑 3.5 秒  sayaka-擦剑    （睡 / 平常心 / 思考时，每 14~30 秒来一次）
被点一下     → 前两下不理   —              （本地互动，第 3 下才开始害羞）
十秒点三下   → 害羞 1 秒    sayaka-害羞    （本地互动，覆盖上面的状态）
十秒点五下   → 生气 3 秒    sayaka-生气    （本地互动）
十秒点十下   → 气炸了 6 秒  sayaka-生气2   （本地互动，优先级最高）
按住拖动     → 被拖走       sayaka-拖拽    （按住她移动期间，松手就恢复）
```

另外她会**冒独白气泡**：一块**大圆角长方形**（白底、深灰描边、圆角 20px），每个状态**刚切换时冒 1 秒**。

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
| 累倒 | 呼…累死了 |
| 气炸了 | 你再戳一下试试！ |
| 擦剑 | ♪ |
| 被拖走 | 喂喂！ |

> 气泡宽度跟着字数走（最宽到桌宠宽的 1.7 倍），字号随桌宠大小缩放，不会撑破也不会缩成蚂蚁字。
> 睡觉 / 平常心这类长状态不会一直挂着字 —— 只在切换那一秒冒出来。

## 十二张脸

运行时用的就是这十二张立绘（`assets/pet/<state>.png`，784×720 透明底，直接切换、没有淡入淡出）：

<table>
  <tr>
    <td align="center"><img src="assets/pet/sleep.png" width="140" alt="睡觉"><br><b>睡觉</b><br><sub>sleep</sub></td>
    <td align="center"><img src="assets/pet/thinking.png" width="140" alt="思考"><br><b>思考</b><br><sub>thinking</sub></td>
    <td align="center"><img src="assets/pet/sword.png" width="140" alt="拔刀"><br><b>拔刀</b><br><sub>sword</sub></td>
    <td align="center"><img src="assets/pet/sad.png" width="140" alt="伤心"><br><b>伤心</b><br><sub>sad</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/pet/happy.png" width="140" alt="高兴"><br><b>高兴</b><br><sub>happy</sub></td>
    <td align="center"><img src="assets/pet/calm.png" width="140" alt="平常心"><br><b>平常心</b><br><sub>calm</sub></td>
    <td align="center"><img src="assets/pet/shy.png" width="140" alt="害羞"><br><b>害羞</b><br><sub>shy</sub></td>
    <td align="center"><img src="assets/pet/angry.png" width="140" alt="生气"><br><b>生气</b><br><sub>angry</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="assets/pet/tired.png" width="140" alt="累倒"><br><b>累倒</b><br><sub>tired</sub></td>
    <td align="center"><img src="assets/pet/polish.png" width="140" alt="擦剑"><br><b>擦剑</b><br><sub>polish</sub></td>
    <td align="center"><img src="assets/pet/angry2.png" width="140" alt="气炸了"><br><b>气炸了</b><br><sub>angry2</sub></td>
    <td align="center"><img src="assets/pet/drag.png" width="140" alt="被拖走"><br><b>被拖走</b><br><sub>drag</sub></td>
  </tr>
</table>

> 前八张是从原始大图切好、去底、压过的版本（一张 75~95 KB）；后四张（累倒 / 擦剑 / 气炸了 / 被拖走）
> 是后来补的，量化到 255 色后一张 64~79 KB。仓库里没有放 1 MB 级原图，免得把包撑爆；需要的话可以在开发目录里找。

## 交相呼应

光按状态换脸容易显得死板：明明连着出错，她还是同一句「呜呜呜」。所以同一个状态**累计**碰到第几次，会换一句更像在回应的台词，必要时连表情和录音一起换：

| 状态 | 第几次 | 她说什么 | 录音 | 顺带 |
|---|---|---|---|---|
| 伤心 | 2 | 又出问题了 | `quip-sad-2.wav` | — |
| 伤心 | **5** | **气死我了！！！** | `angry.wav` | 表情切生气 3 秒 |
| 伤心 | 9 | 这点小事才不会让我认输！ | `quip-sad-9.wav` | 然后清零重新数 |
| 高兴 | 2 | 嘿嘿，成了 | `quip-happy-2.wav` | — |
| 高兴 | 5 | 今天日子真不错 | `quip-happy-5.wav` | 然后清零重新数 |
| 拔刀 | 5 | 我可不是跑腿的！ | `quip-sword-5.wav` | 然后清零重新数 |
| 思考 | 3 | 想不出来… | `quip-thinking-3.wav` | 然后清零重新数 |
| 平常心 | 2 | 好闲啊 | `quip-calm-2.wav` | 然后清零重新数 |
| 被连点 | 十秒 5 下 | 别戳了！！！ | `quip-poke.wav` | 生气 3 秒 |
| 被连点 | 十秒 10 下 | 你再戳一下试试，我绝对不放过你！ | `quip-poke2.wav` | 气炸了 6 秒（优先级最高） |

规则在 `lib/client.js` 的 `QUIPS` 表里，加一条就是加一行；`at` 是「这个状态这一轮累计到第几次」。走到最后一档会清零，所以是**每错五次气一次**，下一个五次还会再气，而不是只气开头那一回。

## 配音

每个状态都有一段录音（`assets/pet/<state>.wav`），跟着状态播放；情境台词另有专属录音（`assets/pet/quip-*.wav`），说到哪句就放哪句：

| 播报 | 文件 | 什么时候播 |
|---|---|---|
| 早上好 | `morning.wav` | 每次**启动**后说第一句（刷新页面不重播；浏览器拦住自动播放时，会在你第一次点/按键时补上） |
| 拔刀 | `sword.wav` | 每攒够 5~8 次「拔刀」播一次 |
| 高兴 | `happy.wav` | 每攒够 5~8 次「高兴」播一次 |
| 害羞 | `shy.wav` | **每次**被点都播（「不要这样啦」每句都出声，不攒次数） |
| 伤心 | `sad.wav` | 每攒够 5~8 次「伤心」播一次 |
| 思考 | `thinking.wav` | 每攒够 5~8 次「思考」播一次 |
| 生气 | `angry.wav` | 每攒够 5~8 次「生气」播一次；另外「错五次」那句气话也用它 |
| 睡觉 | `sleep.wav` | 每攒够 5~8 次「睡觉」播一次 |
| 被拖走 | `quip-drag.wav` | 按住她拖动的那一刻 |
| 被连点 | `quip-poke.wav` / `quip-poke2.wav` | 十秒 5 下 / 10 下 |

「攒够几次」是**每个状态各记一份**：每进入该状态 +1，够数就播一次、清零，
然后重新掷一个 5~8 的随机间隔。平常心没有状态录音（她平常不说话，只有第 2 次「好闲啊」那句）。
情境台词的专属录音不参与这个计数 —— 它们是按「第几次」触发的。

同一时间只放一段：播下一段之前，上一段没放完会被**直接截断**（暂停并回到开头），
不会出现两句话叠在一起说的情况。

不想要这个间隔的话，设置页里有 **「每次变换都出声」** 开关：打开后不再计数，
拔刀 / 高兴 / 伤心 / 思考 / 睡觉 / 平常心 每次变化都直接播一段（害羞、生气、被拖走本来就有专属那句，不会重复叠）。
DSH 设置页 **sayaka** 分区里的「配音」开关能一键关掉所有声音（表情照常动）。

---

## 安装

```bash
# 从 npm（推荐）
dsh plugin --profile web add dsh-pet-sayaka

# 或者直接从 GitHub 装
dsh plugin --profile web add github:KOGGUA-EDIT/dsh-pet-sayaka
```

装完重启一次 Web 服务（DSH 标题栏「⋯」→ 重启 Web 服务），刷新页面就能在右下角看到她。

每个版本都打了 tag 并附上打包好的 tgz，在 [Releases](https://github.com/KOGGUA-EDIT/dsh-pet-sayaka/releases) 上。

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
| `tiredMs` | `5000` | 一轮对话跑完后累倒多久 |
| `calmMs` | `60000` | 第一次跑完代码后「平常心」持续多久 |
| `shyMs` | `1000` | 被点一下的害羞时长 |
| `shyThreshold` | `3` | 十秒内点到第几下才开始害羞（前两下不理人） |
| `clickThreshold` / `clickWindowMs` | `5` / `10000` | 十秒内点够五下 → 生气 |
| `angryMs` | `3000` | 生气时长 |
| `poke2Threshold` | `10` | 同一窗口内点够十下 → 气炸了 |
| `angry2Ms` | `6000` | 气炸了时长 |
| `includeSubagents` | `true` | 是否跟随子 Agent 的活动 |
| `runToolPattern` | `^(bash\|pwsh\|powershell\|shell\|sh\|cmd\|zsh\|fish\|exec\|command\|terminal\|run)$` | 哪些工具算「跑代码」，命中就拔刀 |
| `monologueMs` | `1000` | 独白气泡出现多久（毫秒） |
| `monologues` | 见上表 | 各状态台词；**逐键合并** —— 只写想改的几句就行，空字符串表示不说话 |

浏览器端（大小百分比、显示开关、拖拽位置）存在 `localStorage`：`dsh-pet-sayaka:settings:v1` / `:pos:v1`，在 DSH 设置页的 **sayaka** 分区里调。

## 交互

- **拖拽**：按住她拖到任意位置（位置按窗口比例存，窗口缩放后还在原地）；拖动期间她会换成「被拖走」那张，还会「喂喂！」抗议一声
- **点一下**：前两下她当没看见（不换表情、不出声）；**十秒内点第 3 下**才害羞 1 秒，配「不要这样啦」+ 录音（每下触发都出声）
- **十秒内点五下**：生气 3 秒，配「别戳了！！！」+ 录音
- **十秒内点十下**：气炸了 6 秒，配「你再戳一下试试，我绝对不放过你！」+ 录音（第 5 下之后不清零，一直数到第 10 下）
  - 气炸之后**继续点只会把 6 秒续上**：不退回害羞、不再重新数数，直到你停手
- **闲着**：她一闲下来就会盘腿擦剑、吹口哨（每 14~30 秒一次，3.5 秒），跑工具的时候也会
- **一轮对话跑完**：先累倒 5 秒（冒魂那种），然后才恢复
- **设置**：全在 DSH 设置页里 —— 侧栏「设置」→ 左栏选 **sayaka**（见下节）。
  桌宠身上**不再挂设置面板和关闭键**，界面保持干净。

## DSH 设置页里的「sayaka」分区

侧栏「设置」→ 左栏里的 **sayaka**，里面五样东西：

| 控件 | 作用 |
|---|---|
| 会呼吸的预览 | 实时显示她当前的状态精灵与当前台词（跟着会话变） |
| 显示桌宠（开关） | 关掉 = 界面上的她消失；状态照常跟随会话，随时开回来 |
| 配音（开关） | 关掉 = 不出声（表情照常动） |
| 每次变换都出声（开关） | 打开 = 去掉 5~8 次的间隔，**状态一变就播对应的录音**（默认关闭，保持"偶尔说一句"的节奏） |
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
├── assets/pet/*.png      # 12 张精灵（784×720，同一画布，脚底对齐）
├── assets/pet/*.wav      # 配音：8 段状态录音 + 10 段情境台词（quip-*.wav）
├── assets/pet/manifest.json  # 画布尺寸 + 精灵清单（由 build-assets.py 生成）
├── assets/pet/bubble.json    # 旧的云朵 path 数据（客户端已改成圆角矩形，宿主仍随快照下发备用）
└── tools/
    ├── install.mjs       # 接线：装/卸/自检（重装 DSH 后用这个恢复）
    ├── build-assets.py   # 把原始素材归一化成 assets/pet（Pillow；sharp 缺失后的替代）
    ├── build-assets.mjs  # 老版本（需要 sharp），留作参考
    ├── trace-bubble.mjs  # 旧工具：把云朵图描摹成 SVG path（现在客户端不用了，留作参考）
    ├── test-state.mjs    # 状态机自测（含真实事件信封夹具）
    ├── test-routes.mjs   # HTTP 路由自测（含目录穿越、SSE 推送）
    └── test-quips.mjs    # 情境台词 + 连点分档自测（错误五次气不气、第 10 下会不会气炸）
```

## 原理

**状态机放在宿主半侧**，因为浏览器侧拿不到稳定的会话事件 API，而宿主侧的 `session/event` 是稳定事件流
（`dsh-dafeiyu`、`dsh-agent-loop` 等官方/内置插件都用它）。好处是两个窗口打开同一页面时活动状态一致，
点击互动仍各自本地。

### 状态分层（越靠上优先级越高）

```
1. 正被她拖着            → drag（被拖走，松手就恢复）
2. 本地互动（点/连点）    → shy / angry / angry2，到点自动过期
3. 有一行代码正在跑      → sword（拔刀）
4. 瞬时反应（伤心/高兴/累倒）→ 到点自动过期
5. 闲着擦剑              → polish（睡/平常心/思考时随机来一次）
6. 有回合正在跑          → thinking（思考）
7. 第一次跑完代码后的一分钟 → calm（平常心）
8. 其余                  → sleep（睡觉）
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
- 正常结束（`completed`）→ 累倒 5 秒（她陪着你把活干完了）；如果还有别的会话在跑，就先不瘫
- 用户主动中止（`aborted`）、等待批准（`blocked`）→ 不给反应

### 独白气泡怎么画

气泡是**纯 CSS 的圆角长方形**（不再描摹云朵图）：

1. 宽高由代码算：字号 = `clamp(round(桌宠高 × 0.062), 13, 24)`，再按「中文 1 字宽、西文 0.56 字宽」估一段
   自然宽度，夹在「桌宠宽的 0.45 倍 ~ 1.7 倍」之间；
2. 样式：20px 圆角、白底 `rgba(255,255,255,.97)`、1.5px 半透明深灰描边、一点投影、文字加粗居中；
3. 位置：水平居中在桌宠上方，底边在`桌宠高 × 0.8` 的位置；
4. 兜底：`useLayoutEffect` 里量一次真实排版（`scrollWidth/clientWidth`、`scrollHeight/clientHeight`），
   超了就把字号按比例缩，最多 5 次，再等 80ms 重测一次（避开中文字体晚加载）；
5. 气泡数据（`assets/pet/bubble.json`）宿主依旧随快照下发，但客户端只把它当"有没有气泡数据"的开关和
   台词时长来源 —— 万一你以后想换回图形气泡，数据还在。

### 消息信封的版本兼容

不同 DSH 版本 `tool/result` 的字段位置不一样，所以解析是「多路兜底」而不是死认一种形状：

| 字段 | 试的顺序 |
|---|---|
| callId | `message.source.callId` → `message.content[].toolCallId` → `message.callId` → `message.toolCallId` → `data.callId` |
| 触发关系 | `data.sourceEventSeqs[0]` 指回 `tool/call` 的 seq |
| 正文 | 递归走 `message.content`（兼容 `content[].content[].text` 这种多一层的老/新信封） |
| 兜底 | 该会话里只剩一个在跑的代码调用时，认领给它 |
| 再兜底 | 结果里带了工具名，且同名的只有一个时，认领给它 |

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
    "running": 0,               // 当前还在跑的代码调用数；卡在 >0 就是「一直拔刀」
    "thinking": 0,              // 还有几个会话在「思考中」
    "oldestRunMs": 0,           // 最老的那个在跑调用等了多久；几百秒还压着就是卡住了
    "swept": 0,                 // 自动清掉过几次残留（见下）
    "overlay": null             // 当前的瞬时反应（sad / happy / tired）
  }
}
```

**「状态变了但桌宠不变」** 基本都是**残留**：`tool/call` 没等到 `tool/result`（回合被中断、事件丢了、工具卡死），
而拔刀/思考的优先级最高、又不会自己过期，于是一直压着后面所有状态。

现在有三道保险：

- `turn/end` 一到，该会话还在"跑"的调用立刻清掉（那一轮不可能再有结果了）；
- 每 5 秒（有客户端在线时）和每条事件都扫一次：跑的超过 `runStaleMs`（默认 3 分钟）、
  思考超过 `thinkingStaleMs`（默认 30 分钟）就丢弃并广播（`stats.swept` +1）；
- 浏览器侧 SSE 静默超过 20 秒会偷偷补拉一次 `/sayaka/state`，推流被卡住也能在 20 秒内对上。

其它入口：

- `GET /sayaka/state` 快照 · `GET /sayaka/stream` SSE 推送 · `GET /sayaka/asset/<state>.png` 精灵 · `/sayaka/asset/<state>.wav` 配音
- 状态名：`sleep` `thinking` `sword` `sad` `happy` `calm` `tired`（`shy` / `angry` / `angry2` / `polish` / `drag` 只在浏览器侧）
- 画布尺寸由 `assets/pet/manifest.json` 声明，宿主通过 `snapshot.canvas` 转给浏览器 —— 换素材后画布大小变了也不用改代码
- 页面里看不清就开 DevTools 看 `[dsh-pet-sayaka]` 相关报错；插件的 `<style>` 标签带 `data-plugin="dsh-pet-sayaka"`

## 换素材

原始素材尺寸不一（1254×1254 / 1227×1281 / 1308×1202 / 1536×1024…），直接塞给浏览器会出现「状态切换时角色忽大忽小、上下跳」。
`tools/build-assets.py` 把每张图铺到同一张 784×720 画布上（水平居中、**底边距 6px**），按「内容高度归一」缩放 —— 站姿统一到 570~600px，坐姿/躺姿各自矮一点：

```bash
python tools/build-assets.py            # 全部 12 张
python tools/build-assets.py --only=tired,polish   # 只重做其中几张
```

需要 Pillow（DSH 自带 Python 里就有）。文件名与目标高度的对应关系写在脚本顶部的 `SOURCES` 表里。
旧的 `build-assets.mjs` 依赖 `sharp`，本机已没有，只在装了 sharp 的环境里可用。

## 自测

```bash
node tools/test-state.mjs    # 状态机 + 累倒 + 独白配置 + 残留清理：104 条断言（含真实会话日志里的两种事件信封）
node tools/test-routes.mjs   # 路由 + 素材（12 张精灵与全部配音）+ 气泡数据 + 文字框：65 条断言（快照 / 素材 / 防目录穿越 / SSE 推送与断开 / 到期自动推送）
node tools/test-quips.mjs    # 情境台词 + 连点分档 + 音频截断 + 拖动换图：159 条断言（每档台词与录音、错误五次的台词与表情、最后一档清零后重新数、录音文件真的存在、第 5 下不清零以便数到第 10 下气炸、前两下不反应）
```

## 已知边界

- 「第一次跑代码」是**进程级**的：重启 Web 服务后重新计一次（符合「这次启动的第一次跑代码」的直觉）。
  平常心窗口不因再次跑代码而延长 —— 窗口结束就回睡觉。
- 只有命令类工具算「跑代码」。读文件、改文件、搜索这些不算，桌宠继续睡觉；要改判就调 `runToolPattern`。
- 桌宠画在 Web 界面里（DSH 的 `shell.overlay` 覆盖层），不是独立桌面窗口。
- 「思考」按回合算（`turn/start` → `turn/end`），不是按"模型正在吐 token"算：
  回合里等工具返回、等批准期间也算思考。多会话并发时只要有一个回合在跑就一直思考。
