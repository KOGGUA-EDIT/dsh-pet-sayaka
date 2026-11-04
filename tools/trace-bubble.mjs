/**
 * 云朵气泡描摹脚本 —— 把一张"云形对话气泡"位图描成 SVG path。
 *
 * 干什么：
 *   1. 找出图片里的云（内部是纯白，外面是棋盘格底）；
 *   2. 取中心连通块 → 形态学膨胀一点（让描边中线落在原来的描边位置上）；
 *   3. Moore 邻域边界跟踪 → 按弧长均匀重采样 → Catmull-Rom 转三次贝塞尔；
 *   4. 尾巴尖、最高点这类极值点会被"钉住"，并用直线段保住尖角（否则样条会把尾巴抹圆）；
 *   5. 输出 JSON（viewBox / path / 描边样式 / 尾尖位置），宿主半侧读它下发给浏览器。
 *
 * 用法（需要 sharp；DSH 客户端自带）：
 *   node tools/trace-bubble.mjs "云.png" "assets/pet/bubble.json"
 *
 * 想调整形状：动 K（采样点数，越多越贴合、path 越长）、R（膨胀半径）、CORNER（拐角判定角度）。
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
function loadSharp() {
	const candidates = [
		'sharp',
		process.env.DSH_APP_SHARP,
		process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Programs', 'Deepseek Harness EAC', 'resources', 'app', 'node_modules', 'sharp'),
	].filter(Boolean);
	for (const candidate of candidates) {
		try {
			return require(candidate);
		} catch {
			/* 换下一个候选 */
		}
	}
	throw new Error('找不到 sharp：请先 `npm i sharp`，或设置 DSH_APP_SHARP 指向客户端自带的 sharp。');
}

const sharp = loadSharp();

/** 参数：可用环境变量覆盖，方便调形。 */
const K = Number(process.env.BUBBLE_POINTS ?? 56);       // 采样点数
const DILATE = Number(process.env.BUBBLE_DILATE ?? 3);   // 膨胀半径（px）
const CORNER_DEG = Number(process.env.BUBBLE_CORNER ?? 62); // 拐角判定角（度）

const srcPath = resolve(process.argv[2] ?? 'cloud.png');
const outPath = resolve(process.argv[3] ?? 'assets/pet/bubble.json');

const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
const luminance = (x, y) => {
	const i = (y * W + x) * C;
	return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
};

// ── 1) 云内部掩膜（纯白）取中心连通块 ────────────────────────────────────
const white = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (luminance(x, y) >= 253) white[y * W + x] = 1;
const mask = new Uint8Array(W * H);
{
	// 中心点可能落在描边/文字上，向外找一个白点当种子
	let seed = -1;
	const cx = Math.floor(W / 2);
	const cy = Math.floor(H / 2);
	for (let r = 0; r < Math.max(W, H) && seed < 0; r++) {
		for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r]]) {
			const x = cx + dx;
			const y = cy + dy;
			if (x > 0 && y > 0 && x < W && y < H && white[y * W + x]) {
				seed = y * W + x;
				break;
			}
		}
	}
	if (seed < 0) throw new Error('图里没找到纯白的云内部（是不是没有白底云？）');
	const queue = [seed];
	mask[seed] = 1;
	while (queue.length > 0) {
		const p = queue.pop();
		const x = p % W;
		const y = (p - x) / W;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
			const np = ny * W + nx;
			if (mask[np] || !white[np]) continue;
			mask[np] = 1;
			queue.push(np);
		}
	}
}

// ── 2) 膨胀（把 path 推到描边中线上） ────────────────────────────────────
function dilate(source, radius) {
	const out = new Uint8Array(W * H);
	const disk = [];
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= radius * radius) disk.push([dx, dy]);
	}
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			if (!source[y * W + x]) continue;
			for (const [dx, dy] of disk) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
			}
		}
	}
	return out;
}

// ── 3) 边界跟踪 ────────────────────────────────────────────────────────
function traceOutline(source) {
	let start = -1;
	for (let p = 0; p < W * H && start < 0; p++) if (source[p]) start = p;
	if (start < 0) throw new Error('掩膜是空的');
	const sx = start % W;
	const sy = (start - sx) / W;
	const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && source[y * W + x] ? 1 : 0);
	const neighbours = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
	const points = [[sx, sy]];
	let cx = sx;
	let cy = sy;
	let dir = 6;
	for (let guard = 0; guard < 400000; guard++) {
		let found = false;
		for (let k = 0; k < 8; k++) {
			const d = (dir + 6 + k) % 8;
			const nx = cx + neighbours[d][0];
			const ny = cy + neighbours[d][1];
			if (at(nx, ny)) {
				cx = nx;
				cy = ny;
				dir = d;
				points.push([cx, cy]);
				found = true;
				break;
			}
		}
		if (!found) break;
		if (cx === sx && cy === sy && points.length > 8) break;
	}
	return points;
}

/** 按弧长均匀重采样成 count 个点（闭合）。 */
function resample(points, count) {
	const n = points.length;
	const lengths = [];
	let total = 0;
	for (let i = 0; i < n; i++) {
		const a = points[i];
		const b = points[(i + 1) % n];
		const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
		lengths.push(d);
		total += d;
	}
	const out = [];
	let target = 0;
	let walked = 0;
	for (let i = 0; i < n && out.length < count; i++) {
		while (target <= walked + lengths[i] && out.length < count) {
			const t = lengths[i] === 0 ? 0 : (target - walked) / lengths[i];
			const a = points[i];
			const b = points[(i + 1) % n];
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
			target += total / count;
		}
		walked += lengths[i];
	}
	return out;
}

/** 转角大于阈值的点算拐角（尾巴尖），配直线段保住尖角。 */
function corners(points, degrees) {
	const n = points.length;
	const flags = new Array(n).fill(false);
	for (let i = 0; i < n; i++) {
		const p0 = points[(i - 1 + n) % n];
		const p1 = points[i];
		const p2 = points[(i + 1) % n];
		const a = [p1[0] - p0[0], p1[1] - p0[1]];
		const b = [p2[0] - p1[0], p2[1] - p1[1]];
		const la = Math.hypot(a[0], a[1]);
		const lb = Math.hypot(b[0], b[1]);
		if (la === 0 || lb === 0) continue;
		const cos = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
		const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
		if (angle > degrees) flags[i] = true;
	}
	return flags;
}

/** 闭合 Catmull-Rom → 三次贝塞尔 path。 */
function toPath(points, flags) {
	const n = points.length;
	const at = (i) => points[(i + n) % n];
	const isCorner = (i) => flags[(i + n) % n];
	const round = (v) => Math.round(v);
	let d = `M ${round(at(0)[0])} ${round(at(0)[1])}`;
	for (let i = 0; i < n; i++) {
		const p0 = at(i - 1);
		const p1 = at(i);
		const p2 = at(i + 1);
		const p3 = at(i + 2);
		// 拐角两侧走直线，避免样条把尖角抹圆
		if (isCorner(i) || isCorner(i + 1)) {
			d += ` L ${round(p2[0])} ${round(p2[1])}`;
			continue;
		}
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p2[0])} ${round(p2[1])}`;
	}
	return `${d} Z`;
}

/**
 * 算云朵里能放文字的最大内接矩形（逐行取左右边界的交集，枚举上下边找面积最大者）。
 * 文字必须落在这个矩形里才不会压到云朵边缘 —— 字号就是按它算的。
 * 用的是没膨胀过的"纯白内部"掩膜，再按 8% 内缩留出描边和字形边距的余量。
 * @returns 归一化到 0~1 的 { left, top, width, height }
 */
function inscribedTextBox(source, insetRatio = 0.08) {
	const left = new Int32Array(H).fill(-1);
	const right = new Int32Array(H).fill(-1);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			if (!source[y * W + x]) continue;
			if (left[y] < 0) left[y] = x;
			right[y] = x;
		}
	}
	let best = { area: 0, left: 0, right: 0, top: 0, bottom: 0 };
	for (let top = 0; top < H; top++) {
		if (left[top] < 0) continue;
		let minLeft = left[top];
		let minRight = right[top];
		for (let bottom = top; bottom < H; bottom++) {
			if (left[bottom] < 0) break;
			if (left[bottom] > minLeft) minLeft = left[bottom];
			if (right[bottom] < minRight) minRight = right[bottom];
			if (minRight <= minLeft) break;
			const area = (minRight - minLeft + 1) * (bottom - top + 1);
			if (area > best.area) best = { area, left: minLeft, right: minRight, top, bottom };
		}
	}
	if (best.area === 0) throw new Error('云朵内部太小，找不到能放文字的位置');
	const width = best.right - best.left + 1;
	const height = best.bottom - best.top + 1;
	const inset = Math.round(Math.min(width, height) * insetRatio);
	const round = (v) => Math.round(v * 10000) / 10000;
	return {
		left: round((best.left + inset) / W),
		top: round((best.top + inset) / H),
		width: round((width - 2 * inset) / W),
		height: round((height - 2 * inset) / H),
	};
}

const outline = traceOutline(dilate(mask, DILATE));
const samples = resample(outline, K);

// 极值点钉住：均匀采样有可能正好跳过尾巴尖，那样气泡就"秃"了
const extremes = [
	outline.reduce((a, b) => (b[1] > a[1] ? b : a), outline[0]), // 最低点 = 尾巴尖
	outline.reduce((a, b) => (b[1] < a[1] ? b : a), outline[0]), // 最高点
];
for (const point of extremes) {
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < samples.length; i++) {
		const distance = Math.hypot(samples[i][0] - point[0], samples[i][1] - point[1]);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	samples[best] = [point[0], point[1]];
}

const path = toPath(samples, corners(samples, CORNER_DEG));
const tail = extremes[0];

const payload = {
	viewBox: `0 0 ${W} ${H}`,
	width: W,
	height: H,
	/** 能放文字的最大内接矩形（归一化）—— 浏览器半侧按它排版并算字号。 */
	textBox: inscribedTextBox(mask),
	/** 尾巴尖在 viewBox 里的位置 —— 浏览器半侧靠它把气泡尖对准桌宠的头顶。 */
	tail: [tail[0], tail[1]],
	fill: '#ffffff',
	stroke: '#4a4a4a',
	strokeWidth: 5,
	path,
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`描摹完成：${K} 个采样点 → path ${path.length} 字符`);
console.log(`画布 ${W}×${H}，尾尖 (${tail[0]}, ${tail[1]})`);
console.log(`文字框 ${(payload.textBox.width * W).toFixed(0)}×${(payload.textBox.height * H).toFixed(0)}px @ (${(payload.textBox.left * W).toFixed(0)}, ${(payload.textBox.top * H).toFixed(0)})`);
console.log(`输出：${outPath}`);
