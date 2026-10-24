from manim import DOWN, LEFT, RIGHT, UP, Create, FadeIn, LaggedStart, Scene, VGroup, Write
from pnp import ctx
from style import (
    A_COLOR,
    B_COLOR,
    C_COLOR,
    PORTRAIT,
    fit_to_frame,
    lines,
    prepare,
    right_triangle,
    stack,
    text,
)


class Intro(Scene):
    def setup(self) -> None:
        prepare(self)

    def construct(self) -> None:
        split = "\n" if PORTRAIT else " "
        title = lines(f"Pythagoras'{split}theorem", 56, ctx.theme.primary)
        subtitle = lines(f"one right triangle,{split}three sides", 28).set_opacity(0.75)
        tri, marker = right_triangle(3, 4, unit=0.8)
        a_label = text("a", 40, A_COLOR).next_to(tri.get_left(), LEFT, buff=0.25)
        b_label = text("b", 40, B_COLOR).next_to(tri.get_bottom(), DOWN, buff=0.2)
        hyp_mid = (tri.get_vertices()[1] + tri.get_vertices()[2]) / 2
        c_label = text("c", 40, C_COLOR).move_to(hyp_mid + 0.4 * (UP * 4 + RIGHT * 3) / 5)
        figure = VGroup(tri, marker, a_label, b_label, c_label)
        question = lines(f"How are a, b{split}and c related?", 34)

        if PORTRAIT:
            layout = stack(stack(title, subtitle, buff=0.2), figure, question, buff=0.7)
        else:
            body = VGroup(figure, question).arrange(RIGHT, buff=1.2)
            layout = stack(stack(title, subtitle, buff=0.2), body, buff=0.8)
        fit_to_frame(layout)

        self.play(Write(title), run_time=1.0)
        self.play(FadeIn(subtitle, shift=0.2 * UP), run_time=0.6)
        self.play(Create(tri), Create(marker), run_time=1.0)
        self.play(LaggedStart(*(FadeIn(m, scale=0.5) for m in (a_label, b_label, c_label))))
        self.play(Write(question), run_time=1.0)
        self.wait(1.2)
