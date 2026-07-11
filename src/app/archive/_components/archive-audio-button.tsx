"use client";

import { AudioPlayButton } from "@/components/audio-play-button";
import { signAudio } from "@/app/_actions/sign-audio";

// Client boundary that turns a storage path into a lazy resolveSrc closure
// (server components can't pass functions as props). The signed URL is
// fetched on the first tap rather than at page render, so pages listing many
// memos don't sign every path up front.
export default function ArchiveAudioButton({ path }: { path: string }) {
  return <AudioPlayButton resolveSrc={() => signAudio(path)} />;
}
