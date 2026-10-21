"""按 Logo.tsx 的枢纽设计重绘应用中台图标：icon.png (1024) + icon.ico (多尺寸)"""
from PIL import Image, ImageDraw
import math

SS = 4               # 超采样倍数
SIZE = 512
S = SIZE * SS
K = S / 48           # 48 网格 -> 像素

# 极光渐变三停点
STOPS = [(0.0, (168, 85, 247)), (0.52, (106, 92, 255)), (1.0, (63, 140, 255))]

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient_color(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t0 <= t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]

# 1) 对角渐变底板（沿 左上->右下 轴）
img = Image.new('RGB', (S, S))
px = img.load()
for y in range(S):
    for x in range(0, S, 4):  # 每 4 像素采样后填充，加速
        t = (x + y) / (2 * S)
        c = gradient_color(t)
        for dx in range(4):
            if x + dx < S:
                px[x + dx, y] = c

# 2) 圆角蒙版
mask = Image.new('L', (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, S - 1, S - 1], radius=round(11.5 * K), fill=255)

# 3) 顶部光泽
sheen = Image.new('L', (S, S), 0)
sp = sheen.load()
for y in range(round(24 * K)):
    alpha = round(82 * (1 - y / (24 * K)))
    for x in range(0, S, 8):
        for dx in range(8):
            if x + dx < S:
                sp[x + dx, y] = alpha
white = Image.new('RGB', (S, S), (255, 255, 255))
img.paste(white, (0, 0), sheen)

img = img.convert('RGBA')
img.putalpha(mask)

d = ImageDraw.Draw(img, 'RGBA')

def pt(x, y):
    return (x * K, y * K)

# 4) 枢纽连线（50% 白）
center = pt(24, 24)
sats = [pt(24, 11.4), pt(13, 30.4), pt(35, 30.4)]
for s in sats:
    d.line([center, s], fill=(255, 255, 255, 128), width=round(3.4 * K))

# 5) 卫星节点（92% 白）
for s in sats:
    r = 3.6 * K
    d.ellipse([s[0] - r, s[1] - r, s[0] + r, s[1] + r], fill=(255, 255, 255, 235))

# 6) 中心枢纽：白环 + 紫芯
r = 5.6 * K
d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=(255, 255, 255, 255))
r2 = 2.4 * K
d.ellipse([center[0] - r2, center[1] - r2, center[0] + r2, center[1] + r2], fill=(106, 92, 255, 255))

# 7) 缩小输出
icon = img.resize((SIZE, SIZE), Image.LANCZOS)
icon.save('assets/icon.png')

# 8) 多尺寸 ICO
icon.save('assets/icon.ico', format='ICO',
          sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# 9) 预览小图
icon.resize((128, 128), Image.LANCZOS).save('scripts/logo-preview-128.png')
print('done: assets/icon.png, assets/icon.ico')
