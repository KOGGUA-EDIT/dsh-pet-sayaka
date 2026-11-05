#!/usr/bin/env node
// 情境台词（交相呼应）的规则自测。
// QUIPS / stepQuip 写在 lib/client.js 里（浏览器 bundle，不能直接 import），
// 这里把这两段源码抠出来在沙箱里跑，保证测的就是真正发货的那份逻辑。
//
// 用法：node tools/test-quips.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'lib', 'client.js'), 'utf8');

function slice(startMarker, endMarker) {
	const from = SOURCE.indexOf(startMarker);
	if (from < 0) throw new Error('找不到起始标记：' + startMarker);
	const to = SOURCE.indexOf(endMarker, from);
	if (to < 0) throw new Error('找不到结束标记：' + endMarker);
	return SOURCE.slice(from, to + endMarker.length);
}

const quipsSource = slice('const QUIPS = {', '\n\t\t};');
const stepSource = slice('function stepQuip(', '\n\t\t}');
const voicesSource = slice('const VOICE_FILES = {', '\n\t\t};');

// eslint-disable-next-line no-new-func
const factory = new Function(`${quipsSource}\n${stepSource}\n${voicesSource}\nreturn { QUIPS, stepQuip, VOICE_FILES };`);
const { QUIPS, stepQuip, VOICE_FILES } = factory();

let pass = 0;
let fail = 0;
function check(ok, message) {
	if (ok) {
		pass += 1;
		return;
	}
	fail += 1;
	console.error('✗ ' + message);
}
function equal(actual, expected, message) {
	check(actual === expected, `${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
}

// ---- 1. 错误（sad）：错两次嘀咕，错五次气死我了，错九次认命，然后重新数 ----------------
{
	const counts = new Map();
	const seen = [];
	const s = () => stepQuip(counts, 'sad');
	equal(s()?.text ?? null, null, 'sad 第 1 次不该说话');
	const second = s();
	equal(second?.text ?? null, '又出问题了', 'sad 第 2 次说「又出问题了」');
	equal(second?.voice ?? null, 'sad-2', 'sad 第 2 次配 quip-sad-2 录音');
	equal(s(), null, 'sad 第 3 次不触发');
	equal(s(), null, 'sad 第 4 次不触发');
	const angry = s();
	equal(angry?.text ?? null, '气死我了！！！', 'sad 第 5 次说「气死我了！！！」');
	equal(angry?.kind ?? null, 'angry', 'sad 第 5 次顺手切生气表情');
	equal(angry?.voice ?? null, 'angry', 'sad 第 5 次配 angry 录音');
	equal(s(), null, 'sad 第 6 次不触发');
	equal(s(), null, 'sad 第 7 次不触发');
	equal(s(), null, 'sad 第 8 次不触发');
	const ninth = s();
	equal(ninth?.text ?? null, '这点小事才不会让我认输！', 'sad 第 9 次说「这点小事才不会让我认输！」');
	equal(ninth?.voice ?? null, 'sad-9', 'sad 第 9 次配 quip-sad-9 录音');
	equal(counts.get('sad'), 0, 'sad 数到最后一档后归零');
	equal(s(), null, '重置后第 1 次重新不触发');
	equal(s()?.text ?? null, '又出问题了', '重置后第 2 次又回到「又出问题了」');
	for (let i = 0; i < 3; i += 1) seen.push(s()); // 3、4、5 → 第 5 次又是气
	const again = seen[2];
	equal(again?.text ?? null, '气死我了！！！', '下一个第 5 次还会再气一次');
}

// ---- 2. 高兴（happy）--------------------------------------------------------------
{
	const counts = new Map();
	equal(stepQuip(counts, 'happy'), null, 'happy 第 1 次不触发');
	equal(stepQuip(counts, 'happy')?.text ?? null, '嘿嘿，成了', 'happy 第 2 次说「嘿嘿，成了」');
	equal(stepQuip(counts, 'happy'), null, 'happy 第 3 次不触发');
	equal(stepQuip(counts, 'happy'), null, 'happy 第 4 次不触发');
	const fifth = stepQuip(counts, 'happy');
	equal(fifth?.text ?? null, '今天日子真不错', 'happy 第 5 次说「今天日子真不错」');
	equal(fifth?.voice ?? null, 'happy-5', 'happy 第 5 次配 quip-happy-5 录音');
	equal(counts.get('happy'), 0, 'happy 数到最后一档后归零');
}

// ---- 2b. 拔刀（sword）：第一次那句"又在跑命令"已经删掉，只剩第 5 次 ----------------
{
	const counts = new Map();
	for (let i = 1; i <= 4; i += 1) equal(stepQuip(counts, 'sword'), null, `sword 第 ${i} 次不触发`);
	const fifth = stepQuip(counts, 'sword');
	equal(fifth?.text ?? null, '我可不是跑腿的！', 'sword 第 5 次说「我可不是跑腿的！」');
	equal(fifth?.voice ?? null, 'sword-5', 'sword 第 5 次配 quip-sword-5 录音');
	equal(counts.get('sword'), 0, 'sword 数到最后一档后归零');
	equal(QUIPS.sword.length, 1, 'sword 只剩一条台词（「又在跑命令」已删）');
}

// ---- 3. 没有台词的状态不占计数、也不触发 ------------------------------------------
{
	const counts = new Map();
	for (let i = 0; i < 20; i += 1) equal(stepQuip(counts, 'sleep'), null, `sleep 第 ${i + 1} 次都不说话`);
	check(counts.has('sleep') === false, 'sleep 不进计数表');
	equal(stepQuip(counts, 'calm')?.text ?? null, null, 'calm 第 1 次不触发');
	const calmSecond = stepQuip(counts, 'calm');
	equal(calmSecond?.text ?? null, '好闲啊', 'calm 第 2 次说「好闲啊」');
	equal(calmSecond?.voice ?? null, 'calm-2', 'calm 第 2 次配 quip-calm-2 录音');
}

// ---- 4. 表本身的自洽性 ------------------------------------------------------------
{
	const sprites = ['sleep', 'thinking', 'sword', 'sad', 'happy', 'calm', 'shy', 'angry', 'tired', 'polish', 'angry2', 'drag'];
	for (const [state, rules] of Object.entries(QUIPS)) {
		check(sprites.includes(state), `QUIPS 的 key「${state}」必须是合法状态`);
		check(Array.isArray(rules) && rules.length > 0, `${state} 至少有一条台词`);
		let last = 0;
		for (const rule of rules) {
			check(Number.isInteger(rule.at) && rule.at > last, `${state} 的 at 必须是递增正整数`);
			last = rule.at;
			check(typeof rule.text === 'string' && rule.text.trim() !== '', `${state} 的台词不能是空的`);
			if (rule.kind !== undefined) check(sprites.includes(rule.kind), `${state} 的 kind 必须是合法状态`);
			if (rule.voice !== undefined) check(VOICE_FILES[rule.voice] !== undefined, `${state} 的 voice「${rule.voice}」必须在 VOICE_FILES 里`);
		}
	}
	// 用户点名要求的那个例子：错误五次必须出现「气死我了」
	const angryRule = QUIPS.sad.find((rule) => rule.at === 5);
	check(angryRule !== undefined && angryRule.text.includes('气死我了'), 'sad 第 5 次的台词要包含「气死我了」');
}

// ---- 5. 台词引用的录音文件真的都在（别出现"有词没声"） ------------------------------
{
	const used = new Set();
	for (const rules of Object.values(QUIPS)) {
		for (const rule of rules) if (typeof rule.voice === 'string') used.add(rule.voice);
	}
	for (const key of used) {
		const file = VOICE_FILES[key];
		check(readFileSync(join(HERE, '..', 'assets', 'pet', file)) instanceof Buffer, `录音文件 ${file} 存在`);
	}
	// 情境台词专属录音不能混进"每 5~8 次播一次"的计数表（angry 这种状态录音本身就在表里，不算）
	const encounterSource = slice('const ENCOUNTER_STATES = new Set([', ']);');
	for (const key of used) {
		if (!VOICE_FILES[key].startsWith('quip-')) continue;
		check(encounterSource.includes(`'${key}'`) === false, `${key} 不该参与 5~8 计数`);
	}
}

// ---- 6. 连点分档：5 下生气、10 下气炸（之前第 5 下就把计数清了，永远数不到 10） ------
{
	const pokeSource = slice('function pokeStage(', '\n\t\t}');
	const pokeStage = new Function(`${pokeSource}; return pokeStage;`)();
	const config = { clickThreshold: 5, poke2Threshold: 10, shyThreshold: 3 };
	equal(pokeStage(1, config), 'none', '第 1 下 → 没反应');
	equal(pokeStage(2, config), 'none', '第 2 下 → 也没反应');
	equal(pokeStage(3, config), 'shy', '第 3 下 → 害羞');
	equal(pokeStage(4, config), 'shy', '第 4 下 → 害羞');
	equal(pokeStage(5, config), 'angry', '第 5 下 → 生气');
	for (const count of [6, 7, 8, 9]) {
		equal(pokeStage(count, config), 'hold', `第 ${count} 下 → 先憋着（不重复触发）`);
	}
	equal(pokeStage(10, config), 'angry2', '第 10 下 → 气炸二阶段');
	equal(pokeStage(12, config), 'angry2', '超过 10 下仍是气炸');
	// 没配 shyThreshold 的老配置也得能用（兜底 3）
	equal(pokeStage(1, { clickThreshold: 5, poke2Threshold: 10 }), 'none', '缺省 shyThreshold 时前两下也不动');
	// 关键回归点：第 5 下不能清空点击记录，否则第 6~9 下重新从 1 数，永远到不了 10
	check(/clickTimesRef\.current = recent/.test(SOURCE), '每次点击都把最新时间戳存回去');
	const angryBlock = SOURCE.slice(SOURCE.indexOf("if (stage === 'angry')"), SOURCE.indexOf("if (stage === 'hold')"));
	check(angryBlock.includes('clickTimesRef.current = []') === false, '生气那一档不能清空点击记录');
}

// ---- 7. 气泡排版（现在是圆角长方形，不再依赖云朵 path） ---------------------------
{
	const layoutSource = slice('function bubbleLayout(', '\n\t\t}');
	const bubbleLayout = new Function('clamp', `${layoutSource}; return bubbleLayout;`)(
		(value, lo, hi) => Math.min(Math.max(value, lo), hi),
	);
	const size = 280;
	const width = Math.round(size * (784 / 720)); // 305
	const short = bubbleLayout('耶✌️', size, width);
	equal(short.width, Math.round(width * 0.45), '三个字：没收自然宽度，落到最窄档（桌宠宽 0.45 倍）');
	check(Math.abs(short.left + short.width / 2 - width / 2) <= 1, '气泡水平居中');
	equal(short.bottom, Math.round(size * 0.88), '气泡底边在她头顶上方一点');
	check(short.fontSize >= 13 && short.fontSize <= 24, '字号夹在 13~24px');
	const long = bubbleLayout('你再戳一下试试，我绝对不放过你！', size, width);
	check(long.width > short.width, '字多就更宽');
	check(long.width <= Math.round(width * 1.7), '再长也不超过桌宠宽的 1.7 倍');
	equal(bubbleLayout('耶', 420, 458).fontSize, 24, '大号桌宠字号封顶 24');
	equal(bubbleLayout('耶', 80, 87).fontSize, 13, '小号桌宠字号兜底 13');
	// 云朵那套 SVG 必须彻底消失，否则旧样式会在 DOM 里留下一个看不见的框
	check(SOURCE.includes('sayaka-bubble svg') === false, '不再有云朵 SVG 样式');
	check(SOURCE.includes("h('svg'") === false, '不再渲染 SVG 云朵');
}

// ---- 8. 气炸之后只能续期 + 「每次变换都出声」开关 --------------------------------
{
	const heldSource = slice('function angry2Held(', '\n\t\t}');
	const angry2Held = new Function(`${heldSource}; return angry2Held;`)();
	const now = 1_000_000;
	check(angry2Held({ kind: 'angry2', until: now + 1 }, now) === true, '气炸期内 → 续期');
	check(angry2Held({ kind: 'angry2', until: now - 1 }, now) === false, '气炸过期 → 不算续期');
	check(angry2Held({ kind: 'angry', until: now + 1 }, now) === false, '普通生气不算气炸');
	check(angry2Held(null, now) === false, '没有反应 → false');
	// 续期判断必须排在"计数"前面，否则多点的那几下又会被算进 5/10 步
	const heldAt = SOURCE.indexOf('angry2Held(reactionRef.current, now)');
	const countAt = SOURCE.indexOf('const recent = clickTimesRef.current.filter');
	check(heldAt > 0 && countAt > 0 && heldAt < countAt, '气炸续期先于计数');
	// 「每次变换都出声」：设置项 + 白名单
	check(/instantVoice: raw\.instantVoice === true/.test(SOURCE), '设置里能存「每次变换都出声」');
	check(/settings\.instantVoice !== true/.test(SOURCE), '配音 effect 会读这个开关');
	const instantSource = slice('const INSTANT_STATES = new Set([', ']);');
	for (const key of ['sleep', 'sword', 'happy', 'sad', 'thinking', 'calm']) {
		check(instantSource.includes(`'${key}'`), `每次变换都出声覆盖 ${key}`);
	}
	check(instantSource.includes(`'shy'`) === false, '害羞不重复播（点一下已经有专属那句）');
	check(instantSource.includes(`'angry'`) === false, '生气/气炸不重复播（连点已经有专属那句）');
}

// ---- 9. 播下一段之前先截断上一段（不能两句话叠着说） ------------------------------
{
	const voiceSource = slice('const voice = (() => {', '})();');
	const made = [];
	class FakeAudio {
		constructor(url) {
			this.url = url;
			this.paused = true;
			this.currentTime = 0;
			this.playCalls = 0;
			made.push(this);
		}
		play() {
			this.paused = false;
			this.playCalls += 1;
			return Promise.resolve();
		}
		pause() {
			this.paused = true;
		}
	}
	let muted = false;
	const encounterStates = new Set(['sword', 'happy', 'sad', 'thinking', 'angry', 'sleep']);
	const voice = new Function(
		'VOICE_FILES', 'ASSET', 'settingsStore', 'VOICE_GAP_MIN', 'VOICE_GAP_MAX', 'ENCOUNTER_STATES', 'Audio',
		`${voiceSource}; return voice;`,
	)(
		VOICE_FILES, '/sayaka/asset/', { get: () => ({ muted }) }, 5, 8, encounterStates, FakeAudio,
	);
	voice.play('sword');
	const sword = made.find((item) => item.url.endsWith('sword.wav'));
	check(sword !== undefined && sword.playCalls === 1, '播拔刀');
	sword.currentTime = 1.4; // 假装放到一半
	voice.play('happy');
	const happy = made.find((item) => item.url.endsWith('happy.wav'));
	check(happy.playCalls === 1, '播高兴');
	check(sword.paused === true, '上一段被暂停');
	equal(sword.currentTime, 0, '上一段被拉回开头（截断）');
	check(happy.paused === false, '新的一段在放');
	// 同一段再播一次：只从头重放，不用先"暂停自己"
	happy.currentTime = 0.8;
	voice.play('happy');
	equal(happy.currentTime, 0, '同一段重播 → 从头开始');
	check(happy.playCalls === 2, '同一段重播只多播一次');
	// 静音时什么都不做，也不该去截断
	sword.currentTime = 0.6;
	muted = true;
	voice.play('sad');
	equal(sword.currentTime, 0.6, '静音时不动正在放的那段');
}

// ---- 10. 拖动：只换「被拖走」那张、不镜像 -----------------------------------------
{
	check(SOURCE.includes('dragMirror') === false, '镜像逻辑已移除');
	check(SOURCE.includes('is-mirrored') === false, '镜像样式已移除');
	// 删镜像时漏改过 setMirror：指针抬起时抛 ReferenceError，handlePoke 永远轮不到 → 点击完全没反应
	check(/setMirror|mirror\s*[:=]/.test(SOURCE) === false, '没有残留的镜像状态（否则点击会被打断）');
	check(/sprite === display \? ' is-on' : ''/.test(SOURCE), '精灵只按当前状态切可见性');
	check(SOURCE.includes("setDragging(true)"), '拖动开始换「被拖走」那张');
	check(SOURCE.includes("voice.play('drag')"), '拖动开始喊一声');
	// 抬指后没拖动过才算「点了一下」
	const upAt = SOURCE.indexOf('const handlePointerUp');
	const upEnd = SOURCE.indexOf('const now = Date.now();', upAt);
	const upBlock = upAt > 0 && upEnd > upAt ? SOURCE.slice(upAt, upEnd) : '';
	check(upAt > 0 && upBlock.includes('handlePoke()'), '没拖动就抬手 → 算点了一下');
}

console.log(`情境台词自测：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
