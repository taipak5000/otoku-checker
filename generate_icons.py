"""アプリアイコンを生成する。
「得」の字を、青→エメラルドのグラデーション背景に白抜きで置いた
シンプルなアイコン。any 用(角丸)と maskable 用(フルブリード+余白多め)を作る。
"""
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_INDEX = 0  # Noto Sans CJK JP Bold

COLOR_TOP = (10, 124, 255)      # #0a7cff
COLOR_BOTTOM = (0, 189, 140)    # #00bd8c
GLYPH_COLOR = (255, 255, 255, 255)


def make_gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = round(COLOR_TOP[0] * (1 - t) + COLOR_BOTTOM[0] * t)
        g = round(COLOR_TOP[1] * (1 - t) + COLOR_BOTTOM[1] * t)
        b = round(COLOR_TOP[2] * (1 - t) + COLOR_BOTTOM[2] * t)
        for x in range(size):
            # ついでに軽い斜め成分も足して単調すぎないようにする
            t2 = ((x + y) / max(size * 2 - 2, 1))
            rr = round(r * (1 - t2 * 0.15) + COLOR_BOTTOM[0] * (t2 * 0.15))
            px[x, y] = (rr, g, b)
    return img


def rounded_mask(size, radius_ratio=0.225):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def draw_glyph(base, size, glyph_scale):
    draw = ImageDraw.Draw(base)
    font_size = int(size * glyph_scale)
    font = ImageFont.truetype(FONT_PATH, font_size, index=FONT_INDEX)
    text = "得"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=GLYPH_COLOR)
    return base


def make_icon(size, maskable=False):
    grad = make_gradient(size)
    glyph_scale = 0.46 if maskable else 0.56
    rgba = grad.convert("RGBA")
    draw_glyph(rgba, size, glyph_scale)
    if maskable:
        return rgba  # フルブリード(角丸なし、OS側でマスクされる)
    mask = rounded_mask(size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(rgba, (0, 0), mask)
    return out


if __name__ == "__main__":
    import os
    os.makedirs("icons", exist_ok=True)

    make_icon(192).save("icons/icon-192.png")
    make_icon(512).save("icons/icon-512.png")
    make_icon(180).save("icons/icon-180.png")
    make_icon(32).save("icons/icon-32.png")
    make_icon(192, maskable=True).save("icons/icon-192-maskable.png")
    make_icon(512, maskable=True).save("icons/icon-512-maskable.png")
    print("done")
