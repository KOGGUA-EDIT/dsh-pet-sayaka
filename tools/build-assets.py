# -*- coding: utf-8 -*-
"""素材归一化脚本 —— 把原始 PNG 处理成插件的 assets/pet/<state>.png

【为什么需要它】
原始立绘尺寸各不相同，而且每张里角色的高度也不一样。直接丢给浏览器会出现两个问题：
  1. object-fit: contain 按"最小缩放比"适配，宽高比不同 → 角色忽大忽小；
  2. 各图重心/脚底位置不同 → 换状态时角色上下跳动。
所以这里把所有状态铺到同一张公共画布（784×720）上：按**内容高度**等比缩放，
水平居中、垂直贴底（脚底对齐）。这样换表情时她不会变大变小、也不会跳。

【用法】（需要 Pillow，DSH 自带的那份 Python 就有）
    python tools/build-assets.py "D:/app edit/sayaka" "D:/app edit/sayaka/dsh-pet-sayaka/assets/pet"
    python tools/build-assets.py "..." "..." --only tired,polish     # 只重做某几张

第一个参数是原始素材目录，第二个是输出目录。

【和 tools/build-assets.mjs 的关系】
.mjs 是早期版本（依赖 sharp，按原始画布尺寸等比缩放，对"画布里角色本来就小"的
素材不友好）。现在以本脚本为准；.mjs 只留给没有 Python 的环境做应急。
"""

import sys
from pathlib import Path

from PIL import Image

CANVAS_W, CANVAS_H = 784, 720
BOTTOM_MARGIN = 6
ALPHA_CUTOFF = 32  # alpha 低于这个值当透明（抗锯齿边缘不算内容）

# 状态 → (原始文件名, 目标内容高度)
# 目标高度是照着现有精灵量出来的：站姿 570~600，睡姿（躺着）只有 372，
# 伤心那张头发散得高一点（675）。新素材按同样的高度摆，才不会一换表情就缩水。
SOURCES = {
	'sleep': ('sayaka-睡觉.png', 372),
	'thinking': ('sayaka-思考.png', 584),
	'sword': ('sayaka-拔刀.png', 572),
	'sad': ('sayaka-伤心.png', 675),
	'shy': ('sayaka-害羞.png', 583),
	'angry': ('sayaka-生气.png', 598),
	'happy': ('sayaka-高兴.png', 578),
	'calm': ('sayaka-平常心.png', 582),
	'tired': ('sayaka-累倒.png', 590),
	'polish': ('sayaka-惬意擦剑.png', 570),
	'angry2': ('sayaka-生气2阶段.png', 600),
	'drag': ('sayaka-拖拽.png', 560),
}


def content_box(image: Image.Image):
	"""不透明内容的包围盒。"""
	alpha = image.getchannel('A')
	mask = alpha.point(lambda value: 255 if value > ALPHA_CUTOFF else 0)
	return mask.getbbox()


def build(state: str, src_dir: Path, out_dir: Path) -> None:
	src_name, target_h = SOURCES[state]
	src = Image.open(src_dir / src_name).convert('RGBA')
	box = content_box(src)
	if box is None:
		raise SystemExit(f'{src_name} 没有不透明内容，检查是不是丢了透明通道')
	content_h = box[3] - box[1]

	scale = target_h / content_h
	size = (max(1, round(src.width * scale)), max(1, round(src.height * scale)))
	scaled = src.resize(size, Image.LANCZOS)

	# 缩放后内容盒跟着等比缩放，据此把内容底边贴到画布底部、水平居中
	box_scaled = tuple(round(value * scale) for value in box)
	left = round(CANVAS_W / 2 - (box_scaled[0] + box_scaled[2]) / 2)
	left = max(0, min(CANVAS_W - scaled.width, left))
	top = CANVAS_H - BOTTOM_MARGIN - box_scaled[3]

	canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
	canvas.alpha_composite(scaled, (left, top))
	# 调色板量化（255 色 + 抖动）：RGBA 直存一张 380~450KB，量化后只有 65~80KB，
	# 桌宠显示尺寸就 280px 上下，肉眼几乎看不出差别。
	quantized = canvas.quantize(colors=255, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
	out = out_dir / f'{state}.png'
	quantized.save(out, 'PNG', optimize=True, compress_level=9)
	print(f'{state:9s} <- {src_name:20s} 内容高 {content_h} -> {target_h}  偏移 ({left},{top})  {out.stat().st_size / 1024:.0f}KB')


def main() -> None:
	argv = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
	only = None
	for arg in sys.argv[1:]:
		if arg.startswith('--only='):
			only = {name.strip() for name in arg.split('=', 1)[1].split(',') if name.strip()}

	src_dir = Path(argv[0] if argv else '.').resolve()
	out_dir = Path(argv[1] if len(argv) > 1 else src_dir / 'dsh-pet-sayaka' / 'assets' / 'pet').resolve()
	out_dir.mkdir(parents=True, exist_ok=True)

	for state in SOURCES:
		if only is not None and state not in only:
			continue
		build(state, src_dir, out_dir)

	# manifest.json：宿主据此拿画布尺寸，浏览器据此算展示框宽高比
	manifest = out_dir / 'manifest.json'
	if only is None or not manifest.exists():
		import json

		manifest.write_text(
			json.dumps(
				{
					'width': CANVAS_W,
					'height': CANVAS_H,
					'ratio': round(CANVAS_W / CANVAS_H, 6),
					'sprites': list(SOURCES),
				},
				ensure_ascii=False,
				indent=2,
			)
			+ '\n',
			encoding='utf-8',
		)
		print(f'manifest.json：{CANVAS_W}×{CANVAS_H}，精灵 {", ".join(SOURCES)}')

	print(f'\n完成：{out_dir}')


if __name__ == '__main__':
	main()
