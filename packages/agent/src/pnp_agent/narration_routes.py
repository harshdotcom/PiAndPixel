"""Creator-controlled script drafting, voice generation and word-timed captions."""

import os
import re
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, PlainTextResponse
from pnp_core.manifest import load_manifest
from pnp_core.paths import safe_join
from pydantic import BaseModel, ConfigDict, Field

from pnp_agent.errors import ApiError
from pnp_agent.narration_context import selected_scene_context
from pnp_agent.narration_data import (
    NarrationAudioClip,
    NarrationDocument,
    NarrationSegment,
    NarrationWord,
    aligned_words,
    caption_text,
    load_document,
    narration_dir,
    save_document,
)
from pnp_agent.provider_clients import draft_script, provider_status, recognize, synthesize
from pnp_agent.workspace import resolve_project

router = APIRouter(prefix="/api/v1")
_ID = re.compile(r"^[0-9a-f]{32}$")
_MAX_AUDIO_BYTES = 25_000_000


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    composition: str
    context: str = Field(min_length=10, max_length=4000)
    target_seconds: float = Field(gt=0, le=180)


class TranscriptBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=5000)


class SynthesizeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voice: Literal["aura-2-thalia-en", "aura-2-asteria-en", "aura-2-luna-en"] = "aura-2-thalia-en"


class TimingWord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=80)
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class TimingBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    words: list[TimingWord] = Field(max_length=1000)


class OffsetBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_offset_s: float = Field(ge=0, le=1800)


class TimelineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clips: list[NarrationAudioClip] = Field(max_length=100)


def _root(request: Request, pid: str) -> Path:
    return resolve_project(request.app.state.settings.workspace, pid)


def _composition(root: Path, name: str):
    composition = load_manifest(root).compositions.get(name)
    if composition is None:
        raise ApiError(422, "validation_error", f"Unknown composition {name!r}")
    return composition


@router.get("/providers")
def get_provider_status() -> dict[str, bool]:
    return provider_status()


@router.post("/projects/{pid}/narration/draft")
def create_draft(pid: str, body: DraftBody, request: Request) -> dict[str, str]:
    root = _root(request, pid)
    composition = _composition(root, body.composition)
    scenes = selected_scene_context(root, composition.clips)
    context = f"Creator direction:\n{body.context.strip()}\n\nSelected Manim source:\n{scenes}"
    return {"text": draft_script(context, body.target_seconds)}


@router.get("/projects/{pid}/narration")
def get_narration(pid: str, request: Request, composition: str) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    return load_document(root, composition).model_dump(mode="json")


@router.put("/projects/{pid}/narration")
def save_transcript(pid: str, body: TranscriptBody, request: Request, composition: str) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    text = body.text.strip()
    old = doc.segments[0] if doc.segments else None
    if old is None or old.text != text:
        doc = NarrationDocument(
            composition=composition,
            segments=[NarrationSegment(id=old.id if old else uuid.uuid4().hex, text=text)],
        )
        save_document(root, doc)
    return doc.model_dump(mode="json")


@router.post("/projects/{pid}/narration/synthesize")
def synthesize_narration(
    pid: str, body: SynthesizeBody, request: Request, composition: str
) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    if not doc.segments or not doc.segments[0].text.strip():
        raise ApiError(409, "invalid_state", "Save narration text before generating a voice")
    segment = doc.segments[0]
    audio = synthesize(segment.text, body.voice)
    if len(audio) > _MAX_AUDIO_BYTES:
        raise ApiError(413, "payload_too_large", "Generated voice audio is larger than 25 MB")
    audio_id = uuid.uuid4().hex
    folder = narration_dir(root, composition)
    folder.mkdir(parents=True, exist_ok=True)
    path = safe_join(root, f".pnp/narration/{composition}/{audio_id}.mp3")
    part = path.with_suffix(".mp3.part")
    try:
        part.write_bytes(audio)
        os.replace(part, path)
    except OSError as exc:
        part.unlink(missing_ok=True)
        raise ApiError(409, "storage_error", f"Generated voice could not be saved: {exc}") from None
    segment.audio_id = audio_id
    segment.audio_duration_s = None
    segment.words = []
    doc.audio_clips = []
    save_document(root, doc)
    return doc.model_dump(mode="json")


def align_narration(pid: str, composition: str, segment_id: str, request: Request) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    segment = next((item for item in doc.segments if item.id == segment_id), None)
    if segment is None or segment.audio_id is None:
        raise ApiError(409, "invalid_state", "Generate voice audio before aligning its words")
    audio_path = safe_join(root, f".pnp/narration/{composition}/{segment.audio_id}.mp3")
    try:
        audio = audio_path.read_bytes()
    except OSError:
        raise ApiError(404, "not_found", "Generated voice audio is missing") from None
    duration, recognized = recognize(audio)
    segment.audio_duration_s = duration
    segment.words = aligned_words(segment.text, recognized)
    save_document(root, doc)
    return doc.model_dump(mode="json")


@router.put("/projects/{pid}/narration/timeline")
def save_audio_timeline(pid: str, body: TimelineBody, request: Request, composition: str) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    sources = {
        segment.audio_id: segment.audio_duration_s
        for segment in doc.segments
        if segment.audio_id and segment.audio_duration_s is not None
    }
    seen: set[str] = set()
    for clip in body.clips:
        duration = sources.get(clip.audio_id)
        if duration is None or clip.source_end_s > duration + 0.01:
            raise ApiError(422, "validation_error", "Audio clip range exceeds its generated voice")
        if clip.id in seen:
            raise ApiError(422, "validation_error", "Audio clip ids must be unique")
        seen.add(clip.id)
        audio_path = safe_join(root, f".pnp/narration/{composition}/{clip.audio_id}.mp3")
        if not audio_path.is_file():
            raise ApiError(404, "not_found", "Generated voice audio is missing")
    doc.audio_clips = body.clips
    save_document(root, doc)
    return doc.model_dump(mode="json")


@router.post("/projects/{pid}/narration/align")
def align_saved_narration(pid: str, request: Request, composition: str, segment_id: str) -> dict:
    _composition(_root(request, pid), composition)
    return align_narration(pid, composition, segment_id, request)


@router.put("/projects/{pid}/narration/timing")
def save_timing(
    pid: str, body: TimingBody, request: Request, composition: str, segment_id: str
) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    segment = next((item for item in doc.segments if item.id == segment_id), None)
    if segment is None or len(body.words) != len(segment.words):
        raise ApiError(409, "conflict", "The word list changed; align the narration again")
    previous_end = 0.0
    updated = []
    for old, new in zip(segment.words, body.words, strict=True):
        if new.end <= new.start or new.start < previous_end:
            raise ApiError(
                422, "validation_error", "Word timings must be positive and non-overlapping"
            )
        if segment.audio_duration_s and new.end > segment.audio_duration_s:
            raise ApiError(422, "validation_error", "A word ends after the generated audio")
        previous_end = new.end
        updated.append(NarrationWord(**new.model_dump(), confidence=old.confidence, matched=True))
    segment.words = updated
    save_document(root, doc)
    return doc.model_dump(mode="json")


@router.put("/projects/{pid}/narration/offset")
def save_offset(
    pid: str, body: OffsetBody, request: Request, composition: str, segment_id: str
) -> dict:
    root = _root(request, pid)
    _composition(root, composition)
    doc = load_document(root, composition)
    segment = next((item for item in doc.segments if item.id == segment_id), None)
    if segment is None:
        raise ApiError(404, "not_found", "Narration segment not found")
    segment.start_offset_s = body.start_offset_s
    save_document(root, doc)
    return doc.model_dump(mode="json")


@router.get("/projects/{pid}/narration/audio/{audio_id}")
def get_narration_audio(
    pid: str, audio_id: str, request: Request, composition: str
) -> FileResponse:
    if not _ID.fullmatch(audio_id):
        raise ApiError(404, "not_found", "Narration audio not found")
    root = _root(request, pid)
    doc = load_document(root, composition)
    if not any(segment.audio_id == audio_id for segment in doc.segments):
        raise ApiError(404, "not_found", "Narration audio not found")
    audio = safe_join(root, f".pnp/narration/{composition}/{audio_id}.mp3")
    if not audio.is_file():
        raise ApiError(404, "not_found", "Narration audio is missing")
    return FileResponse(audio, media_type="audio/mpeg")


@router.get("/projects/{pid}/narration/captions")
def get_captions(
    pid: str, request: Request, composition: str, format: Literal["vtt", "srt"] = "vtt"
) -> PlainTextResponse:
    root = _root(request, pid)
    doc = load_document(root, composition)
    if any(not word.matched for segment in doc.segments for word in segment.words):
        raise ApiError(
            409,
            "alignment_review",
            "Review or correct every unmatched word before exporting captions",
        )
    body = caption_text(doc.segments, format)
    if format == "vtt":
        body = "WEBVTT\n\n" + body
    return PlainTextResponse(
        body, media_type="text/vtt" if format == "vtt" else "application/x-subrip"
    )
