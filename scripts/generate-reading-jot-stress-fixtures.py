#!/usr/bin/env python3
"""Generate deterministic OCR stress fixtures from Pocket Earth's original reading sample."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests/fixtures/reading-jot/underline-crop.png"
OUTPUT = ROOT / "tests/fixtures/reading-jot/stress"


def fit_canvas(image: Image.Image, size: tuple[int, int], background=(244, 242, 236)) -> Image.Image:
    canvas = Image.new("RGB", size, background)
    x = (size[0] - image.width) // 2
    y = (size[1] - image.height) // 2
    canvas.paste(image, (x, y))
    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size

    reduced = source.resize((round(width * 0.52), round(height * 0.52)), Image.Resampling.BILINEAR)
    blur = reduced.resize(source.size, Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(1.1))
    blur.save(OUTPUT / "blur.png", quality=92)

    glare_mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(glare_mask)
    draw.polygon([
        (round(width * 0.28), -20), (round(width * 0.52), -20),
        (round(width * 0.72), height + 20), (round(width * 0.48), height + 20),
    ], fill=185)
    glare_mask = glare_mask.filter(ImageFilter.GaussianBlur(24))
    glare = Image.composite(Image.new("RGB", source.size, "white"), source, glare_mask)
    glare.save(OUTPUT / "glare.png", quality=92)

    rotated = source.rotate(7.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(232, 230, 224))
    skew = fit_canvas(rotated, (rotated.width + 60, rotated.height + 36))
    skew.save(OUTPUT / "skew.png", quality=92)

    small_text = source.resize((round(width * 0.34), round(height * 0.34)), Image.Resampling.LANCZOS)
    small = fit_canvas(small_text, (1200, 520), (246, 245, 241))
    small.save(OUTPUT / "small-text.png", quality=92)

    gray = source.convert("L").convert("RGB")
    low_contrast = ImageEnhance.Contrast(gray).enhance(0.32)
    low_contrast = Image.blend(low_contrast, Image.new("RGB", source.size, (242, 242, 239)), 0.46)
    low_contrast = low_contrast.filter(ImageFilter.GaussianBlur(0.35))
    low_contrast.save(OUTPUT / "low-contrast.png", quality=92)

    for path in sorted(OUTPUT.glob("*.png")):
        with Image.open(path) as image:
            print(f"{path.relative_to(ROOT)} {image.width}x{image.height}")


if __name__ == "__main__":
    main()
