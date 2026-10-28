import { useEffect, useMemo, useState } from "react";
import { apiBlob } from "../../api/client";
import {
  useAlignNarration,
  useDraftNarration,
  useNarration,
  useProviderStatus,
  useSaveNarration,
  useSaveNarrationOffset,
  useSaveNarrationTiming,
  useSaveNarrationTimeline,
  useSynthesizeNarration,
} from "../../api/narration";
import type { NarrationWord } from "../../api/types";
import { useComposition } from "../../state/composition";
import { useSceneDurations } from "../timeline/useSceneDurations";
import { Button } from "../../ui/Button";
import { ErrorText } from "../../ui/ErrorText";
import { fieldClass } from "../../ui/Select";

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function NarrationPanel({ pid }: { pid: string }) {
  const compositionState = useComposition();
  const composition = compositionState.selected;
  const clips = compositionState.draft?.clips ?? [];
  const clipSignature = JSON.stringify(clips.map((clip) => [clip.scene, clip.paramsText]));
  const sceneRefs = clips.map((clip) => clip.scene);
  const sceneDurations = useSceneDurations(pid, sceneRefs);
  const measuredVideoSeconds = sceneRefs.length > 0 && sceneRefs.every((scene) => sceneDurations.has(scene))
    ? sceneRefs.reduce((total, scene) => total + (sceneDurations.get(scene) ?? 0), 0)
    : null;
  const providers = useProviderStatus();
  const narration = useNarration(pid, composition);
  const draft = useDraftNarration(pid);
  const save = useSaveNarration(pid, composition ?? "");
  const synthesize = useSynthesizeNarration(pid, composition ?? "");
  const align = useAlignNarration(pid, composition ?? "");
  const saveTiming = useSaveNarrationTiming(pid, composition ?? "");
  const saveTimeline = useSaveNarrationTimeline(pid, composition ?? "");
  const saveOffset = useSaveNarrationOffset(pid, composition ?? "");
  const [context, setContext] = useState("");
  const [text, setText] = useState("");
  const [targetOverride, setTargetOverride] = useState<number | null>(null);
  const [voice, setVoice] = useState("aura-2-thalia-en");
  const [offset, setOffset] = useState(0);
  const [words, setWords] = useState<NarrationWord[]>([]);
  const segment = narration.data?.segments[0];
  const audioClips = narration.data?.audio_clips ?? [];
  const voiceOnTimeline = audioClips.some((clip) => clip.audio_id === segment?.audio_id);
  const targetSeconds = targetOverride ?? (measuredVideoSeconds === null
    ? null
    : Math.round(measuredVideoSeconds * 10) / 10);
  const needsReview = useMemo(() => words.some((word) => !word.matched), [words]);

  useEffect(() => setTargetOverride(null), [composition, clipSignature]);

  useEffect(() => setText(segment?.text ?? ""), [composition, segment?.text]);
  useEffect(() => setWords(segment?.words ?? []), [segment?.id, segment?.words]);
  useEffect(() => setOffset(segment?.start_offset_s ?? 0), [segment?.id, segment?.start_offset_s]);

  const audioUrl = segment?.audio_id && composition
    ? `/api/v1/projects/${encodeURIComponent(pid)}/narration/audio/${segment.audio_id}?composition=${encodeURIComponent(composition)}`
    : null;
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setAudioSrc(null);
    if (audioUrl) {
      void apiBlob(audioUrl).then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setAudioSrc(objectUrl);
      }).catch(() => setAudioSrc(null));
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioUrl]);

  async function makeVoice() {
    if (!composition) return;
    try {
      if (text.trim() !== segment?.text) await save.mutateAsync(text.trim());
      const generated = await synthesize.mutateAsync(voice);
      const generatedSegment = generated.segments[0];
      if (generatedSegment) await align.mutateAsync(generatedSegment.id);
    } catch {
      // The provider mutation displays the failure; synthesized audio remains available to retry alignment.
    }
  }

  async function downloadCaptions(format: "vtt" | "srt") {
    if (!composition) return;
    const query = new URLSearchParams({ composition, format });
    const path = `/api/v1/projects/${encodeURIComponent(pid)}/narration/captions?${query}`;
    saveBlob(await apiBlob(path), `${composition}.${format}`);
  }

  if (!composition) return <p className="p-3 text-xs text-fg-3">Create or select a composition first.</p>;

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-auto p-3 text-xs">
      <div className="grid content-start gap-3 @lg:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-md border border-line bg-sunken/40 p-3">
        <div>
          <div className="font-semibold text-base text-fg">Narration draft</div>
          <p className="mt-1 text-fg-3">Use the selected Manim scene and measured video length to shape a spoken script.</p>
        </div>
        <label className="block space-y-1 text-fg-2">
          <span>Direction and context</span>
          <textarea value={context} onChange={(event) => setContext(event.target.value)} maxLength={4000}
            className={`${fieldClass} min-h-20 w-full resize-y`} placeholder="Describe the audience, key ideas, and facts the narration should cover." />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-fg-2">Target duration (seconds)
            <input type="number" min={1} max={180} step="0.1" value={targetSeconds ?? ""}
              onChange={(event) => setTargetOverride(event.target.value ? Number(event.target.value) : null)}
              className={`${fieldClass} w-32`} />
          </label>
          <Button disabled={!providers.data?.openai || context.trim().length < 10 || targetSeconds === null || targetSeconds <= 0 || targetSeconds > 180 || draft.isPending}
            onClick={() => targetSeconds !== null && draft.mutate({ composition, context, target_seconds: targetSeconds }, {
              onSuccess: (result) => setText(result.text),
            })}>
            {draft.isPending ? "Drafting…" : "Draft with OpenAI"}
          </Button>
        </div>
        {measuredVideoSeconds === null
          ? <p className="text-warn">Render each clip once to measure the composition duration.</p>
          : <p className="text-fg-3">Measured {measuredVideoSeconds.toFixed(2)} s · about {Math.round((targetSeconds ?? measuredVideoSeconds) * 2.15)} spoken words.</p>}
        <p className="text-fg-3">OpenAI receives this context and selected scene source only when you click Draft.</p>
        {!providers.data?.openai && <p className="text-warn">Set OPENAI_API_KEY in the Agent environment to enable drafts.</p>}
        {draft.error && <ErrorText error={draft.error} />}
      </section>

      <section className="min-w-0 space-y-3 rounded-md border border-line bg-sunken/40 p-3">
        <div>
          <div className="font-semibold text-base text-fg">Review and create voice</div>
          <p className="mt-1 text-fg-3">Edit the script before saving or sending it to Deepgram.</p>
        </div>
        <label className="block space-y-1 text-fg-2"><span>Approved spoken transcript</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={5000}
            className={`${fieldClass} min-h-36 w-full resize-y`} placeholder="Review or write the exact words to be spoken." />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!text.trim() || save.isPending || text.trim() === segment?.text}
            onClick={() => save.mutate(text.trim())}>{save.isPending ? "Saving…" : "Save script"}</Button>
          <select aria-label="Voice" value={voice} onChange={(event) => setVoice(event.target.value)} className={fieldClass}>
            <option value="aura-2-thalia-en">Thalia · warm</option>
            <option value="aura-2-asteria-en">Asteria · bright</option>
            <option value="aura-2-luna-en">Luna · gentle</option>
          </select>
          <Button variant="primary" disabled={!providers.data?.deepgram || !text.trim() || synthesize.isPending || align.isPending}
            onClick={() => void makeVoice()}>{synthesize.isPending || align.isPending ? "Generating and aligning…" : "Generate voice"}</Button>
        </div>
        {!providers.data?.deepgram && <p className="text-warn">Set DEEPGRAM_API_KEY in the Agent environment to enable voice generation.</p>}
        {save.error && <ErrorText error={save.error} />}
        {synthesize.error && <ErrorText error={synthesize.error} />}
        {align.error && <ErrorText error={align.error} />}
      </section>

      {segment?.audio_id && <section className="@lg:col-span-2 min-w-0 space-y-3 rounded-md border border-line bg-sunken/40 p-3">
        <div className="flex items-center justify-between"><span className="font-semibold text-fg">Voice · audio-relative word timing</span>
          <span className="tabular text-fg-3">{segment.audio_duration_s?.toFixed(2) ?? "—"} s</span></div>
        {segment.audio_duration_s !== null && <div className="flex flex-wrap items-center gap-2">
          <Button disabled={voiceOnTimeline || saveTimeline.isPending}
            onClick={() => saveTimeline.mutate([...audioClips, {
              id: crypto.randomUUID().replaceAll("-", ""),
              audio_id: segment.audio_id!,
              start_s: 0,
              source_start_s: 0,
              source_end_s: segment.audio_duration_s!,
              gain: 1,
              enabled: true,
            }])}>
            {saveTimeline.isPending ? "Adding…" : voiceOnTimeline ? "Voice is on A1" : "Add voice to timeline"}
          </Button>
          <span className="text-fg-3">Export mixes enabled A1 clips into the MP4.</span>
        </div>}
        {saveTimeline.error && <ErrorText error={saveTimeline.error} />}
        {segment.audio_duration_s !== null && measuredVideoSeconds !== null && (() => {
          const difference = measuredVideoSeconds - segment.start_offset_s - segment.audio_duration_s;
          if (difference < -1 / 30) return <p role="alert" className="text-warn">Speech exceeds the rendered video by {Math.abs(difference).toFixed(2)} s. Shorten the script and regenerate before exporting.</p>;
          if (difference > 0.75) return <p className="text-warn">Speech ends {difference.toFixed(2)} s before the video. Expand the script if narration should cover the full scene.</p>;
          return <p className="text-fg-3">Speech duration is within 0.75 s of the rendered video.</p>;
        })()}
        <label className="flex items-center gap-2 text-fg-2">Timeline start (seconds)
          <input aria-label="Narration start offset" type="number" min={0} max={1800} step="0.01" value={offset}
            onChange={(event) => setOffset(Number(event.target.value))} className={`${fieldClass} w-24`} />
        </label>
        <Button disabled={saveOffset.isPending || offset === segment.start_offset_s}
          onClick={() => saveOffset.mutate({ segmentId: segment.id, start_offset_s: offset })}>
          {saveOffset.isPending ? "Saving…" : "Save start time"}
        </Button>
        {audioSrc && <audio controls preload="none" src={audioSrc} className="h-8 w-full" />}
        {needsReview && <p role="alert" className="text-warn">Unmatched words need timing review before captions can be exported.</p>}
        {segment.words.length === 0 && <Button disabled={!providers.data?.deepgram || align.isPending}
          onClick={() => align.mutate(segment.id)}>{align.isPending ? "Aligning…" : "Retry word alignment"}</Button>}
        {segment.words.length > 0 && <>
          <div className="max-h-44 overflow-auto rounded border border-line">
            {words.map((word, index) => <div key={`${index}-${word.text}`} className="grid grid-cols-[1fr_68px_68px_42px] items-center gap-1 border-b border-line px-1.5 py-1 last:border-0">
              <input aria-label={`${word.text} transcript text`} value={word.text}
                onChange={(event) => setWords((current) => current.map((item, i) => i === index ? { ...item, text: event.target.value } : item))}
                className={`${fieldClass} w-full ${word.matched ? "" : "border-warn text-warn"}`} />
              <input aria-label={`${word.text} start`} type="number" min={0} step="0.01" value={word.start}
                onChange={(event) => setWords((current) => current.map((item, i) => i === index ? { ...item, start: Number(event.target.value) } : item))}
                className={`${fieldClass} w-full`} />
              <input aria-label={`${word.text} end`} type="number" min={0} step="0.01" value={word.end}
                onChange={(event) => setWords((current) => current.map((item, i) => i === index ? { ...item, end: Number(event.target.value) } : item))}
                className={`${fieldClass} w-full`} />
              <span className="tabular text-right text-fg-3">{Math.round(word.confidence * 100)}%</span>
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saveTiming.isPending} onClick={() => saveTiming.mutate({
              segmentId: segment.id,
              words: words.map(({ text: wordText, start, end }) => ({ text: wordText, start, end })),
            })}>{saveTiming.isPending ? "Saving…" : "Save timing edits"}</Button>
            <Button disabled={needsReview || words.length === 0} onClick={() => void downloadCaptions("vtt")}>Download VTT</Button>
            <Button disabled={needsReview || words.length === 0} onClick={() => void downloadCaptions("srt")}>Download SRT</Button>
          </div>
          {saveTiming.error && <ErrorText error={saveTiming.error} />}
        </>}
      </section>}
      {narration.error && <ErrorText error={narration.error} />}
      </div>
      <div className="mt-auto border-t border-line pt-2 text-fg-3">Provider calls may incur separate charges. They run only when you click Draft or Generate.</div>
    </div>
  );
}
