"use client";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";

// One play/pause button + hidden <audio preload="none"> element, shared by
// the chat bubbles (pre-signed `src`) and the archive/plan cards
// (`resolveSrc` signs lazily on the first tap; the URL then stays on the
// element so later taps play immediately).
export function AudioPlayButton({
  src,
  resolveSrc,
  className = "bg-white/20 text-white",
}: {
  src?: string | null;
  resolveSrc?: () => Promise<string | null>;
  className?: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("ended", onStop);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onStop);
      audio.removeEventListener("ended", onStop);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || isLoading) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!audio.src && resolveSrc) {
      setIsLoading(true);
      try {
        const url = await resolveSrc();
        if (!url) return;
        audio.src = url;
      } finally {
        setIsLoading(false);
      }
    }
    if (!audio.src) return;
    audio.play().catch((err) => {
      console.error("audio play failed", err);
    });
  };

  return (
    <>
      <button
        onClick={togglePlay}
        // Don't let a play tap register as a bubble gesture (double-tap
        // heart / swipe) when rendered inside one.
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={isPlaying ? "Pause audio" : "Play audio"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full active:scale-95 ${
          isLoading ? "animate-pulse" : ""
        } ${className}`}
      >
        {isPlaying ? (
          <PauseIcon className="h-4 w-4" />
        ) : (
          <PlayIcon className="h-4 w-4" />
        )}
      </button>
      <audio ref={audioRef} src={src ?? undefined} preload="none" className="hidden" />
    </>
  );
}
