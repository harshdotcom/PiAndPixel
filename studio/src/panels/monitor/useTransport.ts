import { useEffect, useMemo, useState, type RefObject } from "react";
import { onSeekRequest, publishPlayback } from "../../state/playback";
import type { MonitorSource } from "../../state/renders";
import { frameAt } from "./timecode";

export interface Transport {
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  toggle: () => void;
  seek: (seconds: number) => void;
  step: (frames: number) => void;
  toStart: () => void;
  toEnd: () => void;
  setLoop: (loop: boolean) => void;
}

const STOPPED = { time: 0, duration: 0, playing: false };

/** Follows the element's clock: every animation frame while playing, on events otherwise. */
function useVideoClock(ref: RefObject<HTMLVideoElement | null>, key: string | null) {
  const [clock, setClock] = useState({ ...STOPPED, key });
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let frame = 0;
    const read = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      setClock({ time: video.currentTime, duration, playing: !video.paused, key });
    };
    const tick = () => {
      read();
      if (!video.paused) frame = requestAnimationFrame(tick);
    };
    const events = ["loadedmetadata", "seeked", "pause", "ended", "emptied"];
    events.forEach((e) => video.addEventListener(e, read));
    video.addEventListener("play", tick);
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((e) => video.removeEventListener(e, read));
      video.removeEventListener("play", tick);
    };
  }, [ref, key]);
  // A clock of another (or no) video means nothing has loaded yet.
  const { time, duration, playing } = clock.key === key ? clock : STOPPED;
  return useMemo(() => ({ time, duration, playing }), [time, duration, playing]);
}

/** Custom transport for the Program Monitor's <video> (the native controls are off). */
export function useTransport(ref: RefObject<HTMLVideoElement | null>, source: MonitorSource | null, fps: number, key: string | null): Transport {
  const clock = useVideoClock(ref, key);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    publishPlayback({ source, ...clock });
  }, [source, clock]);

  const seek = (seconds: number) => {
    const video = ref.current;
    if (video) video.currentTime = Math.min(Math.max(0, seconds), clock.duration || 0);
  };
  useEffect(() => onSeekRequest(seek));

  // Seek to the middle of the target frame so the timecode never lands on a boundary.
  const step = (frames: number) => {
    ref.current?.pause();
    seek((frameAt(ref.current?.currentTime ?? 0, fps) + frames + 0.5) / fps);
  };
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };
  return {
    ...clock,
    loop,
    toggle,
    seek,
    step,
    toStart: () => seek(0),
    toEnd: () => seek(clock.duration),
    setLoop,
  };
}
