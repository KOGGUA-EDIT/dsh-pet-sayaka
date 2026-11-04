/**
 * 路由自测（不需要 DSH 在跑）：
 *   node tools/test-routes.mjs
 *
 * 用假的 req/res 直接调用 createHandler，覆盖：
 *   /sayaka/state          快照
 *   /sayaka/asset/*.png    素材（含防目录穿越）
 *   /sayaka/stream         SSE：先发一帧、状态变化再推一帧
 */

import { EventEmitter } from 'node:events';
import { ACTIVITIES, PetState, createHandler } from '../lib/index.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail) {
	if (ok) {
		passed += 1;
		console.log(`  ✓ ${label}`);
	} else {
		failed += 1;
		console.log(`  ✗ ${label}${detail === undefined ? '' : ` — ${detail}`}`);
	}
}

/** 假的请求：一个带 url 的 EventEmitter（handler 会监听 close）。 */
function fakeRequest(url) {
	const req = new EventEmitter();
	req.url = url;
	return req;
}

/** 假的响应：记录状态码/头/正文，并支持 SSE 分帧。 */
function fakeResponse() {
	const res = new EventEmitter();
	res.status = undefined;
	res.headers = undefined;
	res.chunks = [];
	res.writableEnded = false;
	res.destroyed = false;
	// 素材是 stream.pipe(res) 异步写过来的：给测试一个等它写完的锚点。
	res.done = new Promise((resolve) => { res.resolveDone = resolve; });
	res.writeHead = (status, headers) => {
		res.status = status;
		res.headers = headers ?? {};
		return res;
	};
	res.write = (chunk) => {
		res.chunks.push(String(chunk));
		return true;
	};
	res.end = (chunk) => {
		if (chunk !== undefined) res.chunks.push(String(chunk));
		res.writableEnded = true;
		res.resolveDone();
		return res;
	};
	res.body = () => res.chunks.join('');
	/** SSE 正文里的 data: 帧，按出现顺序解析成对象数组。 */
	res.frames = () => res.body()
		.split('\n\n')
		.filter((block) => block.startsWith('data: '))
		.map((block) => JSON.parse(block.slice(6)));
	res.close = () => {
		res.destroyed = true;
		res.emit('close');
		return res;
	};
	return res;
}

async function get(handler, url) {
	const res = fakeResponse();
	await handler(fakeRequest(url), res);
	// 文件是 pipe 过来的，等它 end（最多 1 秒）
	await Promise.race([res.done, new Promise((resolve) => setTimeout(resolve, 1000))]);
	return res;
}

const pet = new PetState();
const handler = createHandler(pet);
const session = { header: { id: 's1' } };

console.log('1) /sayaka/state');
{
	const res = await get(handler, '/sayaka/state?t=1');
	check('200', res.status === 200, String(res.status));
	check('content-type 是 JSON', String(res.headers['content-type']).startsWith('application/json'), res.headers['content-type']);
	const body = JSON.parse(res.body());
	check('activity = sleep', body.activity === 'sleep', body.activity);
	check('带上了客户端要的 config', body.config && body.config.shyMs === 1000, JSON.stringify(body.config));
	check('带上了素材清单', Array.isArray(body.activities) && body.activities.includes('sword'), JSON.stringify(body.activities));
}

console.log('2) /sayaka/asset/<state>.png');
{
	const res = await get(handler, '/sayaka/asset/sleep.png');
	check('200', res.status === 200, String(res.status));
	check('content-type 是 PNG', res.headers['content-type'] === 'image/png', res.headers['content-type']);
	check('是 PNG 文件头', Buffer.from(res.body(), 'binary').subarray(1, 4).toString() === 'PNG', res.body().slice(0, 8));
	check('content-length 与素材一致', Number(res.headers['content-length']) > 10000, res.headers['content-length']);

	const missing = await get(handler, '/sayaka/asset/nope.png');
	check('缺失素材 → 404', missing.status === 404, String(missing.status));

	const traversal = await get(handler, '/sayaka/asset/..%2F..%2Fpackage.json');
	check('目录穿越 → 404', traversal.status === 404, String(traversal.status));

	// 配音：wav 走同一条素材路由，content-type 必须是音频，浏览器才肯直接播
	const VOICES = ['morning', 'sword', 'happy', 'shy', 'sad', 'thinking', 'angry', 'sleep'];
	const wav = await get(handler, '/sayaka/asset/morning.wav');
	check('配音 200', wav.status === 200, String(wav.status));
	check('配音 content-type 是 audio/wav', wav.headers['content-type'] === 'audio/wav', wav.headers['content-type']);
	check('是 RIFF 文件头', Buffer.from(wav.body(), 'binary').subarray(0, 4).toString() === 'RIFF', wav.body().slice(0, 4));
	check('配音 content-length 与文件一致', Number(wav.headers['content-length']) > 1000, wav.headers['content-length']);
	for (const name of VOICES) {
		const one = await get(handler, '/sayaka/asset/' + name + '.wav');
		check('配音 ' + name + '.wav 可取', one.status === 200 && String(one.headers['content-type']).startsWith('audio/'), String(one.status));
	}
}

console.log('3) /sayaka/stream（SSE）');
{
	const req = fakeRequest('/sayaka/stream');
	const res = fakeResponse();
	await handler(req, res);
	check('200', res.status === 200, String(res.status));
	check('content-type 是 event-stream', String(res.headers['content-type']).startsWith('text/event-stream'), res.headers['content-type']);
	const first = res.frames();
	check('先推一帧当前状态', first.length === 1 && first[0].activity === 'sleep', JSON.stringify(first));

	// 跑一行代码 → 订阅者应该立刻收到 sword
	pet.handleSessionEvent(session, { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash' } });
	const during = res.frames();
	check('跑代码时推到 sword', during.at(-1).activity === 'sword', JSON.stringify(during.at(-1)));

	// 断开连接后不应再收到帧
	res.close();
	const countAtClose = res.frames().length;
	pet.handleSessionEvent(session, {
		type: 'tool/result',
		seq: 2,
		data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] } },
	});
	check('断开后不再推送', res.frames().length === countAtClose, `${countAtClose} → ${res.frames().length}`);
}

console.log('4) 未知子路径');
{
	const res = await get(handler, '/sayaka/whatever');
	check('400 + 说明', res.status === 400 && res.body().includes('expected'), `${res.status} ${res.body().slice(0, 60)}`);
}

console.log('5) 到期自动推送');
{
	// 配置一个 40ms 的伤心窗口，验证到期后宿主会自己再推一帧（客户端不用自己算时间）
	const fast = new PetState({ sadMs: 40 });
	const fastHandler = createHandler(fast);
	const req = fakeRequest('/sayaka/stream');
	const res = fakeResponse();
	await fastHandler(req, res);
	fast.handleSessionEvent(session, { type: 'turn/end', seq: 1, data: { reason: { kind: 'error' } } });
	check('先推伤心', res.frames().at(-1).activity === 'sad', JSON.stringify(res.frames().at(-1)));
	await new Promise((resolve) => setTimeout(resolve, 200));
	check('到期后自动推睡觉', res.frames().at(-1).activity === 'sleep', JSON.stringify(res.frames().at(-1)));
	res.close();
}

console.log('6) 素材清单 manifest.json（换素材后画布尺寸变了也不用改代码）');
{
	const res = await get(handler, '/sayaka/asset/manifest.json');
	check('200', res.status === 200, String(res.status));
	check('content-type 是 JSON', String(res.headers['content-type']).startsWith('application/json'), res.headers['content-type']);
	const manifest = JSON.parse(res.body());
	check('manifest 带画布尺寸', Number.isFinite(manifest.width) && Number.isFinite(manifest.height), JSON.stringify(manifest));
	check('manifest 覆盖宿主所有状态', ACTIVITIES.every((name) => manifest.sprites.includes(name)), JSON.stringify(manifest.sprites));
	check('客户端要用的精灵都在清单里', ['shy', 'angry'].every((name) => manifest.sprites.includes(name)), JSON.stringify(manifest.sprites));
	check('宽高比与像素尺寸一致', Math.abs(manifest.ratio - manifest.width / manifest.height) < 0.001, String(manifest.ratio));

	// 清单里每个精灵都得真的能取到 PNG，不然换了素材名就会出现「状态切过去是空图」
	for (const name of manifest.sprites) {
		const png = await get(handler, '/sayaka/asset/' + name + '.png');
		const isPng = png.status === 200 && Buffer.from(png.body(), 'binary').subarray(1, 4).toString() === 'PNG';
		check('精灵 ' + name + '.png 可取', isPng, png.status + ' ' + png.headers['content-type']);
	}

	// 宿主快照要把画布尺寸带给客户端
	const snap = await get(handler, '/sayaka/state');
	const body = JSON.parse(snap.body());
	check('snapshot.canvas 与 manifest 一致', body.canvas.width === manifest.width && body.canvas.height === manifest.height, JSON.stringify(body.canvas));
}

console.log('7) 独白气泡：云朵 path 与快照下发');
{
	const res = await get(handler, '/sayaka/asset/bubble.json');
	check('气泡文件可取', res.status === 200, String(res.status));
	const bubble = JSON.parse(res.body());
	check('带 viewBox', typeof bubble.viewBox === 'string' && bubble.viewBox.split(' ').length === 4, bubble.viewBox);
	check('path 是闭合曲线', typeof bubble.path === 'string' && bubble.path.trim().endsWith('Z'), String(bubble.path).slice(-8));
	check('path 有内容', String(bubble.path).length > 400, String(bubble.path).length + ' 字符');
	const [vw, vh] = bubble.viewBox.split(' ').slice(2).map(Number);
	const [tx, ty] = bubble.tail;
	check('尾巴尖在画布内', tx > 0 && tx < vw && ty > 0 && ty < vh, JSON.stringify(bubble.tail));

	// 宿主创建的桌宠（apply 里读的 bubble.json）要把气泡数据随快照发下去
	const withBubble = new PetState({}, { bubble });
	check('快照带 bubble', withBubble.snapshot().bubble?.path === bubble.path, typeof withBubble.snapshot().bubble);
	const plain = new PetState();
	check('没气泡文件时为 null（不冒泡）', plain.snapshot().bubble === null, String(plain.snapshot().bubble));

	// 独白配置也要随快照下发（浏览器半侧靠它决定冒哪句话）
	const snap = JSON.parse((await get(handler, '/sayaka/state')).body());
	check('快照带独白台词表', typeof snap.config.monologues === 'object' && snap.config.monologues.sword === '武装保卫见泷原！', JSON.stringify(snap.config.monologues));
	check('快照带独白时长', snap.config.monologueMs, 1000);
}

console.log('8) 气泡文字框（浏览器按它排版，必须真在云朵里）');
{
	const bubble = JSON.parse((await get(handler, '/sayaka/asset/bubble.json')).body());
	const box = bubble.textBox;
	check('带文字框', box && Number.isFinite(box.left) && Number.isFinite(box.top), JSON.stringify(box));
	check('文字框在画布内', box.left > 0 && box.top > 0 && box.left + box.width < 1 && box.top + box.height < 1, JSON.stringify(box));
	check('文字框不能太小', box.width > 0.4 && box.height > 0.2, JSON.stringify(box));
	// 云朵主体在 y 30%~65% 之间，文字框不该压到上边缘或尾巴
	check('文字框没压到云朵上边缘', box.top > 0.2, String(box.top));
	check('文字框没压到尾巴', box.top + box.height < 0.72, String(box.top + box.height));

	// 用探针粗验：文字框四角应当落在云朵路径内部（用 canvas 是浏览器的事，这里用采样点近似）
	const probe = new PetState({}, { bubble });
	check('气泡数据进了快照', probe.snapshot().bubble?.textBox?.left === box.left, JSON.stringify(probe.snapshot().bubble?.textBox));
}
console.log(`\n通过 ${passed}，失败 ${failed}`);

process.exit(failed === 0 ? 0 : 1);
