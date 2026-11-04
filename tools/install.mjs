/**
 * 安装 / 卸载 / 自检脚本 —— 把本插件接到 DSH 的 profile 上。
 *
 * 为什么要这个脚本：
 *   重装 DSH（或换机器、换 profile）之后，profile 目录可能被重建，
 *   接线（依赖 + bundle 条目 + node_modules 软链）会丢。插件源码本身在
 *   DSH 之外，不需要动 —— 跑一下这个脚本就恢复。
 *
 * 用法：
 *   node tools/install.mjs                 # 装到默认 profile（web-desktop）
 *   node tools/install.mjs --profile web    # 装到别的 profile
 *   node tools/install.mjs --status         # 只看当前接线状态，不改任何东西
 *   node tools/install.mjs --uninstall      # 摘掉接线（源码不动）
 *   node tools/install.mjs --home D:\path   # 指定 DSH_HOME（默认 ~/.dsh 或环境变量 DSH_HOME）
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'dsh-pet-sayaka';
/** 插件源码目录 = 本文件所在 tools/ 的上一级。 */
const PLUGIN_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 解析命令行参数。 */
function parseArgs(argv) {
	const options = { home: process.env.DSH_HOME || join(homedir(), '.dsh'), profile: 'web-desktop', action: 'install' };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--home') options.home = resolve(argv[++i] ?? '');
		else if (arg === '--profile') options.profile = argv[++i] ?? 'web-desktop';
		else if (arg === '--status' || arg === '--check') options.action = 'status';
		else if (arg === '--uninstall' || arg === '--remove') options.action = 'uninstall';
		else if (arg === '--help' || arg === '-h') options.action = 'help';
	}
	return options;
}

const options = parseArgs(process.argv.slice(2));

if (options.action === 'help') {
	console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').trim());
	process.exit(0);
}

const profileDir = join(options.home, 'profiles', options.profile);
const manifestPath = join(profileDir, 'package.json');
const modulesDir = join(profileDir, 'node_modules');
const linkPath = join(modulesDir, PACKAGE_NAME);

/** pnpm/Node 都认的 link 说明：正斜杠，避免 JSON 里转义。 */
const linkSpec = `link:${PLUGIN_DIR.replace(/\\/g, '/')}`;

function fail(message, hint) {
	console.error(`✗ ${message}`);
	if (hint !== undefined) console.error(`  ${hint}`);
	process.exit(1);
}

function readManifest() {
	if (!existsSync(manifestPath)) return undefined;
	try {
		return JSON.parse(readFileSync(manifestPath, 'utf8'));
	} catch (error) {
		fail(`读不了 profile 的 package.json：${error.message}`);
	}
	return undefined;
}

/** 看看当前接线状态（不修改任何东西）。 */
function inspect() {
	const manifest = readManifest();
	const dependency = manifest?.dependencies?.[PACKAGE_NAME];
	const inBundles = Array.isArray(manifest?.dsh?.profile?.bundles) && manifest.dsh.profile.bundles.includes(PACKAGE_NAME);
	// 软链状态：顺着它 realpath 到本插件的 package.json 才算好
	let linkState = '缺失';
	let linked = false;
	try {
		lstatSync(linkPath);
		linked = true;
	} catch {
		linked = false;
	}
	if (linked) {
		try {
			const pointed = realpathSync(join(linkPath, 'package.json')).toLowerCase();
			const mine = realpathSync(join(PLUGIN_DIR, 'package.json')).toLowerCase();
			linkState = pointed === mine ? '指向本插件' : '存在但指向别处';
		} catch {
			linkState = '存在但读不到目标（断链？）';
		}
	}
	return { manifest, dependency, inBundles, linkState };
}

if (!existsSync(profileDir)) {
	fail(`找不到 profile 目录：${profileDir}`, '先启动一次 DSH 让它生成 profile（或换 --profile / --home）。');
}

const current = inspect();

if (options.action === 'status') {
	console.log(`DSH_HOME   : ${options.home}`);
	console.log(`profile    : ${options.profile}  (${profileDir})`);
	console.log(`插件源码   : ${PLUGIN_DIR}`);
	console.log(`依赖声明   : ${current.dependency === linkSpec ? '✓ ' + linkSpec : current.dependency === undefined ? '✗ 没写进 dependencies' : '△ 指向别处：' + current.dependency}`);
	console.log(`bundle 列表 : ${current.inBundles ? '✓ 已包含' : '✗ 不在 dsh.profile.bundles 里'}`);
	console.log(`node_modules 软链 : ${current.linkState === '指向本插件' ? '✓ ' + linkPath : '✗ ' + current.linkState}`);
	const ok = current.dependency === linkSpec && current.inBundles && current.linkState === '指向本插件';
	console.log(ok ? '\n=> 接线完整。改完代码只要重启 Web 服务。' : '\n=> 接线不完整，跑 `node tools/install.mjs` 修好。');
	process.exit(ok ? 0 : 1);
}

if (options.action === 'uninstall') {
	const manifest = current.manifest;
	let changed = false;
	if (manifest !== undefined) {
		if (manifest.dependencies?.[PACKAGE_NAME] !== undefined) {
			delete manifest.dependencies[PACKAGE_NAME];
			if (Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies;
			changed = true;
		}
		const bundles = manifest.dsh?.profile?.bundles;
		if (Array.isArray(bundles) && bundles.includes(PACKAGE_NAME)) {
			manifest.dsh.profile.bundles = bundles.filter((name) => name !== PACKAGE_NAME);
			changed = true;
		}
		if (changed) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
	if (existsSync(linkPath)) {
		rmSync(linkPath, { recursive: true, force: true });
		changed = true;
	}
	console.log(changed ? '✓ 已摘掉接线（插件源码没动）。重启 Web 服务生效。' : '· 本来就没装。');
	process.exit(0);
}

// ── 安装（幂等）─────────────────────────────────────────────────────────
const manifest = current.manifest ?? { name: `dsh-profile-${options.profile}`, private: true };
manifest.dependencies = { ...(manifest.dependencies ?? {}), [PACKAGE_NAME]: linkSpec };
const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : [];
if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME);
manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ 依赖与 bundle 条目已写入 ${manifestPath}`);

mkdirSync(modulesDir, { recursive: true });
if (existsSync(linkPath)) rmSync(linkPath, { recursive: true, force: true });
try {
	symlinkSync(PLUGIN_DIR, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
	console.log(`✓ 软链已建：${linkPath} → ${PLUGIN_DIR}`);
} catch (error) {
	fail(`建软链失败：${error.message}`, 'Windows 上可以手动执行：mklink /J "<上面那个路径>" "<插件目录>"');
}

console.log('\n接下来：DSH 标题栏「⋯」→ 重启 Web 服务（首次装完必须重启；之后改代码也只需这一步）。');
