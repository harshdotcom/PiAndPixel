"""Local transcript documents, word alignment and caption serialization."""

import difflib
import re
import uuid
from pathlib import Path
from typing import Any

from pnp_core.paths import safe_join
from pydantic import BaseModel, ConfigDict, Field, model_validator

from pnp_agent.errors import ApiError

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


class NarrationWord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=80)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    matched: bool = True


class NarrationSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    text: str = Field(max_length=5000)
    start_offset_s: float = Field(default=0, ge=0, le=1800)
    audio_id: str | None = None
    audio_duration_s: float | None = None
    words: list[NarrationWord] = Field(default_factory=list)


class NarrationAudioClip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    audio_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    start_s: float = Field(ge=0, le=1800)
    source_start_s: float = Field(ge=0)
    source_end_s: float = Field(gt=0)
    gain: float = Field(default=1, ge=0, le=2)
    enabled: bool = True

    @model_validator(mode="after")
    def _positive_source_range(self) -> "NarrationAudioClip":
        if self.source_end_s <= self.source_start_s:
            raise ValueError("source_end_s must be after source_start_s")
        return self


class NarrationDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    composition: str
    segments: list[NarrationSegment] = Field(default_factory=list, max_length=100)
    audio_clips: list[NarrationAudioClip] = Field(default_factory=list, max_length=100)


def _check_name(name: str) -> None:
    if not _NAME.fullmatch(name):
        raise ApiError(422, "validation_error", "Composition name is invalid")


def narration_dir(project: Path, composition: str) -> Path:
    _check_name(composition)
    return safe_join(project, f".pnp/narration/{composition}")


def document_path(project: Path, composition: str) -> Path:
    return narration_dir(project, composition) / "transcript.json"


def load_document(project: Path, composition: str) -> NarrationDocument:
    path = document_path(project, composition)
    if not path.exists():
        return NarrationDocument(composition=composition)
    try:
        document = NarrationDocument.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ApiError(409, "storage_error", f"Narration file could not be read: {exc}") from None
    if not document.audio_clips:
        segment = next(
            (
                item
                for item in document.segments
                if item.audio_id is not None and item.audio_duration_s is not None
            ),
            None,
        )
        if segment and segment.audio_id is not None and segment.audio_duration_s is not None:
            document.audio_clips = [
                NarrationAudioClip(
                    id=segment.id,
                    audio_id=segment.audio_id,
                    start_s=segment.start_offset_s,
                    source_start_s=0,
                    source_end_s=segment.audio_duration_s,
                )
            ]
    return document


def save_document(project: Path, doc: NarrationDocument) -> None:
    folder = narration_dir(project, doc.composition)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "transcript.json"
    part = path.with_suffix(".json.part")
    try:
        part.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
        part.replace(path)
    except OSError as exc:
        part.unlink(missing_ok=True)
        raise ApiError(409, "storage_error", f"Narration file could not be saved: {exc}") from None


def aligned_words(script: str, recognized: list[dict[str, Any]]) -> list[NarrationWord]:
    expected = script.split()
    actual = [str(item.get("punctuated_word") or item.get("word") or "") for item in recognized]

    def normalize(value: str) -> str:
        return re.sub(r"[^\w']", "", value).casefold()

    matcher = difflib.SequenceMatcher(
        a=list(map(normalize, expected)), b=list(map(normalize, actual)), autojunk=False
    )
    index_map: dict[int, int] = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            index_map[block.a + offset] = block.b + offset
    words = []
    for i, text in enumerate(expected):
        spoken = recognized[index_map[i]] if i in index_map else None
        confidence = float(spoken.get("confidence", 0)) if spoken else 0
        words.append(
            NarrationWord(
                text=text,
                start=float(spoken["start"]) if spoken else 0,
                end=float(spoken["end"]) if spoken else 0.001,
                confidence=confidence,
                matched=spoken is not None and confidence >= 0.8,
            )
        )
    return words


def caption_text(segments: list[NarrationSegment], fmt: str) -> str:
    cues: list[tuple[float, float, str]] = []
    for segment in segments:
        words = [word for word in segment.words if word.matched]
        for start in range(0, len(words), 7):
            group = words[start : start + 7]
            if group:
                cues.append(
                    (
                        group[0].start + segment.start_offset_s,
                        group[-1].end + segment.start_offset_s,
                        " ".join(w.text for w in group),
                    )
                )
    lines = []
    for index, (start, end, text) in enumerate(cues, 1):
        stamp = f"{_timestamp(start, fmt)} --> {_timestamp(end, fmt)}"
        lines.extend([str(index) if fmt == "srt" else "", stamp, text, ""])
    return "\n".join(lines)


def _timestamp(seconds: float, fmt: str) -> str:
    ms = max(0, round(seconds * 1000))
    hours, rem = divmod(ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    separator = "," if fmt == "srt" else "."
    return f"{hours:02}:{minutes:02}:{secs:02}{separator}{millis:03}"
