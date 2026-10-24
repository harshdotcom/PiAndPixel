from manim import (
    RIGHT,
    UP,
    Circumscribe,
    Create,
    DrawBorderThenFill,
    FadeIn,
    LaggedStart,
    Scene,
    TransformFromCopy,
    VGroup,
    Write,
)
from pnp import ctx
from style import (
    A_COLOR,
    B_COLOR,
    C_COLOR,
    PORTRAIT,
    equation,
    fit_to_frame,
    prepare,
    right_triangle,
    square_on_edge,
    stack,
    text,
)


class Proof(Scene):
    """Squares on the sides of a 3-4-5 triangle: 9 + 16 unit cells fill 25."""

    def setup(self) -> None:
        prepare(self)

    def construct(self) -> None:
        tri, marker = right_triangle(3, 4, unit=0.5)
        o, bx, ay = tri.get_vertices()
        squares = [
            square_on_edge(ay, o, 3, A_COLOR),
            square_on_edge(o, bx, 4, B_COLOR),
            square_on_edge(bx, ay, 5, C_COLOR),
        ]
        labels = [
            text(name, 36, color).move_to(sq[0].get_center())
            for name, color, sq in zip(
                ("a²", "b²", "c²"), (A_COLOR, B_COLOR, C_COLOR), squares, strict=True
            )
        ]
        figure = VGroup(*squares, tri, marker, *labels)

        eq = equation(52)
        numbers = text("9 + 16 = 25", 36).set_opacity(0.85)
        result = stack(eq, numbers, buff=0.35)

        title_text = ctx.params.get("title")
        title = text(str(title_text), 44, ctx.theme.primary) if title_text else None
        if PORTRAIT:
            body = stack(figure, result, buff=0.6)
        else:
            body = VGroup(figure, result).arrange(RIGHT, buff=1.2)
        layout = stack(title, body, buff=0.6) if title else body
        fit_to_frame(layout)

        if title:
            self.play(Write(title), run_time=0.8)
        self.play(Create(tri), Create(marker), run_time=0.8)
        self.play(
            LaggedStart(*(DrawBorderThenFill(sq[0]) for sq in squares), lag_ratio=0.4, run_time=1.6)
        )
        self.play(*(Create(sq[1]) for sq in squares), *(FadeIn(lb) for lb in labels), run_time=0.8)
        self.play(
            TransformFromCopy(labels[0], eq[0:2]),
            TransformFromCopy(labels[1], eq[3:5]),
            TransformFromCopy(labels[2], eq[6:8]),
            FadeIn(eq[2], eq[5]),
            run_time=1.2,
        )
        self.play(FadeIn(numbers, shift=0.2 * UP), run_time=0.6)
        self.play(Circumscribe(eq, color=ctx.theme.accent), run_time=1.0)
        self.wait(0.8)
