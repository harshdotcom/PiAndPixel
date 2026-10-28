import { useEffect, useState, type RefObject } from "react";
import { apiBlob } from "../../api/client";
import type { NarrationAudioClip } from "../../api/types";

type PreviewStatus = "loading" | "ready" | "error" | null;

interface PreviewClip extends NarrationAudioClip {
  audio: HTMLAudioElement;
  url: string;
}

function audioPath(pid: string, composition: string, audioId: string): string {
  const query = new URLSearchParams({ composition });
  return `/api/v1/projects/${encodeURIComponent(pid)}/narration/audio/${audioId}?${query}`;
}

function syncAudio(video: HTMLVideoElement, clips: PreviewClip[]): void {
  for (const clip of clips) {
    const sourceTime = clip.source_start_s + video.currentTime - clip.start_s;
    const active = clip.enabled && sourceTime >= clip.source_start_s && sourceTime < clip.source_end_s;
    if (!active) {
      clip.audio.pause();
      continue;
    }
    if (Math.abs(clip.audio.currentTime - sourceTime) > 0.12) clip.audio.currentTime = sourceTime;
    clip.audio.volume = Math.min(1, Math.max(0, clip.gain));
    clip.audio.playbackRate = video.playbackRate;
    if (video.paused) clip.audio.pause();
    else if (clip.audio.paused) void clip.audio.play().catch(() => undefined);
  }
}

/** Plays enabled A1 audio alongside a scene render in the Program Monitor. */
export function useNarrationPreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  pid: string,
  composition: string | null,
  clips: NarrationAudioClip[],
  artifactId: string | null,
  enabled: boolean,
): PreviewStatus {
  const [status, setStatus] = useState<PreviewStatus>(null);

  useEffect(() => {
    const video = videoRef.current;
    const activeClips = clips.filter((clip) => clip.enabled);
    if (!video || !composition || !enabled || activeClips.length === 0) {
      setStatus(null);
      return;
    }

    let live = true;
    let frame = 0;
    let audioClips: PreviewClip[] = [];
    setStatus("loading");

    const tick = () => {
      if (!live) return;
      syncAudio(video, audioClips);
      if (!video.paused) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => tick();
    const onPause = () => audioClips.forEach((clip) => clip.audio.pause());
    const onSeek = () => syncAudio(video, audioClips);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("timeupdate", onSeek);

    void Promise.all(activeClips.map(async (clip) => {
      const blob = await apiBlob(audioPath(pid, composition, clip.audio_id));
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = "auto";
      return { ...clip, audio, url };
    })).then((loaded) => {
      if (!live) {
        loaded.forEach((clip) => URL.revokeObjectURL(clip.url));
        return;
      }
      audioClips = loaded;
      setStatus("ready");
      tick();
    }).catch(() => {
      if (live) setStatus("error");
    });

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("timeupdate", onSeek);
      audioClips.forEach((clip) => {
        clip.audio.pause();
        URL.revokeObjectURL(clip.url);
      });
    };
  }, [artifactId, clips, composition, enabled, pid, videoRef]);

  return status;
}
