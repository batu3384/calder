#!/usr/bin/env python3
"""Generate Calder dock icon from geometric mark geometry."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT_PNG = ROOT / 'build' / 'icon.png'
SIZE = 1024
BG = (15, 16, 17, 255)  # #0f1011
MARK = (111, 154, 166, 255)  # #6f9aa6
RADIUS = 224  # ~22% rounded square


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
  x0, y0, x1, y1 = box
  draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


def main() -> None:
  img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
  draw = ImageDraw.Draw(img)
  # Dock icon plate
  rounded_rect(draw, (0, 0, SIZE - 1, SIZE - 1), RADIUS, BG)

  # Mark geometry scaled from 32x32 viewBox → inset ~28%
  inset = int(SIZE * 0.28)
  scale = (SIZE - 2 * inset) / 32

  def sx(x: float) -> float:
    return inset + x * scale

  def sy(y: float) -> float:
    return inset + y * scale

  # Three bars form a geometric C (matching mark.svg)
  bars = [
    (7, 6, 24, 12),
    (6, 6, 12, 26),
    (7, 20, 24, 26),
  ]
  for x0, y0, x1, y1 in bars:
    draw.rounded_rectangle(
      [sx(x0), sy(y0), sx(x1), sy(y1)],
      radius=max(2, int(1.5 * scale)),
      fill=MARK,
    )

  OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
  img.save(OUT_PNG, 'PNG')
  print(f'wrote {OUT_PNG}')


if __name__ == '__main__':
  main()
