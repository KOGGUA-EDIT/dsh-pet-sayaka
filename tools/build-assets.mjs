/**
 * 素材归一化脚本 —— 把原始 PNG 处理成插件的 assets/pet/<state>.png
 *
 * 为什么需要它：原始素材尺寸各不相同（1254×1254 / 1024×1536 / 1672×941 …），
 * 直接丢给浏览器会出现两个问题：
 *   1. object-fit: contain 会按"最小缩放比"适配，宽高比不同 → 角色忽大忽小；
 *   2. 各图的重心/脚底位置不同 → 状态切换时角色上下跳动。
 * 所以这里把所有状态铺到同一张"公共画布"上：水平居中、垂直贴底（脚底对齐），
 * 再整体降到展示尺寸，顺便把体积压下来。
 *
 * 用法（需要 sharp；DSH 客户端自带）：
 *   node tools/build-assets.mjs "D:/app edit/sayaka" "D:/app edit/sayaka/dsh-pet-sayaka/assets/pet"
 * 第一个参数是原始素材目录，第二个是输出目录。
 */

import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';

// sharp 是原生模块：优先用本机装的，找不到就退回 DSH 客户端自带的。
const require = createRequire(import.meta.url);
function loadSharp() {
	const candidates = [
		'sharp',
		process.env.DSH_APP_SHARP,
		process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Deepseek Harness EAC', 'resources', 'app', 'node_modules', 'sharp'),
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

/** 状态 → 原始文件名。改素材时只需要动这张表。 */
const SOURCES = {
	sleep: 'sayaka-睡觉.png',
	thinking: 'sayaka-思考.png',
	sword: 'sayaka-拔刀.png',
	sad: 'sayaka-伤心.png',
	shy: 'sayaka-害羞.png',
	angry: 'sayaka-生气.png',
	happy: 'sayaka-高兴.png',
	calm: 'sayaka-平常心.png',
};

/** 公共画布的高度（px）。展示高度约 260~320 CSS px，720 足够清晰又轻量。 */
const CANVAS_HEIGHT_TARGET = 720;

async function main() {
	const srcDir = resolve(process.argv[2] ?? '.');
	const outDir = resolve(process.argv[3] ?? join(srcDir, 'dsh-pet-sayaka', 'assets', 'pet'));
	mkdirSync(outDir, { recursive: true });

	// 第一遍：读元数据，算出公共画布（各图原始尺寸的最大值），画布宽高比即展示框宽高比。
	const items = [];
	for (const [state, file] of Object.entries(SOURCES)) {
		const path = join(srcDir, file);
		if (!statSync(path, { throwIfNoEntry: false })) throw new Error(`缺少素材：${path}`);
		const meta = await sharp(path).metadata();
		items.push({ state, path, width: meta.width, height: meta.height });
	}
	const canvasW = Math.max(...items.map((item) => item.width));
	const canvasH = Math.max(...items.map((item) => item.height));
	const scale = CANVAS_HEIGHT_TARGET / canvasH;
	const outW = Math.round(canvasW * scale);
	const outH = Math.round(canvasH * scale);

	console.log(`公共画布 ${canvasW}×${canvasH} → 输出 ${outW}×${outH}`);

	for (const item of items) {
		// 分两步：sharp 的管线顺序是固定的（resize 在 extend 之前），链式写会先缩放
		// 再补边，尺寸就错了。所以先 extend 出公共画布，再单独 resize。
		// 铺画布：水平居中、垂直贴底（脚底对齐，切状态不跳）。
		const padded = await sharp(item.path)
			.extend({
				top: canvasH - item.height,
				bottom: 0,
				left: Math.round((canvasW - item.width) / 2),
				right: canvasW - item.width - Math.round((canvasW - item.width) / 2),
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.png()
			.toBuffer();
		const out = join(outDir, `${item.state}.png`);
		// 画布与输出同宽高比 → 这里的缩放是等比的（fill 只是为了不被二次 contain 缩进）。
		await sharp(padded)
			.resize(outW, outH, { fit: 'fill' })
			.png({ compressionLevel: 9, palette: true, quality: 92, effort: 8 })
			.toFile(out);
		const { size } = statSync(out);
		console.log(`${item.state.padEnd(8)} ← ${basename(item.path).padEnd(20)} ${outW}×${outH}  ${(size / 1024).toFixed(0)}KB`);
	}

	// manifest.json：宿主半侧读它拿画布尺寸，浏览器半侧据此算展示框宽高比。
	// 这样换素材导致画布尺寸变化时不用改代码。
	const manifest = {
		width: outW,
		height: outH,
		ratio: Number((outW / outH).toFixed(6)),
		sprites: Object.keys(SOURCES),
	};
	await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
	console.log(`画布 ${outW}×${outH}（宽高比 ${manifest.ratio}）｜精灵 ${manifest.sprites.join(', ')}`);
	console.log(`\n完成：${outDir}`);
}

await main();
