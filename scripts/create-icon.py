"""Render the existing PH brand mark as a Windows multi-resolution icon."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

assets = Path(__file__).resolve().parents[1] / "assets"
assets.mkdir(exist_ok=True)
size = 1024
image = Image.new("RGBA", (size, size))
mask = Image.new("L", image.size)
ImageDraw.Draw(mask).rounded_rectangle((32, 32, 992, 992), radius=260, fill=255)
gradient = Image.new("RGBA", image.size)
pixels = gradient.load()
for y in range(size):
    for x in range(size):
        fraction = (x + y) / (2 * (size - 1))
        pixels[x, y] = tuple(round(a + (b - a) * fraction) for a, b in zip((117, 137, 244), (75, 96, 215))) + (255,)
image.paste(gradient, (0, 0), mask)
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("C:/Windows/Fonts/seguisb.ttf", 420)
draw.text((size / 2, size / 2), "PH", font=font, fill="white", anchor="mm")
image.save(assets / "icon.png")
image.save(assets / "icon.ico", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
with Image.open(assets / "icon.ico") as icon:
    assert (256, 256) in icon.ico.sizes()
print("Created assets/icon.png and assets/icon.ico")
