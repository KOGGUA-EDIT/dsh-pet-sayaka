/**
 * ============================================================================
 * dsh-pet-sayaka 宿主半侧（host half）
 * ============================================================================
 *
 * 【职责】
 *   1. 订阅 DSH 的 `session/event` 全局事件流，把「跑代码 / 报错 / 跑成功」等
 *      语义事件归纳成桌宠的活动状态（拔刀 / 伤心 / 高兴 / 平常心 / 睡觉）；
 *   2. 通过 HTTP 把状态和素材发给浏览器半侧：
 *        GET /sayaka/state          当前状态快照（JSON，轮询兜底用）
 *        GET /sayaka/stream         状态变化推送（SSE，主通道）
 *        GET /sayaka/asset/<name>   assets/pet/<name>.png 素材
 *
 * 【为什么状态机放在宿主】
 *   浏览器半侧拿不到稳定的会话事件 API（那是 DSH 内部实现），而宿主侧的
 *   `session/event` 是稳定的公开事件流。所以"什么算跑代码、什么时候算成功"
 *   只在宿主这一处判定，浏览器只负责画和点。副作用是两个窗口打开同一页面时
 *   活动状态一致（点击互动仍是各自本地的）。
 *
 * ============================================================================
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 插件行 id —— 必须与 package.json / cordis.patch.yml / 浏览器半侧的 id 一致。 */
export const name = 'dsh-pet-sayaka';
/** 依赖的服务：sessions（会话事件）、webServer（注册路由）。 */
export const inject = ['sessions', 'webServer'];

/** 本包根目录（lib/ 的上一级）——源码目录和安装后都成立。 */
const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 路由前缀。 */
export const ROUTE_PREFIX = '/sayaka';

/** 状态名 → 素材文件名（不带扩展名）。客户端按同一个名字取图。 */
export const ACTIVITIES = ['sleep', 'thinking', 'sword', 'sad', 'happy', 'calm'];

/** 默认配置：可被 cordis.patch.yml 里这一行的 config 覆盖。 */
export const DEFAULTS = Object.freeze({
	/** 关掉后宿主不再推送状态（客户端会一直显示初始状态）。 */
	enabled: true,
	/** 桌宠展示高度（CSS px）；客户端设置面板里还能单独调。 */
	size: 280,
	/** 跑出错的伤心时长。 */
	sadMs: 5000,
	/** 跑成功的高兴时长。 */
	happyMs: 5000,
	/** 第一次跑完代码之后，"平常心"持续多久，之后回到睡觉。 */
	calmMs: 60000,
	/** 十秒内连点多少次会生气。 */
	clickThreshold: 5,
	/** 连点计数的滑动窗口。 */
	clickWindowMs: 10000,
	/** 生气的持续时长。 */
	angryMs: 3000,
	/** 被点一下的害羞时长。 */
	shyMs: 1000,
	/** 是否跟随子 Agent 的活动。 */
	includeSubagents: true,
	/** 独白气泡的出现时长（毫秒）—— 每个状态刚切换时冒一下。 */
	monologueMs: 1000,
	/**
	 * 每个状态对应的独白台词。空字符串表示不说话（比如睡觉）。
	 * 想改词就改这里（或在 profile 的 cordis.patch.yml 里覆盖同名键，会与这里的默认值合并）。
	 */
	monologues: {
		thinking: 'emmmmm',
		sleep: '',
		sword: '武装保卫见泷原！',
		sad: '呜呜呜',
		shy: '不要这样啦',
		angry: '我生气了！！！',
		happy: '耶✌️',
		calm: '快来吧',
	},
	/**
	 * 哪些工具调用算"跑代码"。命中即拔刀。
	 * 默认覆盖 bash / pwsh / shell / cmd / 终端类工具。
	 */
	runToolPattern: '^(bash|pwsh|powershell|shell|sh|cmd|zsh|fish|exec|command|terminal|run)$',
});

/** 素材路由的 content-type（png 是表情，wav 是配音）。 */
const MIME = { '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav' };

/** 判定"跑成功 / 跑失败"时要扫的结果文本标记（dsh 的 bash 工具会追加这些标记）。 */
const EXIT_CODE = /\[exit code:\s*(-?\d+)\]/;
const FAILURE_MARKERS = [/\[killed by signal:/, /\[timed out after/, /\[sandbox:/];

// ---------------------------------------------------------------------------
// 事件 → 状态
// ---------------------------------------------------------------------------

/** 会话 id：Session 实例的 header.id，或 session/disposed 载荷的 id。 */
function sessionIdOf(session) {
	return String(session?.header?.id ?? session?.id ?? 'unknown');
}

/** 子 Agent 会话：默认不跟随（可用 includeSubagents 打开）。 */
function isSubagent(session) {
	return session?.header?.origin === 'subagent' || Number(session?.header?.delegationDepth ?? 0) > 0;
}

/** 工具名是否算"跑代码"。 */
function isRunTool(name, pattern) {
	const value = String(name ?? '').trim();
	if (value === '') return false;
	try {
		return new RegExp(pattern, 'i').test(value);
	} catch {
		// 配置写坏了也不能让桌宠挂掉：退回默认模式。
		return new RegExp(DEFAULTS.runToolPattern, 'i').test(value);
	}
}

/**
 * 递归拼出消息里的纯文本。
 *
 * 【为什么要递归】不同 dsh 版本的消息信封差一层，不能只认某一种形状：
 *   dsh 0.1.0：message.content = [{ type: 'text', text }]
 *   dsh 0.1.2：message.content = [{ type: 'tool-result', toolCallId, isError,
 *                                  content: [{ type: 'text', text }] }]
 */
function collectText(blocks, depth = 0) {
	if (!Array.isArray(blocks) || depth > 5) return '';
	const parts = [];
	for (const block of blocks) {
		if (block === null || typeof block !== 'object') continue;
		if (typeof block.text === 'string') parts.push(block.text);
		if (Array.isArray(block.content)) parts.push(collectText(block.content, depth + 1));
	}
	return parts.filter((part) => part !== '').join('\n');
}

/** 取第一个非空字符串候选。 */
function firstString(...candidates) {
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate !== '') return candidate;
	}
	return undefined;
}

/**
 * 把一条 `tool/result` 归一化成 `{ callId, isError, text, refSeq }`。
 * 各版本的字段位置都试一遍（可靠度从高到低）：
 *   callId  : message.source.callId → message.content[].toolCallId → message.callId → message.toolCallId → data.callId
 *   refSeq  : data.sourceEventSeqs[0] —— 结果回指触发它的 tool/call 的 seq，最稳的兜底
 *   isError : message.content[].isError → message.isError → data.error
 *   text    : message.content（含嵌套）里所有 text 块
 */
export function readToolResult(event) {
	const data = event?.data ?? {};
	const message = data?.message ?? {};
	const blocks = Array.isArray(message.content) ? message.content : [];
	const blockCallIds = blocks
		.filter((block) => block !== null && typeof block === 'object')
		.map((block) => block.toolCallId);
	const refSeq = Number(data?.sourceEventSeqs?.[0]);
	return {
		callId: firstString(message.source?.callId, ...blockCallIds, message.callId, message.toolCallId, data.callId),
		isError: message.isError === true
			|| blocks.some((block) => block !== null && typeof block === 'object' && block.isError === true)
			|| (data.error !== undefined && data.error !== null),
		text: collectText(blocks),
		refSeq: Number.isFinite(refSeq) ? refSeq : undefined,
	};
}

/**
 * 这次代码运行算不算失败。
 * dsh 的 bash 工具把非零退出写成正文里的 `[exit code: N]` 标记（而不是 isError），
 * 所以四类信号都要看：结构化 error / isError / 退出码标记 / 超时被杀标记。
 */
export function runFailed(event) {
	const { isError, text } = readToolResult(event);
	if (isError) return true;
	const exit = EXIT_CODE.exec(text);
	if (exit !== null && Number(exit[1]) !== 0) return true;
	return FAILURE_MARKERS.some((marker) => marker.test(text));
}

/**
 * 桌宠状态机。
 *
 * 分层模型（越靠上优先级越高）：
 *   1. 有一行代码正在跑            → sword（拔刀）
 *   2. 瞬时反应（伤心 / 高兴）      → 到时间自动过期
 *   3. 第一次跑完代码后的一分钟窗口 → calm（平常心）
 *   4. 其余                        → sleep（睡觉）
 *
 * 「第一次跑代码」只认一次：那次跑完开一个 calmMs 的窗口，窗口结束回到睡觉；
 * 之后再跑代码不会有平常心了。
 */
export class PetState {
	/**
	 * @param config - 生效配置（通常是 DEFAULTS 与 patch 配置的合并）。
	 * @param options - ：素材画布尺寸，来自 assets/pet/manifest.json，
	 *   浏览器半侧据此算展示框宽高比。
	 */
	constructor(config = {}, options = {}) {
		// 独白表按"逐键合并"处理：patch 里只覆盖一句台词时，其余键仍用默认。
		this.config = { ...DEFAULTS, ...config, monologues: { ...DEFAULTS.monologues, ...(config.monologues ?? {}) } };
		this.canvas = options.canvas ?? { width: 784, height: 720 };
		/** 独白气泡的云朵 SVG（assets/pet/bubble.json）；没有就不冒气泡。 */
		this.bubble = options.bubble ?? null;
		/** callId → { sessionId, name }，同时在跑的代码调用（并发多个也不会提前切回睡觉）。 */
		this.running = new Map();
		/** 正在「思考」的会话 id 集合（turn/start → turn/end）；用集合是因为可能同时有多个会话在跑。 */
		this.thinking = new Set();
		/** 瞬时反应：{ kind: 'sad' | 'happy', until }。 */
		this.overlay = undefined;
		/** 第一次跑完代码的时间点；null 表示还没跑过。 */
		this.firstRunAt = null;
		/** 平常心窗口的截止时间。 */
		this.calmUntil = null;
		/** 状态版本号：客户端据此丢弃过期的推送。 */
		this.revision = 0;
		// 诊断计数：桌宠没反应时看这三个数就知道卡在哪一环（见 README 排障）。
		this.stats = { events: 0, runs: 0, turns: 0, lastEventType: null, lastEventAt: null };
		this.listeners = new Set();
		this.timer = undefined;
	}

	/** 当前活动 + 会不会自己结束。 */
	activityAt(now = Date.now()) {
		// 优先级：跑代码 > 瞬时反应（伤心/高兴）> 思考中 > 平常心 > 睡觉
		if (this.running.size > 0) return { activity: 'sword', until: null };
		if (this.overlay !== undefined) {
			if (this.overlay.until > now) return { activity: this.overlay.kind, until: this.overlay.until };
			this.overlay = undefined;
		}
		if (this.thinking.size > 0) return { activity: 'thinking', until: null };
		if (this.calmUntil !== null) {
			if (this.calmUntil > now) return { activity: 'calm', until: this.calmUntil };
			this.calmUntil = null;
		}
		return { activity: 'sleep', until: null };
	}

	/** 发给浏览器半侧的完整快照。 */
	snapshot(now = Date.now()) {
		const { activity, until } = this.activityAt(now);
		return {
			rev: this.revision,
			activity,
			until,
			serverTime: now,
			config: {
				size: this.config.size,
				shyMs: this.config.shyMs,
				angryMs: this.config.angryMs,
				clickThreshold: this.config.clickThreshold,
				clickWindowMs: this.config.clickWindowMs,
				monologueMs: this.config.monologueMs,
				monologues: this.config.monologues,
			},
			activities: ACTIVITIES,
			canvas: this.canvas,
			bubble: this.bubble,
			stats: { ...this.stats, running: this.running.size, firstRunAt: this.firstRunAt },
		};
	}

	/** 订阅状态变化（SSE 用）。返回退订函数。 */
	subscribe(listener) {
		this.listeners.add(listener);
		// 晚连上来的订阅者：补排一次到期定时器，否则过期状态要等下一次事件才推。
		this.#schedule();
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** 记一次状态变化：版本号 +1、重排到期定时器、通知订阅者。 */
	#touch() {
		this.revision += 1;
		this.#schedule();
		for (const listener of [...this.listeners]) {
			try {
				listener(this.snapshot());
			} catch {
				/* 单个订阅者出错不影响其它订阅者 */
			}
		}
	}

	/** 在"下一个会自己过期的状态"到期时再推一次，客户端不需要自己算时间。 */
	#schedule() {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (this.listeners.size === 0) return;
		const now = Date.now();
		const deadlines = [];
		if (this.overlay !== undefined && this.overlay.until > now) deadlines.push(this.overlay.until);
		if (this.calmUntil !== null && this.calmUntil > now) deadlines.push(this.calmUntil);
		if (deadlines.length === 0) return;
		const delay = Math.max(20, Math.min(...deadlines) - now + 20);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			// 到点了：activityAt 会把过期状态清掉，这里只要让客户端看到新状态。
			this.#touch();
		}, delay);
		// 定时器不应该拖住 dsh 进程退出。
		this.timer.unref?.();
	}

	/** 开一个瞬时反应窗口（伤心 / 高兴）。 */
	#react(kind, ms) {
		const duration = Number(ms);
		if (!Number.isFinite(duration) || duration <= 0) return;
		this.overlay = { kind, until: Date.now() + duration };
	}

	/**
	 * 处理一条会话事件。只在状态真的变了的时候才广播（revision 是变化次数），
	 * 所以高频事件（assistant/chunk 之类）不会把 SSE 打爆。
	 *
	 * @param session - Session 实例（或 session/disposed 的载荷）。
	 * @param event   - 会话事件 { type, data, seq, time }。
	 */
	handleSessionEvent(session, event) {
		if (this.config.enabled === false) return;
		if (!event || typeof event.type !== 'string') return;
		if (this.config.includeSubagents === false && isSubagent(session)) return;
		this.stats.events += 1;
		this.stats.lastEventType = event.type;
		this.stats.lastEventAt = Date.now();
		const sessionId = sessionIdOf(session);
		const before = JSON.stringify(this.activityAt());

		switch (event.type) {
			case 'tool/call': {
				const callId = String(event.data?.callId ?? `seq-${String(event.seq ?? 'unknown')}`);
				const toolName = String(event.data?.name ?? '');
				if (!isRunTool(toolName, this.config.runToolPattern)) break;
				this.running.set(callId, { sessionId, name: toolName, seq: Number(event.seq) });
				this.stats.runs += 1;
				// 新的代码运行开始了：上一轮的伤心/高兴到此为止。
				this.overlay = undefined;
				break;
			}
			case 'tool/result': {
				const callId = this.#claimRun(sessionId, event);
				const known = callId !== undefined;
				if (known) this.running.delete(callId);
				// 只有"开始跑的时候被算作跑代码"的那次才给反应；否则一次普通工具返回
				// 也会让桌宠乱蹦。
				if (!known) break;
				if (this.firstRunAt === null) {
					this.firstRunAt = Date.now();
					this.calmUntil = this.firstRunAt + Number(this.config.calmMs);
				}
				const failed = runFailed(event);
				this.#react(failed ? 'sad' : 'happy', failed ? this.config.sadMs : this.config.happyMs);
				break;
			}
			case 'turn/start': {
				// 模型开始干活：从这一刻起到 turn/end 为止都算「思考」，
				// 期间如果跑了代码会先被拔刀盖住（剑优先级更高）。
				this.thinking.add(sessionId);
				this.stats.turns += 1;
				break;
			}
			case 'step/start':
			case 'assistant/chunk':
			case 'assistant/message': {
				// 兜底：万一没收到 turn/start（例如服务在回合中途重启过），
				// 这几类事件也能把「思考中」点起来。
				this.thinking.add(sessionId);
				break;
			}
			case 'turn/end': {
				this.thinking.delete(sessionId);
				// 整轮跑挂了（模型报错 / 超长）也算"有错误"。
				const kind = String(event.data?.reason?.kind ?? 'completed');
				if (kind === 'completed' || kind === 'aborted' || kind === 'blocked' || kind === 'disposed') break;
				this.#react('sad', this.config.sadMs);
				break;
			}
			default:
				break;
		}

		if (JSON.stringify(this.activityAt()) !== before) this.#touch();
	}

	/**
	 * 认领一条 tool/result：它到底是哪次"跑代码"的结果？
	 *
	 * 三种认法依次退化（各版本信封字段位置不同，不指望一次命中）：
	 *   1. 结果里带的 callId 直接命中；
	 *   2. 结果里的 sourceEventSeqs 指回 tool/call 的 seq；
	 *   3. 这个会话里只剩一个在跑的代码调用 —— 那就是它。
	 *
	 * @returns 命中的 callId；不是代码运行的结果时返回 undefined。
	 */
	#claimRun(sessionId, event) {
		const info = readToolResult(event);
		if (info.callId !== undefined && this.running.has(info.callId)) return info.callId;
		if (info.refSeq !== undefined) {
			for (const [callId, call] of this.running) {
				if (call.sessionId === sessionId && call.seq === info.refSeq) return callId;
			}
		}
		const candidates = [...this.running].filter(([, call]) => call.sessionId === sessionId);
		return candidates.length === 1 ? candidates[0][0] : undefined;
	}

	/** 会话被销毁：清掉它没还回来的在跑调用和「思考中」标记，避免桌宠一直拔着刀 / 一直思考。 */
	disposeSession(session) {
		const sessionId = sessionIdOf(session);
		let changed = this.thinking.delete(sessionId);
		for (const [callId, call] of this.running) {
			if (call.sessionId !== sessionId) continue;
			this.running.delete(callId);
			changed = true;
		}
		if (changed) this.#touch();
	}

	dispose() {
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.listeners.clear();
		this.running.clear();
		this.thinking.clear();
	}
}

// ---------------------------------------------------------------------------
// HTTP 路由
// ---------------------------------------------------------------------------

/**
 * 读 assets/pet/manifest.json（由 tools/build-assets.mjs 生成）。
 * 拿不到就退回默认画布 —— 少了这个文件桌宠也该能跑，只是宽高比按默认算。
 * @returns { width, height } 素材画布尺寸
 */
function readCanvasManifest() {
	try {
		const raw = readFileSync(join(PACKAGE_ROOT, 'assets', 'pet', 'manifest.json'), 'utf8');
		const value = JSON.parse(raw);
		if (Number.isFinite(value?.width) && Number.isFinite(value?.height) && value.width > 0 && value.height > 0) {
			return { width: value.width, height: value.height };
		}
	} catch {
		/* 没有 manifest 也能用 */
	}
	return { width: 784, height: 720 };
}

/**
 * 读 assets/pet/bubble.json（由 tools/trace-bubble.mjs 从云朵图描摹出来的 SVG path）。
 * @returns 气泡定义；文件缺失或坏掉时返回 null（桌宠照常显示，只是不冒泡）
 */
function readBubbleManifest() {
	try {
		const raw = readFileSync(join(PACKAGE_ROOT, 'assets', 'pet', 'bubble.json'), 'utf8');
		const value = JSON.parse(raw);
		if (typeof value?.path === 'string' && typeof value?.viewBox === 'string') return value;
	} catch {
		/* 没有气泡文件也能用 */
	}
	return null;
}

/** 防目录穿越：规范化后必须仍在 root 内。 */
function resolveAsset(root, rel) {
	if (typeof rel !== 'string' || rel.length === 0) return undefined;
	const candidate = normalize(join(root, rel));
	const rootWithSep = root.endsWith(sep) ? root : root + sep;
	if (candidate !== root && !candidate.startsWith(rootWithSep)) return undefined;
	return candidate;
}

function sendJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(payload),
	});
	res.end(payload);
}

/**
 * `/sayaka` 前缀路由：
 *   /sayaka/state          JSON 快照（轮询兜底）
 *   /sayaka/stream         SSE 推送
 *   /sayaka/asset/<x>.png  素材
 */
export function createHandler(pet, options = {}) {
	const assetRoot = options.assetRoot ?? join(PACKAGE_ROOT, 'assets', 'pet');

	return async function handler(req, res) {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const rest = decodeURIComponent(url.pathname.slice(ROUTE_PREFIX.length + 1));
		const [scope, ...tail] = rest.split('/');

		if (scope === 'state') {
			sendJson(res, 200, pet.snapshot());
			return;
		}

		if (scope === 'stream') {
			// SSE：先写一帧当前状态，之后每次状态变化推一帧，中间用注释行保活。
			res.writeHead(200, {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-store, no-transform',
				connection: 'keep-alive',
				'x-accel-buffering': 'no',
			});
			res.write(': sayaka-pet\n\n');
			const write = (snapshot) => {
				if (res.writableEnded || res.destroyed) return;
				try {
					res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
				} catch {
					/* 客户端断开时的写入失败可以直接忽略 */
				}
			};
			write(pet.snapshot());
			const unsubscribe = pet.subscribe(write);
			const heartbeat = setInterval(() => {
				if (res.writableEnded || res.destroyed) return;
				try {
					// 具名事件（而不是注释行）：浏览器半侧用 addEventListener('ping')
					// 就能把心跳算作"连接还活着"，从而不会误判成断了而降级轮询。
					res.write('event: ping\ndata: {}\n\n');
				} catch {
					/* 同上 */
				}
			}, 15000);
			heartbeat.unref?.();
			const cleanup = () => {
				clearInterval(heartbeat);
				unsubscribe();
			};
			req.on('close', cleanup);
			res.on('close', cleanup);
			return;
		}

		if (scope === 'asset') {
			const fileName = tail.join('/');
			// 素材名只允许 <state>.png（或任何包内 assets/pet 下的文件），不允许穿越。
			const file = resolveAsset(assetRoot, fileName);
			if (file === undefined || !existsSync(file)) {
				res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
				res.end('dsh-pet-sayaka: asset not found');
				return;
			}
			const info = await stat(file);
			const type = MIME[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
			res.writeHead(200, {
				'content-type': type,
				'content-length': info.size,
				// 素材是静态的：给足缓存，切换状态时零延迟。
				'cache-control': 'public, max-age=86400',
			});
			const stream = createReadStream(file);
			stream.on('error', () => res.destroy());
			stream.pipe(res);
			return;
		}

		res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('dsh-pet-sayaka: expected /sayaka/{state|stream|asset/<file>}');
	};
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
	const pet = new PetState(config ?? {}, { canvas: readCanvasManifest(), bubble: readBubbleManifest() });
	const offEvent = ctx.on('session/event', (session, event) => pet.handleSessionEvent(session, event), { global: true });
	const offDisposed = ctx.on('session/disposed', (session) => pet.disposeSession(session), { global: true });

	ctx.effect(
		() => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: createHandler(pet) }),
		'dsh-pet-sayaka: /sayaka routes',
	);

	ctx.effect(() => () => {
		offEvent?.();
		offDisposed?.();
		pet.dispose();
	}, 'dsh-pet-sayaka: teardown');

	ctx.logger?.info?.('dsh-pet-sayaka: 桌宠已挂载（/sayaka）');
}
