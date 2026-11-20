#!/usr/bin/env python3
"""
BDHT Brand Asset Generator
Generates all hand-clean outlined SVGs and 4x-supersampled PNG rasters for:
  - brand/icon/       (square icon mark, 16px..1024px + maskable 512)
  - brand/horizontal/ (horizontal lockup, 4 color variants, SVG + 1x/2x/3x PNG)
  - brand/stacked/    (stacked lockup, 4 color variants, SVG + 1x/2x/3x PNG)
  - brand/monogram/   (BDHT monogram wordmark, 4 color variants, SVG + 1x/2x/3x PNG)
  - brand/stripe/     (Stripe icon 512x512 and wide logo 780x160 PNGs, <512KB, >=128x128)
  - brand/email/      (PNG-only retina @2x and @1x email header logos for dark & light bg)
  - brand/social/     (1200x630 Open Graph social card SVG + PNG)

Typeface: Barlow Semi Condensed (Black 900 & Bold 700) by Jeremy Tribby (SIL Open Font License 1.1).
All text in final SVGs is converted to pure vector <path> outlines using pre-extracted contours
in brand/_glyphs.json so no external font is required to view or regenerate the assets.
"""

from __future__ import annotations
import json
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
GLYPHS = json.loads((ROOT / "_glyphs.json").read_text(encoding="utf-8"))

# Source-of-truth color tokens from css/app.css
TOKENS = {
    "bg": "#07090d",
    "bg2": "#0e131a",
    "panel": "#141b24",
    "panel2": "#1c2531",
    "panel3": "#243041",
    "line": "#314052",
    "line_strong": "#44566c",
    "ink": "#f2f6fb",
    "ink2": "#d5deea",
    "mute": "#b7c3d1",
    "amber": "#f0b429",
    "amber2": "#ffd56a",
    "amber_ink": "#1a1303",
    "amber_on_light": "#b87d00",
    "cyan": "#7dffe0",
    "cyan_dim": "#143832",
    "cyan_on_light": "#0d6b5c",
    "white": "#ffffff",
    "black": "#07090d",
}


def fmt(val: float) -> str:
    r = round(val, 2)
    if r == int(r):
        return str(int(r))
    return f"{r:.2f}".rstrip("0").rstrip(".")


def rounded_rect_contours(x: float, y: float, w: float, h: float, rx: float) -> tuple[str, list[list[tuple[float, float]]]]:
    """Return an SVG path string and a 64-step polygon contour for a rounded rectangle."""
    r = max(0.0, min(rx, w / 2.0, h / 2.0))
    if r == 0:
        d = f"M{fmt(x)} {fmt(y)}H{fmt(x+w)}V{fmt(y+h)}H{fmt(x)}Z"
        pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        return d, [pts]

    # Cubic Bezier approximation constant for quarter circle
    k = 0.5522847498 * r
    x0, y0, x1, y1 = x, y, x + w, y + h
    d = (
        f"M{fmt(x0+r)} {fmt(y0)}"
        f"H{fmt(x1-r)}"
        f"C{fmt(x1-r+k)} {fmt(y0)} {fmt(x1)} {fmt(y0+r-k)} {fmt(x1)} {fmt(y0+r)}"
        f"V{fmt(y1-r)}"
        f"C{fmt(x1)} {fmt(y1-r+k)} {fmt(x1-r+k)} {fmt(y1)} {fmt(x1-r)} {fmt(y1)}"
        f"H{fmt(x0+r)}"
        f"C{fmt(x0+r-k)} {fmt(y1)} {fmt(x0)} {fmt(y1-r+k)} {fmt(x0)} {fmt(y1-r)}"
        f"V{fmt(y0+r)}"
        f"C{fmt(x0)} {fmt(y0+r-k)} {fmt(x0+r-k)} {fmt(y0)} {fmt(x0+r)} {fmt(y0)}Z"
    )
    pts: list[tuple[float, float]] = []
    corners = [
        (x1 - r, y0 + r, -math.pi / 2, 0.0),
        (x1 - r, y1 - r, 0.0, math.pi / 2),
        (x0 + r, y1 - r, math.pi / 2, math.pi),
        (x0 + r, y0 + r, math.pi, 3 * math.pi / 2),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(13):
            a = a0 + (a1 - a0) * (i / 12.0)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return d, [pts]


def text_measure(text: str, size: float, weight: str = "black", tracking: float = 0.0) -> float:
    gmap = GLYPHS[weight]
    scale = size / 1000.0
    total = 0.0
    for i, ch in enumerate(text):
        g = gmap.get(ch) or gmap.get(" ")
        total += g["w"] * scale
        if i < len(text) - 1:
            total += tracking * size
    return total


def text_to_shape(
    text: str,
    x: float,
    y_baseline: float,
    size: float,
    fill: str,
    weight: str = "black",
    tracking: float = 0.0,
    align: str = "left",
) -> dict:
    """Convert a string into a single SVG <path> and polygon contours for rasterization."""
    gmap = GLYPHS[weight]
    scale = size / 1000.0
    if align in ("center", "right"):
        w = text_measure(text, size, weight, tracking)
        if align == "center":
            x -= w / 2.0
        elif align == "right":
            x -= w

    svg_cmds: list[str] = []
    polys: list[list[tuple[float, float]]] = []
    cursor_x = x

    for ch in text:
        g = gmap.get(ch)
        if not g:
            cursor_x += 260 * scale + tracking * size
            continue
        for contour in g["c"]:
            pts: list[tuple[float, float]] = []
            cur_pt = (0.0, 0.0)
            for op in contour:
                cmd = op[0]
                if cmd == "M":
                    px = cursor_x + op[1] * scale
                    py = y_baseline - op[2] * scale
                    svg_cmds.append(f"M{fmt(px)} {fmt(py)}")
                    pts.append((px, py))
                    cur_pt = (px, py)
                elif cmd == "L":
                    px = cursor_x + op[1] * scale
                    py = y_baseline - op[2] * scale
                    svg_cmds.append(f"L{fmt(px)} {fmt(py)}")
                    pts.append((px, py))
                    cur_pt = (px, py)
                elif cmd == "Q":
                    x1 = cursor_x + op[1] * scale
                    y1 = y_baseline - op[2] * scale
                    x2 = cursor_x + op[3] * scale
                    y2 = y_baseline - op[4] * scale
                    svg_cmds.append(f"Q{fmt(x1)} {fmt(y1)} {fmt(x2)} {fmt(y2)}")
                    x0, y0 = cur_pt
                    steps = 8
                    for s in range(1, steps + 1):
                        t = s / steps
                        mt = 1.0 - t
                        qx = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
                        qy = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
                        pts.append((qx, qy))
                    cur_pt = (x2, y2)
            svg_cmds.append("Z")
            if len(pts) >= 3:
                polys.append(pts)
        cursor_x += g["w"] * scale + tracking * size

    return {"fill": fill, "d": "".join(svg_cmds), "polys": polys}


def poly_shape(points: list[tuple[float, float]], fill: str) -> dict:
    cmds = [f"M{fmt(points[0][0])} {fmt(points[0][1])}"]
    for px, py in points[1:]:
        cmds.append(f"L{fmt(px)} {fmt(py)}")
    cmds.append("Z")
    return {"fill": fill, "d": "".join(cmds), "polys": [points]}


def rect_shape(x: float, y: float, w: float, h: float, rx: float, fill: str) -> dict:
    d, polys = rounded_rect_contours(x, y, w, h, rx)
    return {"fill": fill, "d": d, "polys": polys}


def frame_shape(x: float, y: float, w: float, h: float, rx: float, thickness: float, fill: str) -> dict:
    d_out, p_out = rounded_rect_contours(x, y, w, h, rx)
    irx = max(0.0, rx - thickness)
    d_in, p_in = rounded_rect_contours(x + thickness, y + thickness, w - 2 * thickness, h - 2 * thickness, irx)
    return {"fill": fill, "d": d_out + d_in, "polys": p_out + p_in}


def icon_mark_shapes(
    ox: float = 0.0,
    oy: float = 0.0,
    size: float = 64.0,
    variant: str = "dark",
    include_plate: bool = True,
    inner_scale: float = 1.0,
) -> list[dict]:
    """
    Build the evolved BDHT icon mark on a 64x64 local grid, scaled to `size` at `(ox, oy)`.
    - Top corner brackets: Amber (#f0b429 on dark)
    - Bottom corner brackets: Cyan (#7dffe0 on dark)
    - Center horizontal tool-sub bar: Amber stepped box/pin shoulders around the sub barrel.
      Snapped to the 4-unit grid (64/16 = 4) so it renders razor-sharp down to 16x16px.
    """
    s = size / 64.0
    shapes: list[dict] = []

    if variant == "dark":
        plate_fill = TOKENS["bg"]
        top_col = TOKENS["amber"]
        bot_col = TOKENS["cyan"]
        sub_col = TOKENS["amber"]
        border_col = None
    elif variant == "light":
        plate_fill = TOKENS["ink"]
        top_col = TOKENS["amber_on_light"]
        bot_col = TOKENS["cyan_on_light"]
        sub_col = TOKENS["black"]
        border_col = TOKENS["line"]
    elif variant == "badge_on_light":
        plate_fill = TOKENS["bg"]
        top_col = TOKENS["amber"]
        bot_col = TOKENS["cyan"]
        sub_col = TOKENS["amber"]
        border_col = None
    elif variant == "white":
        plate_fill = None
        top_col = TOKENS["white"]
        bot_col = TOKENS["white"]
        sub_col = TOKENS["white"]
        border_col = TOKENS["white"]
    elif variant == "black":
        plate_fill = None
        top_col = TOKENS["black"]
        bot_col = TOKENS["black"]
        sub_col = TOKENS["black"]
        border_col = TOKENS["black"]
    else:
        raise ValueError(f"Unknown variant: {variant}")

    if include_plate:
        if plate_fill:
            rx = 0.0 if inner_scale < 1.0 else 14.0 * s
            shapes.append(rect_shape(ox, oy, size, size, rx, plate_fill))
        if border_col:
            t = 2.0 * s if plate_fill else 3.5 * s
            shapes.append(frame_shape(ox, oy, size, size, 14.0 * s, t, border_col))

    def tr(pt: tuple[float, float]) -> tuple[float, float]:
        cx = 32.0 + (pt[0] - 32.0) * inner_scale
        cy = 32.0 + (pt[1] - 32.0) * inner_scale
        return (ox + cx * s, oy + cy * s)

    # Top-left & top-right corner brackets (4u thick, outer 12..52, arm length 12u)
    tl = [tr(p) for p in [(12, 12), (24, 12), (24, 16), (16, 16), (16, 24), (12, 24)]]
    tr_b = [tr(p) for p in [(40, 12), (52, 12), (52, 24), (48, 24), (48, 16), (40, 16)]]
    shapes.append(poly_shape(tl, top_col))
    shapes.append(poly_shape(tr_b, top_col))

    # Bottom-left & bottom-right corner brackets (4u thick, outer 12..52, arm length 12u)
    bl = [tr(p) for p in [(12, 40), (16, 40), (16, 48), (24, 48), (24, 52), (12, 52)]]
    br = [tr(p) for p in [(48, 40), (52, 40), (52, 52), (40, 52), (40, 48), (48, 48)]]
    shapes.append(poly_shape(bl, bot_col))
    shapes.append(poly_shape(br, bot_col))

    # Center horizontal tool-sub bar:
    # Stepped drill-sub shoulders at x=18..23 and x=41..46 (y=26..38, height 12u)
    # joined by the 8u sub body x=23..41 (y=28..36, height 8u).
    sub_pts = [
        tr(p)
        for p in [
            (18, 26),
            (23, 26),
            (23, 28),
            (41, 28),
            (41, 26),
            (46, 26),
            (46, 38),
            (41, 38),
            (41, 36),
            (23, 36),
            (23, 38),
            (18, 38),
        ]
    ]
    shapes.append(poly_shape(sub_pts, sub_col))
    return shapes


def build_svg(width: int, height: int, shapes: list[dict]) -> str:
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">']
    # Merge consecutive shapes with identical fill only when safe, or emit clean <path> per element
    for sh in shapes:
        if not sh["d"]:
            continue
        lines.append(f'  <path fill="{sh["fill"]}" d="{sh["d"]}"/>')
    lines.append("</svg>\n")
    return "\n".join(lines)


def hex_to_rgba(hex_str: str) -> tuple[int, int, int, int]:
    h = hex_str.lstrip("#")
    if len(h) == 6:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    if len(h) == 8:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16))
    raise ValueError(f"Invalid hex color: {hex_str}")


def render_png(width: int, height: int, shapes: list[dict], out_path: Path, ss: int = 4) -> None:
    """Render vector shapes with 4x supersampling and even-odd contour hole handling."""
    sw, sh = width * ss, height * ss
    canvas = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))

    for shape in shapes:
        polys = shape.get("polys", [])
        if not polys:
            continue
        color = hex_to_rgba(shape["fill"])
        if len(polys) == 1:
            mask = Image.new("L", (sw, sh), 0)
            draw = ImageDraw.Draw(mask)
            scaled = [(px * ss, py * ss) for px, py in polys[0]]
            draw.polygon(scaled, fill=255)
        else:
            mask = Image.new("L", (sw, sh), 0)
            for poly in polys:
                sub = Image.new("L", (sw, sh), 0)
                draw = ImageDraw.Draw(sub)
                scaled = [(px * ss, py * ss) for px, py in poly]
                draw.polygon(scaled, fill=255)
                mask = ImageChops.difference(mask, sub)
        layer = Image.new("RGBA", (sw, sh), color)
        canvas.paste(layer, (0, 0), mask)

    final = canvas.resize((width, height), Image.Resampling.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    final.save(out_path, format="PNG", optimize=True)


def save_svg_and_pngs(svg_path: Path, width: int, height: int, shapes: list[dict], png_targets: list[tuple[Path, int, int]]) -> None:
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path.write_text(build_svg(width, height, shapes), encoding="utf-8")
    for png_path, pw, ph in png_targets:
        scale_x = pw / width
        scale_y = ph / height
        scaled_shapes = []
        for sh in shapes:
            scaled_polys = [[(px * scale_x, py * scale_y) for px, py in poly] for poly in sh["polys"]]
            scaled_shapes.append({"fill": sh["fill"], "d": sh["d"], "polys": scaled_polys})
        # Use 4x supersampling (or 2x for images already >= 1024px)
        ss = 2 if max(pw, ph) >= 1024 else 4
        render_png(pw, ph, scaled_shapes, png_path, ss=ss)


def generate_icons() -> None:
    icon_dir = ROOT / "icon"
    # 1. Default on-dark icon + full PNG ladder
    dark_shapes = icon_mark_shapes(0, 0, 64, variant="dark", include_plate=True)
    save_svg_and_pngs(
        icon_dir / "icon-dark.svg",
        64,
        64,
        dark_shapes,
        [
            (icon_dir / "icon-16.png", 16, 16),
            (icon_dir / "icon-32.png", 32, 32),
            (icon_dir / "icon-48.png", 48, 48),
            (icon_dir / "apple-touch-icon-180.png", 180, 180),
            (icon_dir / "icon-192.png", 192, 192),
            (icon_dir / "icon-512.png", 512, 512),
            (icon_dir / "icon-1024.png", 1024, 1024),
            (ROOT / "stripe" / "stripe-icon.png", 512, 512),
        ],
    )

    # 2. Maskable 512 icon (full-bleed #07090d plate, inner mark scaled to 0.76 inside the 80% safe circle)
    maskable_shapes = icon_mark_shapes(0, 0, 512, variant="dark", include_plate=True, inner_scale=0.76)
    save_svg_and_pngs(
        icon_dir / "icon-maskable.svg",
        512,
        512,
        maskable_shapes,
        [(icon_dir / "icon-maskable-512.png", 512, 512)],
    )

    # 3. On-light, one-color white, and one-color black icon variants
    for var in ("light", "white", "black"):
        sh = icon_mark_shapes(0, 0, 64, variant=var, include_plate=True)
        save_svg_and_pngs(
            icon_dir / f"icon-{var}.svg",
            64,
            64,
            sh,
            [(icon_dir / f"icon-{var}-512.png", 512, 512)],
        )


def horizontal_shapes(variant: str, with_bg_plate: bool = True) -> list[dict]:
    """Horizontal lockup on a 520x96 canvas: Icon + LOADOUT kicker + THE BETTER DOWN HOLE TOOL."""
    W, H = 520, 96
    shapes: list[dict] = []
    if variant == "dark":
        if with_bg_plate:
            shapes.append(rect_shape(0, 0, W, H, 16, TOKENS["bg"]))
        shapes.extend(icon_mark_shapes(16, 16, 64, variant="dark", include_plate=not with_bg_plate))
        if with_bg_plate:
            shapes.append(frame_shape(16, 16, 64, 64, 14, 1.5, TOKENS["line"]))
        kicker_col = TOKENS["amber2"]
        title_col = TOKENS["ink"]
    elif variant == "light":
        if with_bg_plate:
            shapes.append(rect_shape(0, 0, W, H, 16, TOKENS["ink"]))
        shapes.extend(icon_mark_shapes(16, 16, 64, variant="badge_on_light", include_plate=True))
        kicker_col = TOKENS["amber_on_light"]
        title_col = TOKENS["black"]
    elif variant == "white":
        shapes.extend(icon_mark_shapes(16, 16, 64, variant="white", include_plate=True))
        kicker_col = TOKENS["white"]
        title_col = TOKENS["white"]
    elif variant == "black":
        shapes.extend(icon_mark_shapes(16, 16, 64, variant="black", include_plate=True))
        kicker_col = TOKENS["black"]
        title_col = TOKENS["black"]
    else:
        raise ValueError(variant)

    shapes.append(text_to_shape("LOADOUT · BDHT", 96, 35, 14.5, kicker_col, weight="bold", tracking=0.16))
    shapes.append(text_to_shape("THE BETTER DOWN HOLE TOOL", 95, 70, 29.5, title_col, weight="black", tracking=0.012))
    return shapes


def generate_horizontal_and_email_and_stripe() -> None:
    h_dir = ROOT / "horizontal"
    W, H = 520, 96
    for var in ("dark", "light", "white", "black"):
        with_plate = var in ("dark", "light")
        sh = horizontal_shapes(var, with_bg_plate=with_plate)
        save_svg_and_pngs(
            h_dir / f"lockup-horizontal-{var}.svg",
            W,
            H,
            sh,
            [
                (h_dir / f"lockup-horizontal-{var}@1x.png", W, H),
                (h_dir / f"lockup-horizontal-{var}@2x.png", W * 2, H * 2),
                (h_dir / f"lockup-horizontal-{var}@3x.png", W * 3, H * 3),
            ],
        )

    # Stripe wide logos: must be >= 128px x 128px and < 512KB (we use 780x144)
    stripe_dir = ROOT / "stripe"
    for var in ("dark", "light"):
        sh = horizontal_shapes(var, with_bg_plate=(var == "dark"))
        scale = 1.5  # 520*1.5 = 780, 96*1.5 = 144 (both >= 128px)
        pw, ph = int(W * scale), int(H * scale)
        scaled_shapes = [
            {"fill": s["fill"], "d": s["d"], "polys": [[(px * scale, py * scale) for px, py in poly] for poly in s["polys"]]}
            for s in sh
        ]
        render_png(pw, ph, scaled_shapes, stripe_dir / f"stripe-logo-{var}.png", ss=4)

    # Email header logos (PNG only, displayed at ~200px wide; 2x retina = 416x76, 1x = 208x38)
    email_dir = ROOT / "email"
    for var, bg_flag in [("dark", True), ("light", False)]:
        sh = horizontal_shapes(var, with_bg_plate=bg_flag)
        for suffix, target_w, target_h in [("@1x", 208, 38), ("@2x", 416, 76)]:
            sx, sy = target_w / W, target_h / H
            scaled_shapes = [
                {"fill": s["fill"], "d": s["d"], "polys": [[(px * sx, py * sy) for px, py in poly] for poly in s["polys"]]}
                for s in sh
            ]
            render_png(target_w, target_h, scaled_shapes, email_dir / f"email-logo-{var}{suffix}.png", ss=4)


def stacked_shapes(variant: str) -> list[dict]:
    """Stacked lockup on a 360x220 canvas: Icon on top, two-line wordmark below."""
    W, H = 360, 220
    shapes: list[dict] = []
    if variant == "dark":
        shapes.append(rect_shape(0, 0, W, H, 20, TOKENS["bg"]))
        shapes.extend(icon_mark_shapes(144, 22, 72, variant="dark", include_plate=False))
        shapes.append(frame_shape(144, 22, 72, 72, 16, 1.5, TOKENS["line"]))
        kicker_col = TOKENS["amber2"]
        title_col = TOKENS["ink"]
    elif variant == "light":
        shapes.append(rect_shape(0, 0, W, H, 20, TOKENS["ink"]))
        shapes.extend(icon_mark_shapes(144, 22, 72, variant="badge_on_light", include_plate=True))
        kicker_col = TOKENS["amber_on_light"]
        title_col = TOKENS["black"]
    elif variant == "white":
        shapes.extend(icon_mark_shapes(144, 22, 72, variant="white", include_plate=True))
        kicker_col = TOKENS["white"]
        title_col = TOKENS["white"]
    elif variant == "black":
        shapes.extend(icon_mark_shapes(144, 22, 72, variant="black", include_plate=True))
        kicker_col = TOKENS["black"]
        title_col = TOKENS["black"]
    else:
        raise ValueError(variant)

    shapes.append(text_to_shape("LOADOUT · BDHT", W / 2, 122, 14, kicker_col, weight="bold", tracking=0.18, align="center"))
    shapes.append(text_to_shape("THE BETTER", W / 2, 158, 34, title_col, weight="black", tracking=0.02, align="center"))
    shapes.append(text_to_shape("DOWN HOLE TOOL", W / 2, 194, 34, title_col, weight="black", tracking=0.02, align="center"))
    return shapes


def generate_stacked() -> None:
    s_dir = ROOT / "stacked"
    W, H = 360, 220
    for var in ("dark", "light", "white", "black"):
        sh = stacked_shapes(var)
        save_svg_and_pngs(
            s_dir / f"lockup-stacked-{var}.svg",
            W,
            H,
            sh,
            [
                (s_dir / f"lockup-stacked-{var}@1x.png", W, H),
                (s_dir / f"lockup-stacked-{var}@2x.png", W * 2, H * 2),
                (s_dir / f"lockup-stacked-{var}@3x.png", W * 3, H * 3),
            ],
        )


def monogram_shapes(variant: str) -> list[dict]:
    """BDHT monogram wordmark (200x64) framed by corner brackets for tight spaces."""
    W, H = 200, 64
    shapes: list[dict] = []
    if variant == "dark":
        shapes.append(rect_shape(0, 0, W, H, 14, TOKENS["bg"]))
        top_col, bot_col, text_col = TOKENS["amber"], TOKENS["cyan"], TOKENS["ink"]
    elif variant == "light":
        shapes.append(rect_shape(0, 0, W, H, 14, TOKENS["ink"]))
        shapes.append(frame_shape(0, 0, W, H, 14, 2, TOKENS["line"]))
        top_col, bot_col, text_col = TOKENS["amber_on_light"], TOKENS["cyan_on_light"], TOKENS["black"]
    elif variant == "white":
        top_col = bot_col = text_col = TOKENS["white"]
    elif variant == "black":
        top_col = bot_col = text_col = TOKENS["black"]
    else:
        raise ValueError(variant)

    # Left & right corner brackets framing "BDHT"
    shapes.append(poly_shape([(12, 12), (24, 12), (24, 16), (16, 16), (16, 24), (12, 24)], top_col))
    shapes.append(poly_shape([(176, 12), (188, 12), (188, 24), (184, 24), (184, 16), (176, 16)], top_col))
    shapes.append(poly_shape([(12, 40), (16, 40), (16, 48), (24, 48), (24, 52), (12, 52)], bot_col))
    shapes.append(poly_shape([(184, 40), (188, 40), (188, 52), (176, 52), (176, 48), (184, 48)], bot_col))

    shapes.append(text_to_shape("BDHT", W / 2, 46, 40, text_col, weight="black", tracking=0.08, align="center"))
    return shapes


def generate_monogram() -> None:
    m_dir = ROOT / "monogram"
    W, H = 200, 64
    for var in ("dark", "light", "white", "black"):
        sh = monogram_shapes(var)
        save_svg_and_pngs(
            m_dir / f"monogram-{var}.svg",
            W,
            H,
            sh,
            [
                (m_dir / f"monogram-{var}@1x.png", W, H),
                (m_dir / f"monogram-{var}@2x.png", W * 2, H * 2),
                (m_dir / f"monogram-{var}@3x.png", W * 3, H * 3),
            ],
        )


def generate_social_og() -> None:
    """Generate 1200x630 Open Graph preview image (SVG + PNG)."""
    W, H = 1200, 630
    shapes: list[dict] = []
    # Base background
    shapes.append(rect_shape(0, 0, W, H, 0, TOKENS["bg"]))
    # Subtle structural grid lines (#0e131a)
    for gx in range(64, W, 64):
        shapes.append(rect_shape(gx, 0, 1, H, 0, TOKENS["bg2"]))
    for gy in range(64, H, 64):
        shapes.append(rect_shape(0, gy, W, 1, 0, TOKENS["bg2"]))

    # Main card surface
    shapes.append(rect_shape(48, 48, W - 96, H - 96, 24, TOKENS["panel"]))
    shapes.append(frame_shape(48, 48, W - 96, H - 96, 24, 2, TOKENS["line"]))
    # Amber left industrial bar
    shapes.append(rect_shape(48, 48, 10, H - 96, 5, TOKENS["amber"]))

    # Top lockup row
    shapes.extend(icon_mark_shapes(96, 88, 84, variant="dark", include_plate=True))
    shapes.append(frame_shape(96, 88, 84, 84, 18, 2, TOKENS["line_strong"]))
    shapes.append(text_to_shape("LOADOUT · BDHT", 204, 120, 20, TOKENS["amber2"], weight="bold", tracking=0.16))
    shapes.append(text_to_shape("THE BETTER DOWN HOLE TOOL", 204, 158, 36, TOKENS["ink"], weight="black", tracking=0.02))

    # Main headline
    shapes.append(text_to_shape("BUILD THE LOADOUT.", 96, 266, 74, TOKENS["ink"], weight="black", tracking=0.01))
    shapes.append(text_to_shape("EQUIP EVERY SLOT.", 96, 344, 74, TOKENS["amber2"], weight="black", tracking=0.01))

    # Subtitle
    shapes.append(
        text_to_shape(
            "PICK A DRILL · LOCK THE PIPE · FILL THE STRING FROM RIG TO BIT · SHARE THE PARTS LIST",
            96,
            396,
            21,
            TOKENS["mute"],
            weight="bold",
            tracking=0.08,
        )
    )

    # Bottom schematic slot rail (6 generic non-OEM slots)
    slots = [
        ("01", "DRILL PIPE", "LOCKED", TOKENS["amber"]),
        ("02", "SAVER SUB", "EQUIPPED", TOKENS["amber"]),
        ("03", "COLLAR", "AUTO", TOKENS["cyan"]),
        ("04", "HOUSING", "EQUIPPED", TOKENS["amber"]),
        ("05", "ADAPTER", "EQUIPPED", TOKENS["amber"]),
        ("06", "BIT / REAMER", "READY", TOKENS["cyan"]),
    ]
    sx0 = 96
    sy0 = 434
    sw = 158
    sh = 108
    gap = 12
    for idx, (num, label, tag, col) in enumerate(slots):
        x = sx0 + idx * (sw + gap)
        shapes.append(rect_shape(x, sy0, sw, sh, 14, TOKENS["bg"]))
        shapes.append(frame_shape(x, sy0, sw, sh, 14, 2, col))
        shapes.append(text_to_shape(f"SLOT {num}", x + 16, sy0 + 28, 15, TOKENS["mute"], weight="bold", tracking=0.12))
        shapes.append(text_to_shape(label, x + 16, sy0 + 58, 22, TOKENS["ink"], weight="black", tracking=0.03))
        # Mini tool-sub schematic icon bar inside each slot card
        shapes.append(rect_shape(x + 16, sy0 + 76, 44, 10, 3, col))
        shapes.append(text_to_shape(tag, x + sw - 16, sy0 + 86, 14, col, weight="bold", tracking=0.1, align="right"))

    social_dir = ROOT / "social"
    save_svg_and_pngs(
        social_dir / "og-1200x630.svg",
        W,
        H,
        shapes,
        [(social_dir / "og-1200x630.png", W, H)],
    )


def main() -> None:
    generate_icons()
    generate_horizontal_and_email_and_stripe()
    generate_stacked()
    generate_monogram()
    generate_social_og()
    print("All BDHT brand assets generated successfully.")


if __name__ == "__main__":
    main()
