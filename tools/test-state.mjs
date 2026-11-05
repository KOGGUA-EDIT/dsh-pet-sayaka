/**
 * 状态机自测 —— 不需要 DSH 也能跑：
 *   node tools/test-state.mjs
 *
 * 覆盖用户提出的全部规则：没事睡觉 / 跑代码拔刀 / 报错伤心 5 秒 /
 * 跑成功高兴 5 秒 / 第一次跑完代码后平常心一分钟（之后睡觉）。
 */

import { PetState, readToolResult, runFailed } from '../lib/index.js';

let failed = 0;
let passed = 0;

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		passed += 1;
		console.log(`  ✓ ${label}`);
	} else {
		failed += 1;
		console.log(`  ✗ ${label}\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`);
	}
}

/** 造一个会话对象 / 事件。 */
const session = { header: { id: 's1' } };
const call = (callId, name) => ({ type: 'tool/call', seq: 1, data: { callId, name, arguments: '{}' } });
const result = (callId, text, extra = {}) => ({
	type: 'tool/result',
	seq: 2,
	data: { message: { toolCallId: callId, content: [{ type: 'text', text }] }, ...extra },
});

/** 只要活动名，忽略 until。 */
const act = (pet, now) => pet.activityAt(now ?? Date.now()).activity;

console.log('1) 没事就睡觉');
{
	const pet = new PetState();
	check('初始状态', act(pet), 'sleep');
	// 非"跑代码"的工具不给拔刀：改文件、搜索都算"没事"
	pet.handleSessionEvent(session, call('c1', 'str_replace_editor'));
	check('改代码工具不触发', act(pet), 'sleep');
	pet.handleSessionEvent(session, call('c2', 'skill_search'));
	check('搜索工具不触发', act(pet), 'sleep');
}

console.log('2) 跑代码就拔刀');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	check('bash 开始 → 拔刀', act(pet), 'sword');
	const until = pet.activityAt().until;
	check('拔刀没有自动过期', until, null);
	pet.handleSessionEvent(session, call('c2', 'pwsh'));
	check('两个并发跑仍拔刀', act(pet), 'sword');
	pet.handleSessionEvent(session, result('c1', 'ok'));
	check('收工一个还在拔刀', act(pet), 'sword');
}

console.log('3) 跑成功 → 高兴 5 秒');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	pet.handleSessionEvent(session, result('c1', 'hello\n'));
	const { activity, until } = pet.activityAt();
	check('成功 → 高兴', activity, 'happy');
	const remaining = until - Date.now();
	check('高兴大约 5 秒', remaining > 4800 && remaining <= 5000, true);
	check('高兴过期 → 平常心（第一次跑）', act(pet, until + 1), 'calm');
}

console.log('4) 第一次跑完代码后的空闲 → 平常心一分钟 → 睡觉');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	pet.handleSessionEvent(session, result('c1', 'done'));
	const calm = pet.activityAt(Date.now() + 5200);
	check('高兴过后是平常心', calm.activity, 'calm');
	const calmLeft = calm.until - Date.now();
	check('平常心约 60 秒', calmLeft > 58000 && calmLeft <= 60000, true);
	check('平常心结束后睡觉', act(pet, calm.until + 1), 'sleep');
	// 第二次跑代码不再有平常心
	pet.handleSessionEvent(session, call('c9', 'bash'));
	pet.handleSessionEvent(session, result('c9', 'done again'));
	const now = Date.now();
	const second = pet.activityAt(now + 5200);
	check('第二次跑完直接睡觉', second.activity, 'sleep');
}

console.log('5) 有错误就伤心 5 秒');
{
	// 非零退出：dsh 的 bash 把失败写在正文的 [exit code: N] 标记里
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	pet.handleSessionEvent(session, result('c1', 'boom\n[exit code: 1]'));
	const { activity, until } = pet.activityAt();
	check('非零退出 → 伤心', activity, 'sad');
	const left = until - Date.now();
	check('伤心大约 5 秒', left > 4800 && left <= 5000, true);

	// isError
	const pet2 = new PetState();
	pet2.handleSessionEvent(session, call('c1', 'bash'));
	pet2.handleSessionEvent(session, { type: 'tool/result', seq: 2, data: { message: { toolCallId: 'c1', content: [], isError: true } } });
	check('isError → 伤心', act(pet2), 'sad');

	// 超时 / 被杀
	check('超时标记算失败', runFailed(result('c1', '[timed out after 30000ms]')), true);
	check('被杀标记算失败', runFailed(result('c1', '[killed by signal: SIGKILL]')), true);
	check('零退出不算失败', runFailed(result('c1', 'all good\n[exit code: 0]')), false);

	// 整轮失败（模型报错 / 超长）
	const pet3 = new PetState();
	pet3.handleSessionEvent(session, { type: 'turn/end', seq: 9, data: { reason: { kind: 'error' } } });
	check('回合报错 → 伤心', act(pet3), 'sad');
	const pet4 = new PetState();
	pet4.handleSessionEvent(session, { type: 'turn/end', seq: 9, data: { reason: { kind: 'max-tokens' } } });
	check('超长结束 → 伤心', act(pet4), 'sad');
	// 正常结束 → 累倒 5 秒（不是伤心）；用户中止 / 等待批准都不该有反应
	const pet6 = new PetState();
	pet6.handleSessionEvent(session, { type: 'turn/end', seq: 9, data: { reason: { kind: 'completed' } } });
	check('completed → 累倒', act(pet6), 'tired');
	const tiredLeft = pet6.activityAt().until - Date.now();
	check('累倒大约 5 秒', tiredLeft > 4800 && tiredLeft <= 5000, true);
	check('累倒过期 → 睡觉', act(pet6, pet6.activityAt().until + 1), 'sleep');
	for (const kind of ['aborted', 'blocked']) {
		const pet5 = new PetState();
		pet5.handleSessionEvent(session, { type: 'turn/end', seq: 9, data: { reason: { kind } } });
		check(`${kind} → 不伤心也不累倒`, act(pet5), 'sleep');
	}
}

console.log('6) 新一次跑代码会顶掉上一轮的情绪');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	pet.handleSessionEvent(session, result('c1', '[exit code: 1]'));
	check('先伤心', act(pet), 'sad');
	pet.handleSessionEvent(session, call('c2', 'bash'));
	check('新运行 → 拔刀', act(pet), 'sword');
	pet.handleSessionEvent(session, result('c2', 'ok'));
	check('这次成功 → 高兴', act(pet), 'happy');
}

console.log('7) 没还回来的调用不会让桌宠一直拔刀');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, call('c1', 'bash'));
	check('拔刀中', act(pet), 'sword');
	pet.disposeSession({ id: 's1' });
	check('会话销毁后回睡觉', act(pet), 'sleep');
	// 其它会话不受影响
	const pet2 = new PetState();
	pet2.handleSessionEvent({ header: { id: 'a' } }, call('x', 'bash'));
	pet2.disposeSession({ id: 'b' });
	check('别的会话销毁不影响', act(pet2), 'sword');
}

console.log('8) 子 Agent 开关');
{
	const sub = { header: { id: 'sub', origin: 'subagent' } };
	const pet = new PetState({ includeSubagents: false });
	pet.handleSessionEvent(sub, call('c1', 'bash'));
	check('默认不跟随子 Agent', act(pet), 'sleep');
	const pet2 = new PetState({ includeSubagents: true });
	pet2.handleSessionEvent(sub, call('c1', 'bash'));
	check('打开后跟随', act(pet2), 'sword');
}

console.log('9) 关掉插件后的行为');
{
	const pet = new PetState({ enabled: false });
	pet.handleSessionEvent(session, call('c1', 'bash'));
	check('enabled:false 时不动', act(pet), 'sleep');
}

console.log('10) 快照字段（浏览器半侧依赖）');
{
	const pet = new PetState();
	const snap = pet.snapshot();
	check('snapshot.activity', typeof snap.activity, 'string');
	check('snapshot.config.size', typeof snap.config.size, 'number');
	check('snapshot.config.clickThreshold', snap.config.clickThreshold, 5);
	check('snapshot.config.shyThreshold', snap.config.shyThreshold, 3);
	check('snapshot.rev', typeof snap.rev, 'number');
	check('snapshot.stats.events', typeof snap.stats.events, 'number');
}

console.log('11) 真实事件信封（从 DSH 会话日志里抓的原文）');
{
	// dsh 0.1.2 的信封：{type,turn,step,message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId,isError,content:[…]}],role,id}}
	// 外加 sourceEventSeqs 回指 tool/call 的 seq。
	const call012 = {
		type: 'tool/call',
		seq: 63,
		time: 1789407284819,
		data: { turn: 1, step: 1, callId: 'call_00_JwSYXSCMzwhpdGNY5lQ17718', name: 'bash', arguments: '{"command": "echo sayaka-pet-test"}' },
	};
	const result012 = (text, isError = false) => ({
		type: 'tool/result',
		seq: 64,
		time: 1789407284885,
		data: {
			turn: 1,
			step: 1,
			message: {
				source: { kind: 'tool', callId: 'call_00_JwSYXSCMzwhpdGNY5lQ17718' },
				content: [{
					type: 'tool-result',
					toolCallId: 'call_00_JwSYXSCMzwhpdGNY5lQ17718',
					content: [{ type: 'text', text }],
					isError,
				}],
				role: 'user',
				id: 'd1fb9064-3d30-4aa4-9ab3-2917866cfd92',
			},
		},
		sourceEventSeqs: [63],
		surfaceOp: 'append',
	});

	check('0.1.2 信封能读出 callId', readToolResult(result012('ok')).callId, 'call_00_JwSYXSCMzwhpdGNY5lQ17718');
	check('0.1.2 信封能读出正文（嵌套一层）', readToolResult(result012('sayaka-pet-test\n')).text.trim(), 'sayaka-pet-test');
	check('0.1.2 信封能读出 isError', readToolResult(result012('boom', true)).isError, true);

	// 跑成功：拔刀 → 高兴（这次一定要落地，不能卡在拔刀）
	const ok = new PetState();
	ok.handleSessionEvent(session, call012);
	check('0.1.2：开始跑 → 拔刀', act(ok), 'sword');
	ok.handleSessionEvent(session, result012('sayaka-pet-test\n'));
	check('0.1.2：跑成功 → 高兴', act(ok), 'happy');
	check('0.1.2：没有卡在拔刀', ok.running.size, 0);

	// 跑失败：非零退出的标记藏在嵌套正文里
	const bad = new PetState();
	bad.handleSessionEvent(session, call012);
	bad.handleSessionEvent(session, result012('boom\n[exit code: 1]'));
	check('0.1.2：非零退出 → 伤心', act(bad), 'sad');

	// isError 也在嵌套层
	const err = new PetState();
	err.handleSessionEvent(session, call012);
	err.handleSessionEvent(session, result012('spawn failed', true));
	check('0.1.2：isError → 伤心', act(err), 'sad');
}

console.log('12) 认领结果的兜底逻辑');
{
	// ① 结果里完全没有 callId：靠 sourceEventSeqs 指回 seq
	const a = new PetState();
	a.handleSessionEvent(session, { type: 'tool/call', seq: 7, data: { callId: 'c7', name: 'bash' } });
	a.handleSessionEvent(session, { type: 'tool/result', seq: 8, data: { sourceEventSeqs: [7], message: { content: [{ type: 'text', text: 'ok' }] } } });
	check('靠 seq 认领', act(a), 'happy');

	// ② 什么都没有，但会话里只剩这一个在跑的调用
	const b = new PetState();
	b.handleSessionEvent(session, { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash' } });
	b.handleSessionEvent(session, { type: 'tool/result', seq: 2, data: { message: { content: [{ type: 'text', text: 'ok' }] } } });
	check('靠"只剩一个"认领', act(b), 'happy');

	// ③ 两个并发调用 + 无 callId 的结果：不猜，保持拔刀（另一个还在跑）
	const c = new PetState();
	c.handleSessionEvent(session, { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash' } });
	c.handleSessionEvent(session, { type: 'tool/call', seq: 2, data: { callId: 'c2', name: 'bash' } });
	c.handleSessionEvent(session, { type: 'tool/result', seq: 3, data: { message: { content: [{ type: 'text', text: 'ok' }] } } });
	check('并发 + 无 callId → 不乱切', act(c), 'sword');

	// ④ 普通工具的结果不该被误认成跑代码
	const d = new PetState();
	d.handleSessionEvent(session, { type: 'tool/call', seq: 1, data: { callId: 'r1', name: 'str_replace_editor' } });
	d.handleSessionEvent(session, { type: 'tool/result', seq: 2, data: { sourceEventSeqs: [1], message: { content: [{ type: 'text', text: 'ok' }] } } });
	check('非跑代码工具 → 不反应', act(d), 'sleep');
}

console.log('13) 旧信封（dsh 0.1.0）仍然要能用');
{
	const old = new PetState();
	old.handleSessionEvent(session, { type: 'tool/call', seq: 1, data: { callId: 'legacy', name: 'bash' } });
	old.handleSessionEvent(session, { type: 'tool/result', seq: 2, data: { message: { toolCallId: 'legacy', content: [{ type: 'text', text: 'done\n[exit code: 0]' }] } } });
	check('旧信封 → 高兴', act(old), 'happy');
}

console.log('14) 思考状态（turn/start → turn/end）');
{
	const pet = new PetState();
	pet.handleSessionEvent(session, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	check('开回合 → 思考', act(pet), 'thinking');
	check('思考不会自己过期', pet.activityAt().until, null);

	// 读文件这类非「跑代码」的工具不该把思考顶掉
	pet.handleSessionEvent(session, call('r1', 'str_replace_editor'));
	check('思考期间用别的工具 → 还在思考', act(pet), 'thinking');
	pet.handleSessionEvent(session, result('r1', 'ok'));

	// 跑代码时拔刀优先；跑完先给情绪、再回到思考
	pet.handleSessionEvent(session, call('c1', 'bash'));
	check('思考期间跑代码 → 拔刀', act(pet), 'sword');
	pet.handleSessionEvent(session, result('c1', 'ok'));
	check('跑完 → 先高兴', act(pet), 'happy');
	check('高兴过期 → 回到思考（回合还没结束）', act(pet, Date.now() + 6000), 'thinking');

	pet.handleSessionEvent(session, { type: 'turn/end', seq: 9, data: { reason: { kind: 'completed' } } });
	check('回合结束 → 先累倒', act(pet), 'tired');
	check('累倒过期 → 平常心（这是第一次跑完）', act(pet, Date.now() + 6000), 'calm');

	// 第二个回合结束：累倒 → 睡觉（平常心只给第一次）
	pet.handleSessionEvent(session, { type: 'turn/start', seq: 10, data: { turn: 2 } });
	check('第二回合 → 思考', act(pet), 'thinking');
	pet.handleSessionEvent(session, { type: 'turn/end', seq: 11, data: { reason: { kind: 'completed' } } });
	check('第二回合结束 → 累倒', act(pet), 'tired');
	check('第二回合累倒完 → 睡觉', act(pet, Date.now() + 70000), 'sleep');
}

console.log('14b) 累倒的配置与「另一个会话还在跑就不瘫」');
{
	const pet = new PetState({ tiredMs: 8000 });
	pet.handleSessionEvent(session, { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } });
	const left = pet.activityAt().until - Date.now();
	check('tiredMs 可覆盖', left > 7800 && left <= 8000, true);
	check('activityAt 带截止时间', typeof pet.activityAt().until, 'number');

	// 另一个会话还在思考：这一轮结束不该让她瘫在那儿
	const a = new PetState();
	const other = { header: { id: 's2' } };
	a.handleSessionEvent(other, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	a.handleSessionEvent(session, { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } });
	check('还有会话在跑 → 不累倒', act(a), 'thinking');

	const snap = new PetState().snapshot();
	check('ACTIVITIES 含累倒', snap.activities.includes('tired'), true);
	check('snapshot.config.tiredMs', snap.config.tiredMs, 5000);
	check('snapshot.config.poke2Threshold', snap.config.poke2Threshold, 10);
	check('snapshot.config.angry2Ms', snap.config.angry2Ms, 6000);
	check('累倒台词', snap.config.monologues.tired, '呼…累死了');
}

console.log('15) 思考状态的兜底与清理');
{
	// 没收到 turn/start 时，assistant/chunk 也能把思考点起来
	const a = new PetState();
	a.handleSessionEvent(session, { type: 'assistant/chunk', seq: 1, data: {} });
	check('assistant/chunk → 思考', act(a), 'thinking');
	a.handleSessionEvent(session, { type: 'turn/end', seq: 2, data: { reason: { kind: 'aborted' } } });
	check('回合中止 → 不再思考', act(a), 'sleep');

	// 会话销毁要清掉思考，否则会一直思考下去
	const b = new PetState();
	b.handleSessionEvent(session, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	b.disposeSession({ id: 's1' });
	check('会话销毁 → 不再思考', act(b), 'sleep');

	// 并发会话：一个结束不该把另一个的思考一起关掉
	const c = new PetState();
	const other = { header: { id: 's2' } };
	c.handleSessionEvent(session, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	c.handleSessionEvent(other, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	c.handleSessionEvent(session, { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } });
	check('另一个会话还在思考', act(c), 'thinking');

	// 子 Agent 开关同样作用于思考
	const sub = { header: { id: 'sub', origin: 'subagent' } };
	const d = new PetState({ includeSubagents: false });
	d.handleSessionEvent(sub, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	check('不跟随子 Agent 时子回合不算思考', act(d), 'sleep');

	// 快照带上画布信息（浏览器半侧据此算展示框宽高比）
	check('snapshot.canvas.width', typeof new PetState().snapshot().canvas.width, 'number');
	check('snapshot.stats.turns', typeof new PetState().snapshot().stats.turns, 'number');
}

console.log('16) 独白配置');
{
	const snap = new PetState().snapshot();
	check('默认独白时长 1 秒', snap.config.monologueMs, 1000);
	check('思考台词', snap.config.monologues.thinking, 'emmmmm');
	check('拔刀台词', snap.config.monologues.sword, '武装保卫见泷原！');
	check('伤心台词', snap.config.monologues.sad, '呜呜呜');
	check('害羞台词', snap.config.monologues.shy, '不要这样啦');
	check('生气台词', snap.config.monologues.angry, '我生气了！！！');
	check('高兴台词', snap.config.monologues.happy, '耶✌️');
	check('平常心台词', snap.config.monologues.calm, '快来吧');
	check('睡觉不说话', snap.config.monologues.sleep, '');

	// 只覆盖一句时，其余键要保留默认（逐键合并）
	const custom = new PetState({ monologueMs: 2000, monologues: { thinking: '让我想想…' } }).snapshot();
	check('覆盖单独一句', custom.config.monologues.thinking, '让我想想…');
	check('其余台词不受影响', custom.config.monologues.sword, '武装保卫见泷原！');
	check('时长可覆盖', custom.config.monologueMs, 2000);
}
console.log('17) 残留清理（"状态变了但桌宠不变"的根因）');
{
	// 一次 tool/call 永远等不到结果（回合被中断 / 结果事件丢了）：不能让她一直举着刀
	const a = new PetState();
	a.handleSessionEvent(session, call('c-leak', 'pwsh'));
	check('泄漏的调用先算拔刀', act(a), 'sword');
	a.running.get('c-leak').since = Date.now() - 200000; // 假装已经卡了 200 秒
	a.sweep();
	check('超过 runStaleMs 后清掉', a.running.size, 0);
	check('清掉后不再拔刀', act(a), 'sleep');
	check('清理有计数', a.snapshot().stats.swept, 1);

	// 回合结束：该会话还在"跑"的调用不可能再有结果，立刻清掉
	const b = new PetState();
	b.handleSessionEvent(session, call('c-turn', 'bash'));
	b.handleSessionEvent(session, { type: 'turn/end', seq: 2, data: { reason: { kind: 'aborted' } } });
	check('回合中止 → 在跑列表清空', b.running.size, 0);

	// 结果里没带 callId，但带了工具名：同名的只有一个就认它
	const c = new PetState();
	c.handleSessionEvent(session, call('c-bash', 'bash'));
	c.handleSessionEvent(session, call('c-pwsh', 'pwsh'));
	c.handleSessionEvent(session, {
		type: 'tool/result',
		seq: 9,
		data: { message: { name: 'pwsh', content: [{ type: 'text', text: 'ok' }] } },
	});
	check('按工具名认领 pwsh', c.running.has('c-pwsh'), false);
	check('另一个 bash 还在跑', c.running.has('c-bash'), true);

	// 思考标记也有超时：turn/end 丢了不能永远思考下去
	const d = new PetState();
	d.handleSessionEvent(session, { type: 'turn/start', seq: 1, data: { turn: 1 } });
	d.thinking.set('s1', Date.now() - 2000000);
	d.sweep();
	check('思考超时被清掉', act(d), 'sleep');

	// 诊断字段：卡住时能从 /sayaka/state 看出来
	const e = new PetState();
	e.handleSessionEvent(session, call('c-age', 'bash'));
	e.running.get('c-age').since = Date.now() - 30000;
	const stats = e.snapshot().stats;
	check('stats.running', stats.running, 1);
	check('stats.thinking', stats.thinking, 0);
	check('stats.oldestRunMs 能看出卡了多久', stats.oldestRunMs >= 29000, true);
}

console.log(`\n通过 ${passed}，失败 ${failed}`);

process.exit(failed === 0 ? 0 : 1);
