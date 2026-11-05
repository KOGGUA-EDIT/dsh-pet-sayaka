/**
 * ============================================================================
 * dsh-pet-sayaka 浏览器半侧（browser half）
 * ============================================================================
 *
 * 【这个文件是什么】
 *   DSH Web 界面里的悬浮桌宠本体。它以官方"客户端 bundle"形态注册自己
 *   （window.__ModuleLoader__.load），然后把自己挂到界面的 `shell.overlay`
 *   槽位上（右下角那层浮动层）。
 *
 * 【它做什么 / 不做什么】
 *   宿主半侧（lib/index.js）负责"现在该是什么精灵"——它听会话事件，决定
 *   拔刀 / 伤心 / 高兴 / 平常心 / 累倒 / 睡觉，并通过 SSE 推过来。这里只做四件事：
 *     1. 把状态画出来（12 张图叠着，只留当前那张可见，切换是瞬间的、不淡入）；
 *     2. 本地的点击互动（害羞 1 秒；10 秒内点 5 下 → 生气，点到 10 下 → 气炸）；
 *     3. 闲着擦剑、被拖走这两张"小动作"，以及配音（状态录音 5~8 次一次 + 情境台词）；
 *     4. 拖拽 + 大小/位置这类纯外观偏好（存 localStorage）。
 *   本地互动优先级最高：被拖走 > 气炸 > 生气 > 害羞 > 宿主状态。
 *
 * 【状态从哪来】
 *   GET /sayaka/stream  SSE 推送（主）；连不上就退回 GET /sayaka/state 轮询。
 *   两个接口都由宿主半侧提供。
 *
 * ============================================================================
 */
window.__ModuleLoader__.load({
	// 插件唯一 id —— 必须与 package.json 的包名一致
	id: 'dsh-pet-sayaka',

	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;

		// React 由 DSH 外壳提供，插件不打包它
		const React = require('react');
		const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React;
		const h = React.createElement;

		// 路由与资源：与宿主半侧的 ROUTE_PREFIX 保持一致
		const ROUTE = '/sayaka';
		const ASSET = ROUTE + '/asset/';
		const STREAM = ROUTE + '/stream';
		const STATE = ROUTE + '/state';

		// 素材画布的默认宽高比（真值由宿主从 assets/pet/manifest.json 读出来发给我们，
		// 换素材导致画布尺寸变化时不用改这里）
		const CANVAS_RATIO = 784 / 720;

		/**
		 * 精灵表：名字要跟 assets/pet/<name>.png 对齐。
		 *   · 宿主推来的：睡觉 / 思考 / 拔刀 / 伤心 / 高兴 / 平常心 / 累倒（一轮聊完瘫 5 秒）
		 *   · 本地反应：害羞 / 生气 / 气炸（连点 10 下）/ 擦剑（闲着没事） / 被拖走
		 */
		const SPRITES = [
			'sleep', 'thinking', 'sword', 'sad', 'happy', 'calm',
			'tired', 'shy', 'angry', 'angry2', 'polish', 'drag',
		];

		/** 宿主没连上时的兜底配置（字段与宿主 snapshot().config 一致）。 */
		const FALLBACK_CONFIG = {
			size: 280,
			shyMs: 1000,
			angryMs: 3000,
			clickThreshold: 5,
			clickWindowMs: 10000,
			tiredMs: 5000,
			poke2Threshold: 10,
			angry2Ms: 6000,
			/** 十秒内点到第几下才开始害羞（前两下当没看见）。 */
			shyThreshold: 3,
		};

		const SETTINGS_KEY = 'dsh-pet-sayaka:settings:v1';
		const POS_KEY = 'dsh-pet-sayaka:pos:v1';

		// ============================================================================
		// 内联 CSS —— 官方插件的标准做法（注入一个 <style>）
		// ============================================================================
		const css = [
			// 根容器：固定定位、最高层级、整体点击穿透（只有图片那一块接管鼠标）
			'.sayaka-root{position:fixed;z-index:2147483647;pointer-events:none;user-select:none}',
			// shell.overlay 容器自己是一个层叠上下文（z-index:20），不抬它的话
			// 无论 root 写多大都会被右侧栏(z-index:50)盖住。容器本身 pointer-events:none，
			// 抬高层级不影响界面点击。
			'[data-shell-overlay]{z-index:2147483647!important}',
			// 默认角落位置（贴底 = 站在窗口底边上）
			'.sayaka-root[data-corner="bottom-right"]{right:24px;bottom:0}',
			'.sayaka-root[data-corner="bottom-left"]{left:24px;bottom:0}',
			'.sayaka-root[data-corner="top-right"]{right:24px;top:0}',
			'.sayaka-root[data-corner="top-left"]{left:24px;top:0}',
			'.sayaka-stage{position:relative;pointer-events:none}',
			// 所有精灵叠在一起，只用 visibility 切换 —— 不做淡入淡出，
			// 换表情是"啪"地一下直接换过去，中间不会出现半透明的影子
			'.sayaka-sprite{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;visibility:hidden;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-drag:none}',
			'.sayaka-sprite.is-on{visibility:visible}',
			'.sayaka-sprite:active{cursor:grabbing}',
			// 独白气泡：大圆角长方形（原来是描摹云朵，用户嫌啰嗦，换成一整块圆角框）
			'.sayaka-bubble{position:absolute;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;z-index:2;box-sizing:border-box;border-radius:20px;border:1.5px solid rgba(74,74,74,.5);background:rgba(255,255,255,.97);box-shadow:0 6px 18px rgba(0,0,0,.18);padding:8px 14px;text-align:center;color:#3f3f46}',
			'.sayaka-bubble.is-on{opacity:1;transform:translateY(0)}',
			'.sayaka-bubble-text{font-weight:700;line-height:1.4;letter-spacing:.01em;word-break:break-word;white-space:pre-wrap}',
			// ── DSH 设置页「sayaka」分区的卡片 ──────────────────────────────────
			'.sayaka-card{list-style:none;display:grid;gap:16px;padding:16px;border-radius:12px;border:1px solid var(--border-color,rgba(128,128,128,.28));background:var(--surface-color,transparent);color:inherit;font-size:13px}',
			'.sayaka-card-title strong{display:block;font-size:16px;letter-spacing:.02em}',
			'.sayaka-card-title small{display:block;opacity:.62;margin-top:5px;line-height:1.5}',
			// 预览区：她在这儿呼吸（动效）
			'.sayaka-preview{display:flex;align-items:center;gap:16px;padding:14px 16px;border-radius:10px;border:1px dashed var(--border-color,rgba(128,128,128,.3));min-height:120px;overflow:hidden}',
			'.sayaka-preview-stage{position:relative;flex:none;display:grid;place-items:end center;transition:width .2s ease,height .2s ease}',
			'.sayaka-preview-img{width:100%;height:100%;object-fit:contain;transform-origin:center bottom;animation:sayaka-bob 2.6s ease-in-out infinite}',
			'@keyframes sayaka-bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-5%) scale(1.015)}}',
			'.sayaka-preview-meta{min-width:0;line-height:1.65}',
			'.sayaka-preview-now{font-weight:600}',
			'.sayaka-preview-now em{font-style:normal;opacity:.55;font-weight:400;font-size:11px;margin-left:6px}',
			'.sayaka-preview-line{margin-top:4px;opacity:.75;word-break:break-word}',
			'.sayaka-field{display:flex;align-items:center;justify-content:space-between;gap:20px}',
			'.sayaka-field-label>span{display:block;font-weight:600}',
			'.sayaka-field-label small{display:block;opacity:.6;margin-top:3px;font-size:11px;line-height:1.5}',
			// 开关（按下时滑块有回弹过渡）
			'.sayaka-switch{position:relative;flex:none;width:44px;height:25px;padding:0;border-radius:999px;border:1px solid var(--border-color,rgba(128,128,128,.4));background:rgba(127,127,127,.22);cursor:pointer;transition:background .22s ease,border-color .22s ease}',
			'.sayaka-switch-knob{position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .22s cubic-bezier(.22,1.2,.36,1)}',
			'.sayaka-switch.is-on{background:#5b8cff;border-color:#5b8cff}',
			'.sayaka-switch.is-on .sayaka-switch-knob{left:22px}',
			// 大小拉杆（拖动时预览跟着缩放）
			'.sayaka-slider{display:flex;align-items:center;gap:10px;flex:none}',
			'.sayaka-slider input[type=range]{width:180px;accent-color:#5b8cff;cursor:pointer}',
			'.sayaka-slider-value{width:46px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85}',
			'.sayaka-note{margin:0;font-size:11px;line-height:1.6;opacity:.58}',
			'@media (prefers-reduced-motion: reduce){.sayaka-bubble,.sayaka-card *,.sayaka-preview-stage{transition:none;animation:none!important}}',
		].join('\n');
		if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-pet-sayaka/style.css"]') === null) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-pet-sayaka';
			tag.dataset.pluginCss = 'dsh-pet-sayaka/style.css';
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ============================================================================
		// 小工具
		// ============================================================================
		function readJson(key, fallback) {
			try {
				const raw = window.localStorage.getItem(key);
				if (raw === null) return fallback;
				const value = JSON.parse(raw);
				return value !== null && typeof value === 'object' ? value : fallback;
			} catch {
				return fallback;
			}
		}

		function writeJson(key, value) {
			try {
				window.localStorage.setItem(key, JSON.stringify(value));
			} catch {
				/* 隐私模式下写不进去也不该影响桌宠 */
			}
		}

		function clamp(value, min, max) {
			return Math.min(Math.max(value, min), max);
		}

		/** 状态 key → 中文名（设置页预览用）。 */
		const ACTIVITY_LABEL = {
			sleep: '睡觉', thinking: '思考', sword: '拔刀', sad: '伤心',
			happy: '高兴', calm: '平常心', shy: '害羞', angry: '生气',
			tired: '累倒', angry2: '气炸了', polish: '擦剑', drag: '被拖走',
		};

		/**
		 * 情境台词（交相呼应）：同一个状态累计碰到第几次就换一句更贴情境的话，
		 * 而不是每次都念那句固定独白。
		 *   at    这个状态这一轮累计到第几次时触发
		 *   text  气泡里的话
		 *   kind  可选：顺手换个表情（比如错误五次直接气给你看）
		 *   voice 可选：配一段录音，做到表情、台词、声音一起变
		 * 走到最后一条就清零重新数 —— 所以是「每错五次气一次」，
		 * 下一个五次还会再气一次，而不是只气开头那一回。
		 */
		const QUIPS = {
			sad: [
				{ at: 2, text: '又出问题了', voice: 'sad-2' },
				{ at: 5, text: '气死我了！！！', kind: 'angry', voice: 'angry' },
				{ at: 9, text: '这点小事才不会让我认输！', voice: 'sad-9' },
			],
			happy: [
				{ at: 2, text: '嘿嘿，成了', voice: 'happy-2' },
				{ at: 5, text: '今天日子真不错', voice: 'happy-5' },
			],
			sword: [
				{ at: 5, text: '我可不是跑腿的！', voice: 'sword-5' },
			],
			thinking: [
				{ at: 3, text: '想不出来…', voice: 'thinking-3' },
			],
			calm: [
				{ at: 2, text: '好闲啊', voice: 'calm-2' },
			],
		};

		/**
		 * 情境台词往前推一档：碰到这个状态一次，返回这次该说的那条（没到点就是 null）。
		 * counts 是「状态 → 这一轮碰到几次」，会被就地更新；数到最后一档就归零。
		 * 没有为这个状态写台词（比如睡觉）就直接返回 null，也不占计数。
		 */
		function stepQuip(counts, state) {
			const rules = QUIPS[state];
			if (!Array.isArray(rules)) return null;
			const next = (counts.get(state) ?? 0) + 1;
			const lastAt = rules[rules.length - 1].at;
			counts.set(state, next >= lastAt ? 0 : next);
			return rules.find((rule) => rule.at === next) ?? null;
		}

		/**
		 * 连点分档（纯函数，方便直接单测）：
		 *   count 是十秒窗口内的点击数（含刚点的这一下）。
		 *   满 10 下 → 'angry2'（气炸，数完清零重来）
		 *   正好第 5 下 → 'angry'（生气）
		 *   6~9 下 → 'hold'（还在气头上，不重复触发，但要接着数到第 10 下）
		 *   第 3、4 下 → 'shy'（她要点三下才害臊）
		 *   前两下   → 'none'（当没看见）
		 */
		function pokeStage(count, config) {
			if (count >= config.poke2Threshold) return 'angry2';
			if (count >= config.clickThreshold) return count === config.clickThreshold ? 'angry' : 'hold';
			if (count >= (config.shyThreshold ?? 3)) return 'shy';
			return 'none';
		}

		/**
		 * 气炸期间再被点：只续时长（纯函数，方便单测）。
		 * 用户要求：进入第二阶段之后不管点多少下都只在原地续期，不许退回害羞。
		 */
		function angry2Held(reaction, now) {
			return reaction !== null && reaction.kind === 'angry2' && reaction.until > now;
		}

		/**
		 * 气泡排版（纯函数，方便直接单测）：
		 *   字号随桌宠大小走（13~24px），宽度按「中文 1 字宽、西文 0.56 字宽」估一段自然宽度，
		 *   夹在桌宠宽的 0.45 ~ 1.7 倍之间；水平居中在她头顶上方。
		 */
		function bubbleLayout(text, size, width) {
			const weighted = [...String(text)].reduce((sum, ch) => sum + (ch.codePointAt(0) > 0x2e80 ? 1 : 0.56), 0) || 1;
			const fontSize = clamp(Math.round(size * 0.062), 13, 24);
			const paddingX = Math.round(fontSize * 0.8);
			const paddingY = Math.round(fontSize * 0.42);
			const naturalW = Math.round(weighted * fontSize * 1.05 + paddingX * 2);
			const bubbleW = Math.min(Math.round(width * 1.7), Math.max(Math.round(width * 0.45), naturalW));
			return {
				fontSize,
				paddingX,
				paddingY,
				width: bubbleW,
				left: Math.round(width / 2 - bubbleW / 2),
				bottom: Math.round(size * 0.88),
			};
		}

		// ============================================================================
		// 配音 —— 每个状态一段录音，文件是 assets/pet/<state>.wav
		//   · 平常心没有录音（她平常不说话），所以 VOICE_FILES 里没有 calm
		//   · 「早上好」只在每次启动后说第一句（刷新页面不重播）
		//   · 其余状态各记一份"碰到几次"的计数，攒够 5~8 次同类状态才播一次；
		//     播完清零，并重新掷一个 5~8 的间隔
		// 浏览器不允许没交互就出声：第一次被拦下的那段记下来，等用户点一下/按一下再补播
		// ============================================================================
		const VOICE_FILES = {
			morning: 'morning.wav',
			sword: 'sword.wav',
			happy: 'happy.wav',
			shy: 'shy.wav',
			sad: 'sad.wav',
			thinking: 'thinking.wav',
			angry: 'angry.wav',
			sleep: 'sleep.wav',
			// 情境台词的专属录音：攒够次数才说一句，所以不参与 5~8 的间隔计数
			'sad-2': 'quip-sad-2.wav',
			'sad-9': 'quip-sad-9.wav',
			'happy-2': 'quip-happy-2.wav',
			'happy-5': 'quip-happy-5.wav',
			'sword-5': 'quip-sword-5.wav',
			'calm-2': 'quip-calm-2.wav',
			'thinking-3': 'quip-thinking-3.wav',
			poke: 'quip-poke.wav',
			poke2: 'quip-poke2.wav',
			drag: 'quip-drag.wav',
		};
		const VOICE_GAP_MIN = 5;
		const VOICE_GAP_MAX = 8;
		/** 参与"每 5~8 次同类状态播一次"计数的状态（情境台词的专属录音不参与）。 */
		const ENCOUNTER_STATES = new Set(['sword', 'happy', 'sad', 'thinking', 'angry', 'sleep']);
		/**
		 * 打开「每次变换都出声」后直接播状态录音的那些状态。
		 * 害羞（点一下）、生气/气炸（连点）、被拖走都有更贴脸的专属录音，由各自的交互去播，这里不重复。
		 */
		const INSTANT_STATES = new Set(['sleep', 'sword', 'happy', 'sad', 'thinking', 'calm']);

		const voice = (() => {
			const players = new Map();  // 素材地址 → Audio（复用，别每次 new）
			const counts = new Map();   // 状态 → 这一轮已经碰到几次
			const gaps = new Map();     // 状态 → 这次要碰到第几次才播
			let pending = null;         // 被自动播放策略拦下的状态，等用户动手补播
			let current = null;         // 正在播的那个 Audio（换下一段时先掐掉它）

			/** 5~8 的随机整数。 */
			const rollGap = () => VOICE_GAP_MIN + Math.floor(Math.random() * (VOICE_GAP_MAX - VOICE_GAP_MIN + 1));

			const elementOf = (state) => {
				const file = VOICE_FILES[state];
				if (file === undefined) return null;
				const url = ASSET + file;
				let audio = players.get(url);
				if (audio === undefined) {
					audio = new Audio(url);
					audio.preload = 'auto';
					players.set(url, audio);
				}
				return audio;
			};

			/** 掐掉正在放的那段（回到开头，下次还能从头播）。 */
			const cutCurrent = () => {
				const audio = current;
				current = null;
				if (audio === null) return;
				try {
					audio.pause();
					audio.currentTime = 0;
				} catch {
					/* 还没加载好就算了，反正也没出声 */
				}
			};

			/** 真的出声（静音判断在 play 里）。换下一段之前先截断上一段，别让两句话叠着说。 */
			const start = (state) => {
				const audio = elementOf(state);
				if (audio === null) return;
				if (current !== null && current !== audio) cutCurrent();
				current = audio;
				try {
					audio.currentTime = 0;
				} catch {
					/* 元数据还没加载好，从头播就是了 */
				}
				const played = audio.play();
				if (played !== undefined && typeof played.catch === 'function') {
					played.catch(() => { pending = state; });
				}
			};

			/** 播一段（静音时什么都不做）。 */
			const play = (state) => {
				if (settingsStore.get().muted === true) return;
				start(state);
			};

			return {
				play,
				/** 状态切换：记一次；攒够这一轮掷出来的次数就播一次，然后重掷。 */
				encounter(state) {
					if (!ENCOUNTER_STATES.has(state)) return;
					let gap = gaps.get(state);
					if (gap === undefined) {
						gap = rollGap();
						gaps.set(state, gap);
					}
					const count = (counts.get(state) ?? 0) + 1;
					if (count < gap) {
						counts.set(state, count);
						return;
					}
					counts.set(state, 0);
					gaps.set(state, rollGap());
					play(state);
				},
				/** 用户第一次动手（点/按键）：解除自动播放封锁，把被吞掉的那段补上。 */
				unlock() {
					if (pending === null) return;
					const state = pending;
					pending = null;
					start(state);
				},
			};
		})();

		/**
		 * 外观设置的单一来源：桌宠（shell.overlay）和 DSH 设置页（settings.section「sayaka」）
		 * 共用这一份，任一处改动两边立刻同步。存在 localStorage，属于浏览器本地偏好。
		 *   scale        0~200（%）：100 = 宿主配置里的 size（默认 280px）
		 *   hidden       是否在界面上显示她
		 *   muted        是否静音（关掉配音，界面照常动）
		 *   instantVoice 每次变换都出声（跳过 5~8 次的间隔，想每变必响就打开）
		 */
		const settingsStore = (() => {
			const read = () => {
				const raw = readJson(SETTINGS_KEY, {});
				// 兼容旧版本：以前存的是绝对像素 size，这里换算成百分比
				if (raw.scale === undefined && Number.isFinite(Number(raw.size))) {
					return { scale: clamp(Math.round((Number(raw.size) / FALLBACK_CONFIG.size) * 100), 0, 200), hidden: raw.hidden === true, muted: raw.muted === true, instantVoice: raw.instantVoice === true };
				}
				const scale = Number(raw.scale);
				return { scale: Number.isFinite(scale) ? clamp(Math.round(scale), 0, 200) : 100, hidden: raw.hidden === true, muted: raw.muted === true, instantVoice: raw.instantVoice === true };
			};
			let state = read();
			const listeners = new Set();
			return {
				get: () => state,
				set(patch) {
					state = { ...state, ...patch };
					writeJson(SETTINGS_KEY, state);
					for (const listener of [...listeners]) {
						try {
							listener();
						} catch {
							/* 单个订阅者出错不影响别人 */
						}
					}
				},
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
			};
		})();

		/** 订阅设置：任何一处改动都会让两边重新渲染。 */
		function useSettings() {
			const [, bump] = useState(0);
			useEffect(() => settingsStore.subscribe(() => bump((n) => n + 1)), []);
			return settingsStore.get();
		}

		// ============================================================================
		// 桌宠组件
		// ============================================================================
		function Sayaka() {
			// 外观偏好（大小百分比 / 显示开关）：与 DSH 设置页共用同一份 store
			const settings = useSettings();
			// 自定义位置：{ rx, ry } 是"中心点相对窗口的比例"，窗口缩放后仍然合理；null = 用默认角落
			const [pos, setPos] = useState(() => readJson(POS_KEY, null));
			// 宿主推来的活动状态
			const [remote, setRemote] = useState(null);
			// 本地点击反应：{ kind: 'shy' | 'angry', until }
			const [reaction, setReaction] = useState(null);
			// 独白气泡：{ seq, text } —— 只在状态刚切换时冒一下，过 monologueMs 自动消失
			const [bubble, setBubble] = useState(null);
			// 情境台词：{ seq, text } —— 比独白更贴当前情境，冒出来时盖过独白
			const [quip, setQuip] = useState(null);
			// 是否正被拎着拖（拖动时换成「被拖走」那张）
			const [dragging, setDragging] = useState(false);
			const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

			const rootRef = useRef(null);
			const dragRef = useRef(null);
			const posRef = useRef(pos);
			const reactionRef = useRef(null);
			const clickTimesRef = useRef([]);
			const reactionTimerRef = useRef(undefined);
			const bubbleSeqRef = useRef(0);
			const bubbleTimerRef = useRef(undefined);
			const bubbleTextRef = useRef(null);
			// 状态 → 这一轮已经碰到几次（情境台词用）
			const moodRef = useRef(new Map());
			// 刚触发情境台词：这次状态切换先别念独白，等情境台词盖上来
			const pendingQuipRef = useRef(false);
			// 情境台词收起来时跳过下面那次独白，免得「气死我了」后面又接一句「呜呜呜」
			const skipMonologueRef = useRef(false);
			// 上一次情境台词出声的时间：开了「每次变换都出声」时，别让状态录音和台词录音叠在一起
			const quipVoiceAtRef = useRef(0);

			posRef.current = pos;
			reactionRef.current = reaction;

			const config = { ...FALLBACK_CONFIG, ...(remote?.config ?? {}) };
			// 100% = 宿主配置里的 size（默认 280px）；设置页给的是 0~200% 的百分比
			const baseSize = clamp(Number(config.size) || FALLBACK_CONFIG.size, 80, 420);
			const size = clamp(Math.round((baseSize * settings.scale) / 100), 0, 900);
			const canvas = remote?.canvas;
			const canvasRatio = Number(canvas?.width) > 0 && Number(canvas?.height) > 0 ? canvas.width / canvas.height : CANVAS_RATIO;
			const width = Math.round(size * canvasRatio);

			useEffect(() => { if (pos !== null) writeJson(POS_KEY, pos); }, [pos]);

			// 窗口尺寸变化：重新计算视口（位置是按比例存的，所以要跟着重算）
			useEffect(() => {
				const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
				window.addEventListener('resize', onResize);
				return () => window.removeEventListener('resize', onResize);
			}, []);

			// ------------------------------------------------------------------
			// 宿主状态：SSE 为主，连不上退到轮询
			// ------------------------------------------------------------------
			useEffect(() => {
				let disposed = false;
				let source;
				let pollTimer;
				let watchdog;
				let lastAt = Date.now();

				const apply = (snapshot) => {
					if (disposed || snapshot === null || typeof snapshot !== 'object') return;
					if (typeof snapshot.activity !== 'string') return;
					lastAt = Date.now();
					setRemote(snapshot);
				};

				const startPolling = () => {
					if (pollTimer !== undefined || disposed) return;
					const tick = () => {
						fetch(STATE, { cache: 'no-store' })
							.then((response) => (response.ok ? response.json() : undefined))
							.then((snapshot) => { if (snapshot !== undefined) apply(snapshot); })
							.catch(() => {});
					};
					tick();
					pollTimer = setInterval(tick, 1500);
				};

				const stopStream = () => {
					if (source !== undefined) {
						source.close();
						source = undefined;
					}
				};

				if (typeof EventSource === 'function') {
					try {
						source = new EventSource(STREAM);
						source.onmessage = (event) => {
							try {
								apply(JSON.parse(event.data));
							} catch {
								/* 坏帧直接丢掉 */
							}
						};
						// 服务端每 15 秒发一个具名 ping：算作"连接还活着"，
						// 这样长时间没有状态变化也不会被误判成断线。
						source.addEventListener('ping', () => { lastAt = Date.now(); });
						// 只有浏览器明确放弃（readyState=CLOSED）或真的太久没有消息，
						// 才退回轮询 —— 单纯"这段时间没状态变化"不算断线。
						watchdog = setInterval(() => {
							if (disposed) return;
							if (source !== undefined && source.readyState === 2) {
								stopStream();
								startPolling();
								return;
							}
							if (Date.now() - lastAt > 45000) {
								stopStream();
								startPolling();
								return;
							}
							// 推送通道有时候会被中间层卡住（连接还开着但不来数据）：
							// 静默超过 20 秒就偷偷补一次快照，不用等到 45 秒才降级。
							if (Date.now() - lastAt > 20000) {
								fetch(STATE, { cache: 'no-store' })
									.then((response) => (response.ok ? response.json() : undefined))
									.then((snapshot) => { if (snapshot !== undefined) apply(snapshot); })
									.catch(() => {});
							}
						}, 5000);
					} catch {
						startPolling();
					}
				} else {
					startPolling();
				}

				return () => {
					disposed = true;
					stopStream();
					clearInterval(watchdog);
					clearInterval(pollTimer);
				};
			}, []);

			// ------------------------------------------------------------------
			// 点击互动
			// ------------------------------------------------------------------
			const setReactionFor = useCallback((kind, ms) => {
				const duration = Number(ms) > 0 ? Number(ms) : 1000;
				const next = { kind, until: Date.now() + duration };
				reactionRef.current = next;
				setReaction(next);
				clearTimeout(reactionTimerRef.current);
				reactionTimerRef.current = setTimeout(() => {
					reactionRef.current = null;
					setReaction(null);
				}, duration);
			}, []);

			useEffect(() => () => clearTimeout(reactionTimerRef.current), []);

			/**
			 * 点一下：前两下不理人；10 秒内点够 3 下 → 害羞（不要这样啦）；
			 * 点够 5 下 → 生气（别戳了！！！）；继续点够 10 下 → 气炸第二形态（你再戳一下试试，我绝对不放过你！）。
			 */
			const handlePoke = useCallback(() => {
				const now = Date.now();
				// 气炸期间再点：只把时长重置回满，不换表情、不再数数、不退回害羞
				if (angry2Held(reactionRef.current, now)) {
					setReactionFor('angry2', config.angry2Ms);
					return;
				}
				const recent = clickTimesRef.current.filter((time) => now - time < config.clickWindowMs);
				recent.push(now);
				clickTimesRef.current = recent;
				const active = reactionRef.current;
				const angryActive = active !== null && (active.kind === 'angry' || active.kind === 'angry2') && active.until > now;
				const stage = pokeStage(recent.length, config);
				if (stage === 'angry2') {
					clickTimesRef.current = [];
					setReactionFor('angry2', config.angry2Ms);
					setQuip({ seq: (bubbleSeqRef.current += 1), text: '你再戳一下试试，我绝对不放过你！' });
					voice.play('poke2');
					return;
				}
				if (stage === 'angry') {
					// 不清空：第 6~10 下还要接着数，数到 10 才是气炸
					setReactionFor('angry', config.angryMs);
					setQuip({ seq: (bubbleSeqRef.current += 1), text: '别戳了！！！' });
					voice.play('poke');
					return;
				}
				// 6~9 下：气还没消就憋着，气消了再戳就还是害羞
				if (stage === 'hold') {
					if (!angryActive) {
						setReactionFor('shy', config.shyMs);
						voice.play('shy');
					}
					return;
				}
				// 前两下：她当没看见（不换表情、不出声），第三下才开始害羞
				if (stage === 'none') return;
				setReactionFor('shy', config.shyMs);
				// 害羞这句「不要这样啦」每次触发都出声，不攒次数
				voice.play('shy');
			}, [config.angry2Ms, config.angryMs, config.clickThreshold, config.clickWindowMs, config.poke2Threshold, config.shyMs, config.shyThreshold, setReactionFor]);

			// ------------------------------------------------------------------
			// 拖拽
			// ------------------------------------------------------------------
			const handlePointerDown = useCallback((event) => {
				if (event.button !== 0) return;
				const root = rootRef.current;
				if (root === null) return;
				const rect = root.getBoundingClientRect();
				dragRef.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					originLeft: rect.left,
					originTop: rect.top,
					moved: false,
				};
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {
					/* 不支持捕获就算了，拖动仍可用 */
				}
			}, []);

			const handlePointerMove = useCallback((event) => {
				const drag = dragRef.current;
				if (drag === null || drag.pointerId !== event.pointerId) return;
				const dx = event.clientX - drag.startX;
				const dy = event.clientY - drag.startY;
				if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
				if (!drag.moved) {
					drag.moved = true;
					// 一拎起来就换成"被拖着走"那张，再喊一声「喂！」
					setDragging(true);
					voice.play('drag');
				}
				const left = clamp(drag.originLeft + dx, 0, window.innerWidth - width);
				const top = clamp(drag.originTop + dy, 0, window.innerHeight - size);
				setPos({
					rx: (left + width / 2) / window.innerWidth,
					ry: (top + size / 2) / window.innerHeight,
				});
			}, [size, width]);

			const handlePointerUp = useCallback((event) => {
				const drag = dragRef.current;
				dragRef.current = null;
				setDragging(false);
				setMirror(false);
				if (drag === null) return;
				if (drag.moved) return;
				handlePoke();
			}, [handlePoke]);

			// ------------------------------------------------------------------
			// 展示状态：被拎着 > 本地反应（气炸/生气/害羞/擦剑）> 宿主活动
			// ------------------------------------------------------------------
			const now = Date.now();
			const active = reaction !== null && reaction.until > now ? reaction.kind : null;
			const hostActivity = typeof remote?.activity === 'string' ? remote.activity : 'sleep';
			const display = dragging ? 'drag' : (active ?? (SPRITES.includes(hostActivity) ? hostActivity : 'sleep'));

			// 给"闲着擦剑"的定时器用：它要知道现在显示的是不是能被打断的状态
			const displayRef = useRef(display);
			displayRef.current = display;

			// 闲着没事就擦擦剑、吹口哨（睡、平常心、拔刀、思考时都可能来一下）
			useEffect(() => {
				let timer;
				const schedule = () => {
					timer = setTimeout(() => {
						const current = displayRef.current;
						if (current === 'sleep' || current === 'calm' || current === 'sword' || current === 'thinking') {
							setReactionFor('polish', 3500);
						}
						schedule();
					}, 14000 + Math.random() * 16000);
				};
				schedule();
				return () => clearTimeout(timer);
			}, [setReactionFor]);

			// 配音：默认每进入一个状态记一次，攒到 5~8 次播一次；
			// 设置里打开「每次变换都出声」后不再计数，状态一变就播（睡觉/拔刀/高兴/伤心/思考/平常心这几段）
			useEffect(() => {
				if (settings.instantVoice !== true) {
					voice.encounter(display);
					return undefined;
				}
				if (!INSTANT_STATES.has(display)) return undefined;
				// 同一刻如果情境台词已经先出声，就别再叠一段状态录音（隔一拍再判断）
				const timer = setTimeout(() => {
					if (Date.now() - quipVoiceAtRef.current < 150) return;
					voice.play(display);
				}, 0);
				return () => clearTimeout(timer);
			}, [display, settings.instantVoice]);

			// 每次启动后的第一句：「早上好」。用 sessionStorage 记一下，
			// 刷新页面不重播（重开软件才是新的一次启动）。
			useEffect(() => {
				const KEY = 'dsh-pet-sayaka:morning:v1';
				let said = false;
				try {
					said = window.sessionStorage.getItem(KEY) === '1';
				} catch {
					/* 隐私模式下没有 sessionStorage，那就每次都放 */
				}
				if (said) return undefined;
				const timer = setTimeout(() => {
					try {
						window.sessionStorage.setItem(KEY, '1');
					} catch {
						/* 同上 */
					}
					voice.play('morning');
				}, 800);
				return () => clearTimeout(timer);
			}, []);

			// 浏览器不允许没交互就出声：第一次点/按键时补播被吞掉的那段
			useEffect(() => {
				const onGesture = () => voice.unlock();
				window.addEventListener('pointerdown', onGesture, true);
				window.addEventListener('keydown', onGesture, true);
				return () => {
					window.removeEventListener('pointerdown', onGesture, true);
					window.removeEventListener('keydown', onGesture, true);
				};
			}, []);

			const monologueText = typeof config.monologues?.[display] === 'string' ? config.monologues[display].trim() : '';
			const bubbleData = remote?.bubble ?? null;
			const monologueMs = Number(config.monologueMs) > 0 ? Number(config.monologueMs) : 1000;

			// ------------------------------------------------------------------
			// 交相呼应：同一个状态累计碰到第几次，就换一句更像她在回应的台词
			//   错误五次 → 直接气给你看：表情切生气 + 台词「气死我了」+ angry 录音
			//   走到最后一档就清零重数，所以下一个五次还会再演一遍
			// ------------------------------------------------------------------
			useEffect(() => {
				const fired = stepQuip(moodRef.current, hostActivity);
				if (fired === null) return;
				pendingQuipRef.current = true;
				setQuip({ seq: (bubbleSeqRef.current += 1), text: fired.text });
				if (typeof fired.voice === 'string') {
					quipVoiceAtRef.current = Date.now();
					voice.play(fired.voice);
				}
				if (typeof fired.kind === 'string') {
					setReactionFor(fired.kind, Number(config.angryMs) > 0 ? Number(config.angryMs) : 3000);
				}
				// 只跟宿主活动走：点她带来的害羞/生气不算"碰到这个状态"
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [hostActivity]);

			// 情境台词冒出来：压住独白，过一会儿自己收（留足时间读，别一闪就没）
			useEffect(() => {
				if (quip === null) return undefined;
				pendingQuipRef.current = false;
				clearTimeout(bubbleTimerRef.current);
				setBubble({ seq: quip.seq, text: quip.text });
				bubbleTimerRef.current = setTimeout(() => {
					setBubble(null);
					skipMonologueRef.current = true;
					setQuip(null);
				}, Math.max(1800, monologueMs * 2));
				return () => clearTimeout(bubbleTimerRef.current);
			}, [quip, monologueMs]);

			// 状态一变就冒一句，过 monologueMs 收起来（睡觉的台词是空的 → 永远不冒）
			useEffect(() => {
				if (pendingQuipRef.current || quip !== null) return undefined;
				if (skipMonologueRef.current) {
					skipMonologueRef.current = false;
					return undefined;
				}
				clearTimeout(bubbleTimerRef.current);
				if (monologueText === '' || bubbleData === null) {
					setBubble(null);
					return undefined;
				}
				setBubble({ seq: (bubbleSeqRef.current += 1), text: monologueText });
				bubbleTimerRef.current = setTimeout(() => setBubble(null), monologueMs);
				return () => clearTimeout(bubbleTimerRef.current);
			}, [display, monologueText, monologueMs, bubbleData?.path ?? '', quip]);
			useEffect(() => () => clearTimeout(bubbleTimerRef.current), []);

			// 字号估算只当起手值：渲染完按**真实排版**量一次，超了就缩。
			// （估算按"中文 1 字宽、西文 0.56 字宽"，但像 m / W 这类字母实际宽得多，
			//   所以必须用 scrollWidth 兜底，才不会被长英文撑出云朵。）
			useLayoutEffect(() => {
				const el = bubbleTextRef.current;
				if (el === null) return undefined;
				const fit = () => {
					for (let i = 0; i < 5; i += 1) {
						const width = Math.max(1, el.scrollWidth);
						const height = Math.max(1, el.scrollHeight);
						const scale = Math.min(1, el.clientWidth / width, el.clientHeight / height);
						if (scale > 0.98) break;
						const current = Number.parseFloat(window.getComputedStyle(el).fontSize) || 16;
						el.style.fontSize = Math.max(10, Math.floor(current * scale * 0.97)) + "px";
					}
				};
				fit();
				// 字体（尤其中文回退字体）可能晚一步加载完，再量一次更稳
				const timer = setTimeout(fit, 80);
				return () => clearTimeout(timer);
			}, [bubble?.seq, bubble?.text]);

			// ------------------------------------------------------------------
			// 渲染
			// ------------------------------------------------------------------
			const corner = pos === null ? 'bottom-right' : 'custom';
			const rootStyle = { '--sayaka-size': size + 'px' };
			if (pos !== null) {
				const left = clamp(pos.rx * viewport.width - width / 2, 0, Math.max(0, viewport.width - width));
				const top = clamp(pos.ry * viewport.height - size / 2, 0, Math.max(0, viewport.height - size));
				rootStyle.left = left + 'px';
				rootStyle.top = top + 'px';
				rootStyle.right = 'auto';
				rootStyle.bottom = 'auto';
			}

			// 显示开关在 DSH 设置页（settings.section「sayaka」）；这里只管要不要渲染
			if (settings.hidden === true || size < 8) return null;

			return h('div', {
				ref: rootRef,
				className: 'sayaka-root',
				'data-corner': corner,
				'data-activity': display,
				style: Object.assign(rootStyle, { width: width + 'px', height: size + 'px' }),
				children: [
					// 独白气泡：一整块大圆角长方形，宽度跟着字数走（最多拉到桌宠宽的 1.7 倍）
					bubble !== null
						? (() => {
							const text = String(bubble.text);
							const layout = bubbleLayout(text, size, width);
							return h('div', {
								key: 'bubble-' + bubble.seq,
								className: 'sayaka-bubble is-on',
								style: {
									left: layout.left + 'px',
									bottom: layout.bottom + 'px',
									width: layout.width + 'px',
									padding: layout.paddingY + 'px ' + layout.paddingX + 'px',
								},
								'data-monologue': text,
								'data-font-size': String(layout.fontSize),
								children: h('div', {
									key: 'text',
									ref: bubbleTextRef,
									className: 'sayaka-bubble-text',
									style: { fontSize: layout.fontSize + 'px' },
									children: text,
								}),
							});
						})()
						: null,
					// 精灵：全部预加载 + 叠放，只有当前状态那张可见（直接切换，不淡入）
					h('div', {
						key: 'stage',
						className: 'sayaka-stage',
						style: { width: width + 'px', height: size + 'px' },
						onPointerDown: handlePointerDown,
						onPointerMove: handlePointerMove,
						onPointerUp: handlePointerUp,
						onPointerCancel: () => { dragRef.current = null; setDragging(false); setMirror(false); },
						children: SPRITES.map((sprite) => h('img', {
							key: sprite,
							className: 'sayaka-sprite' + (sprite === display ? ' is-on' : ''),
							src: ASSET + sprite + '.png',
							alt: '',
							draggable: false,
							loading: 'eager',
							decoding: 'async',
						})),
					}),
				],
			});
		}

		// ============================================================================
		// DSH 设置页里的「sayaka」分区
		// ============================================================================
		/**
		 * 卡片内容：会呼吸的预览 + 显示开关 + 大小百分比拉杆。
		 * 预览轮询 /sayaka/state 拿当前状态（只在设置页打开时跑，1.5s 一次，很轻）。
		 */
		function SayakaSettings() {
			const settings = useSettings();
			const [snapshot, setSnapshot] = useState(null);

			useEffect(() => {
				let alive = true;
				const tick = () => {
					fetch(STATE, { cache: 'no-store' })
						.then((response) => (response.ok ? response.json() : undefined))
						.then((value) => { if (alive && value !== undefined) setSnapshot(value); })
						.catch(() => {});
				};
				tick();
				const timer = setInterval(tick, 1500);
				return () => { alive = false; clearInterval(timer); };
			}, []);

			const config = { ...FALLBACK_CONFIG, ...(snapshot?.config ?? {}) };
			const activity = SPRITES.includes(snapshot?.activity) ? snapshot.activity : 'sleep';
			const monologue = typeof config.monologues?.[activity] === 'string' ? config.monologues[activity].trim() : '';
			const scale = settings.scale;
			const previewHeight = clamp(Math.round((96 * scale) / 100), 0, 192);
			const previewWidth = Math.round(previewHeight * (784 / 720));

			return h('li', { className: 'sayaka-card', 'data-testid': 'sayaka-settings' },
				h('div', { key: 'title', className: 'sayaka-card-title' },
					h('strong', { children: 'sayaka' }),
					h('small', { children: '美树沙耶香桌宠 · 她的表情由 DSH 会话状态驱动，这里只管显示、声音与大小' }),
				),
				h('div', { key: 'preview', className: 'sayaka-preview' },
					h('div', {
						className: 'sayaka-preview-stage',
						style: { width: previewWidth + 'px', height: Math.max(previewHeight, 6) + 'px' },
					},
						h('img', { className: 'sayaka-preview-img', src: ASSET + activity + '.png', alt: '', draggable: false }),
					),
					h('div', { className: 'sayaka-preview-meta' },
						h('div', { className: 'sayaka-preview-now' },
							'当前：' + (ACTIVITY_LABEL[activity] ?? activity),
							h('em', { children: scale + '%' }),
						),
						h('div', { className: 'sayaka-preview-line', children: monologue === '' ? '（现在不说话）' : monologue }),
					),
				),
				h('label', { key: 'show', className: 'sayaka-field' },
					h('span', { className: 'sayaka-field-label' },
						h('span', { children: '显示桌宠' }),
						h('small', { children: '关掉后界面上的她会消失（状态照常跟随会话，随时开回来）' }),
					),
					h('button', {
						type: 'button',
						role: 'switch',
						className: 'sayaka-switch' + (settings.hidden === true ? '' : ' is-on'),
						'aria-checked': settings.hidden !== true,
						'aria-label': '显示桌宠',
						onClick: () => settingsStore.set({ hidden: settings.hidden !== true }),
						children: h('span', { className: 'sayaka-switch-knob' }),
					}),
				),
				h('label', { key: 'voice', className: 'sayaka-field' },
					h('span', { className: 'sayaka-field-label' },
						h('span', { children: '配音' }),
						h('small', { children: '开局说「早上好」；其余台词每碰到 5~8 次同类状态才播一次（想改成每次都播，见下一项）；同一个状态连着来，她会换话、变脸' }),
					),
					h('button', {
						type: 'button',
						role: 'switch',
						className: 'sayaka-switch' + (settings.muted === true ? '' : ' is-on'),
						'aria-checked': settings.muted !== true,
						'aria-label': '配音',
						onClick: () => settingsStore.set({ muted: settings.muted !== true }),
						children: h('span', { className: 'sayaka-switch-knob' }),
					}),
				),
				h('label', { key: 'instant', className: 'sayaka-field' },
					h('span', { className: 'sayaka-field-label' },
						h('span', { children: '每次变换都出声' }),
						h('small', { children: '打开后去掉 5~8 次的间隔，状态一变就播对应的录音（嫌间隔太长就开它）' }),
					),
					h('button', {
						type: 'button',
						role: 'switch',
						className: 'sayaka-switch' + (settings.instantVoice === true ? ' is-on' : ''),
						'aria-checked': settings.instantVoice === true,
						'aria-label': '每次变换都出声',
						onClick: () => settingsStore.set({ instantVoice: settings.instantVoice !== true }),
						children: h('span', { className: 'sayaka-switch-knob' }),
					}),
				),
				h('label', { key: 'size', className: 'sayaka-field' },
					h('span', { className: 'sayaka-field-label' },
						h('span', { children: '大小' }),
						h('small', { children: '相对默认尺寸的百分比：0% 等于看不见，200% 是两倍大' }),
					),
					h('div', { className: 'sayaka-slider' },
						h('input', {
							type: 'range',
							min: 0,
							max: 200,
							step: 5,
							value: scale,
							'aria-label': '桌宠大小百分比',
							onChange: (event) => settingsStore.set({ scale: clamp(Math.round(Number(event.target.value)), 0, 200) }),
						}),
						h('span', { className: 'sayaka-slider-value', children: scale + '%' }),
					),
				),
				h('p', {
					key: 'note',
					className: 'sayaka-note',
					children: '按住她可以拖到任意位置（位置记在浏览器本地）。一轮对话跑完她会累倒 5 秒，闲着没事会擦剑吹口哨，连点 10 下会气炸。台词、时长、什么算「跑代码」这些在 profile 的 cordis.patch.yml 里调，改完重启 Web 服务生效。',
				}),
			);
		}

		// ============================================================================
		// 插件主体（Cordis 三件套：name / inject / apply）
		// ============================================================================
		const name = 'dsh-pet-sayaka';
		const inject = ['slots'];

		function apply(ctx) {
			// DSH 设置页里加一个叫「sayaka」的分区（大小 / 显示开关）
			ctx.slots.inject('settings.section', () => ctx.slots.register({
				name: 'settings.section',
				id: 'sayaka',
				order: 9,
				label: () => 'sayaka',
			}, SayakaSettings));

			// 叠加式注册：等 shell.overlay 槽位出现后再挂自己，不影响别的条目。
			ctx.slots.inject('shell.overlay', function* () {
				yield ctx.slots.register({
					name: 'shell.overlay',
					id: 'dsh-pet-sayaka',
					order: 1200,
				}, () => h(Sayaka));
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	},
});
