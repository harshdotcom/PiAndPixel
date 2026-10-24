"""Shared look for the Pythagoras scenes: colours, text, layout helpers."""

from manim import DOWN, ORIGIN, Mobject, Polygon, Scene, Text, VGroup, VMobject, config, np
from pnp import ctx

A_COLOR = "#83C167"
B_COLOR = "#58C4DD"
C_COLOR = "#F0AC5F"
PORTRAIT = ctx.format.is_portrait


def prepare(scene: Scene) -> None:
    """Theme the background and keep a square-pixel frame for any resolution.

    `manim --resolution W,H` keeps the 16:9 frame width (14.2 units) and the
    camera stretches its height to match, so a portrait render gets a 25-unit
    tall frame. Pin the height to 8 units and derive the width from the pixel
    aspect, on both the global config (used by layout helpers) and the camera.
    """
    scene.camera.background_color = ctx.theme.background
    config.frame_height = 8.0
    config.frame_width = 8.0 * config.pixel_width / config.pixel_height
    scene.camera.frame_height = config.frame_height
    scene.camera.frame_width = config.frame_width


def text(content: str, size: float = 36, color: str | None = None) -> Text:
    return Text(content, font=ctx.theme.font, font_size=size, color=color or ctx.theme.text)


def lines(content: str, size: float = 36, color: str | None = None) -> VGroup:
    """Multi-line text with each line centred (Text aligns lines to the left)."""
    return stack(*(text(line, size, color) for line in content.split("\n")), buff=0.15)


def equation(size: float) -> Text:
    """ "a² + b² = c²" with each square in its own colour (glyphs exclude spaces)."""
    eq = text("a² + b² = c²", size)
    eq[0:2].set_color(A_COLOR)
    eq[3:5].set_color(B_COLOR)
    eq[6:8].set_color(C_COLOR)
    return eq


def fit_to_frame(mob: Mobject, margin: float = 0.5) -> Mobject:
    """Shrink (never grow) `mob` to fit inside the frame and centre it."""
    max_w = config.frame_width - 2 * margin
    max_h = config.frame_height - 2 * margin
    mob.scale(min(1.0, max_w / mob.width, max_h / mob.height))
    return mob.move_to(ORIGIN)


def right_triangle(
    a: float, b: float, unit: float, marker_size: float = 0.18
) -> tuple[Polygon, VMobject]:
    """Right angle at the origin, leg b along x, leg a along y (counter-clockwise)."""
    o, bx, ay = np.array([0.0, 0, 0]), np.array([b * unit, 0, 0]), np.array([0, a * unit, 0])
    tri = Polygon(o, bx, ay, color=ctx.theme.text, stroke_width=4)
    s = marker_size
    marker = VMobject(stroke_color=ctx.theme.text, stroke_width=2)
    marker.set_points_as_corners([[0, s, 0], [s, s, 0], [s, 0, 0]])
    return tri, marker


def square_on_edge(p: np.ndarray, q: np.ndarray, cells: int, color: str) -> VGroup:
    """Square on edge p->q, outward for a counter-clockwise polygon, with a unit grid."""
    edge = q - p
    out = np.array([edge[1], -edge[0], 0.0])  # edge rotated -90 degrees
    square = Polygon(p, q, q + out, p + out, color=color, stroke_width=4)
    square.set_fill(color, opacity=0.35)
    grid = VGroup()
    for i in range(1, cells):
        t = i / cells
        grid.add(VMobject().set_points_as_corners([p + edge * t, p + edge * t + out]))
        grid.add(VMobject().set_points_as_corners([p + out * t, q + out * t]))
    grid.set_stroke(color, width=1.5, opacity=0.6)
    return VGroup(square, grid)


def stack(*mobs: Mobject, buff: float = 0.4) -> VGroup:
    return VGroup(*mobs).arrange(DOWN, buff=buff)
