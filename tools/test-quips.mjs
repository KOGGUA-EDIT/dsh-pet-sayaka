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

// eslint-disable-next-line no-new-func
const factory = new Function(`${quipsSource}\n${stepSource}\nreturn { QUIPS, stepQuip };`);
const { QUIPS, stepQuip } = factory();

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
	equal(s()?.text ?? null, '又错了…', 'sad 第 2 次说「又错了…」');
	equal(s(), null, 'sad 第 3 次不触发');
	equal(s(), null, 'sad 第 4 次不触发');
	const angry = s();
	equal(angry?.text ?? null, '气死我了！！！', 'sad 第 5 次说「气死我了！！！」');
	equal(angry?.kind ?? null, 'angry', 'sad 第 5 次顺手切生气表情');
	equal(angry?.voice ?? null, 'angry', 'sad 第 5 次配 angry 录音');
	equal(s(), null, 'sad 第 6 次不触发');
	equal(s(), null, 'sad 第 7 次不触发');
	equal(s(), null, 'sad 第 8 次不触发');
	equal(s()?.text ?? null, '今天是不是不太顺啊', 'sad 第 9 次说「今天是不是不太顺啊」');
	equal(counts.get('sad'), 0, 'sad 数到最后一档后归零');
	equal(s(), null, '重置后第 1 次重新不触发');
	equal(s()?.text ?? null, '又错了…', '重置后第 2 次又回到「又错了…」');
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
	equal(stepQuip(counts, 'happy')?.text ?? null, '今天手感不错嘛', 'happy 第 5 次说「今天手感不错嘛」');
	equal(counts.get('happy'), 0, 'happy 数到最后一档后归零');
}

// ---- 3. 没有台词的状态不占计数、也不触发 ------------------------------------------
{
	const counts = new Map();
	for (let i = 0; i < 20; i += 1) equal(stepQuip(counts, 'sleep'), null, `sleep 第 ${i + 1} 次都不说话`);
	check(counts.has('sleep') === false, 'sleep 不进计数表');
	equal(stepQuip(counts, 'calm')?.text ?? null, null, 'calm 第 1 次不触发');
	equal(stepQuip(counts, 'calm')?.text ?? null, '好闲啊', 'calm 第 2 次说「好闲啊」');
}

// ---- 4. 表本身的自洽性 ------------------------------------------------------------
{
	const sprites = ['sleep', 'thinking', 'sword', 'sad', 'happy', 'calm', 'shy', 'angry'];
	const voices = ['morning', 'sword', 'happy', 'shy', 'sad', 'thinking', 'angry', 'sleep'];
	for (const [state, rules] of Object.entries(QUIPS)) {
		check(sprites.includes(state), `QUIPS 的 key「${state}」必须是合法状态`);
		check(Array.isArray(rules) && rules.length > 0, `${state} 至少有一条台词`);
		let last = 0;
		for (const rule of rules) {
			check(Number.isInteger(rule.at) && rule.at > last, `${state} 的 at 必须是递增正整数`);
			last = rule.at;
			check(typeof rule.text === 'string' && rule.text.trim() !== '', `${state} 的台词不能是空的`);
			if (rule.kind !== undefined) check(sprites.includes(rule.kind), `${state} 的 kind 必须是合法状态`);
			if (rule.voice !== undefined) check(voices.includes(rule.voice), `${state} 的 voice 必须是已有的录音`);
		}
	}
	// 用户点名要求的那个例子：错误五次必须出现「气死我了」
	const angryRule = QUIPS.sad.find((rule) => rule.at === 5);
	check(angryRule !== undefined && angryRule.text.includes('气死我了'), 'sad 第 5 次的台词要包含「气死我了」');
}

console.log(`情境台词自测：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
