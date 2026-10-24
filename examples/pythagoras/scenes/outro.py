from manim import DOWN, RIGHT, UP, FadeIn, FadeOut, LaggedStart, Scene, VGroup, Write
from style import (
    C_COLOR,
    PORTRAIT,
    equation,
    fit_to_frame,
    lines,
    prepare,
    right_triangle,
    stack,
    text,
)

TRIPLES = ((3, 4, 5), (5, 12, 13), (8, 15, 17))


def triple_card(a: int, b: int, c: int) -> VGroup:
    tri, marker = right_triangle(a, b, unit=1.2 / a)  # same height for every card
    tri.set_fill(C_COLOR, opacity=0.25)
    shape = VGroup(tri, marker)
    caption = text(f"{a}² + {b}² = {c}²", 28)
    return VGroup(shape, caption).arrange(DOWN, buff=0.3)


class Outro(Scene):
    def setup(self) -> None:
        prepare(self)

    def construct(self) -> None:
        eq = equation(72)
        split = "\n" if PORTRAIT else " "
        subtitle = lines(f"true for every{split}right triangle", 32).set_opacity(0.8)
        cards = VGroup(*(triple_card(*t) for t in TRIPLES))
        if PORTRAIT:
            # Two columns: triangles flush right, captions flush left.
            cells = VGroup(*(part for card in cards for part in card))
            cells.arrange_in_grid(rows=len(TRIPLES), cols=2, buff=(0.4, 0.5), col_alignments="rl")
        else:
            cards.arrange(RIGHT, buff=1.0)
        layout = fit_to_frame(stack(eq, subtitle, cards, buff=0.6))

        self.play(Write(eq), run_time=1.0)
        self.play(FadeIn(subtitle, shift=0.2 * UP), run_time=0.6)
        self.play(LaggedStart(*(FadeIn(c, shift=0.3 * DOWN) for c in cards), lag_ratio=0.3))
        self.wait(1.2)
        self.play(FadeOut(layout), run_time=0.8)
