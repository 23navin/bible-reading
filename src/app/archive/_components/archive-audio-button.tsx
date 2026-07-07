"use client";

import { useEffect, useRef, useState } from "react";
import { signAudio } from "@/app/_actions/sign-audio";

// The signed URL is fetched on the first tap rather than at page render, so
// pages listing many memos don't sign every path up front. The URL is kept on
// the <audio> element afterwards, so subsequent taps play immediately.
export default function ArchiveAudioButton({ path }: { path: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || isLoading) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!audio.src) {
      setIsLoading(true);
      try {
        const url = await signAudio(path);
        if (!url) return;
        audio.src = url;
      } finally {
        setIsLoading(false);
      }
    }
    audio.play().catch((err) => {
      console.error("audio play failed", err);
    });
  };

  return (
    <>
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause audio" : "Play audio"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white active:scale-95 ${isLoading ? "animate-pulse" : ""}`}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M8 5v14l12-7z" />
          </svg>
        )}
      </button>
      <audio ref={audioRef} preload="none" className="hidden" />
    </>
  );
}
