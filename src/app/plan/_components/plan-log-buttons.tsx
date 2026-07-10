"use client";

import { useState } from "react";
import VoiceReview from "@/app/_components/voice-review";
import TextComposer from "@/app/_components/text-composer";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import { CloseIcon } from "@/components/icons";
import { formatElapsed } from "@/lib/format";
import type { ChatSummary, Me } from "@/lib/types";

// Voice/text log buttons for the plan's next unread day. Tapping one runs
// the full log flow right here, layered over the plan page: the passage
// reference is prefilled from the plan entry, so the resulting log completes
// this day via the messages trigger, and VoiceReview/TextComposer's
// router.refresh() then re-renders the page with the day marked done.
//
// The plan page scrolls as a document (unlike home's fixed shell), so the
// overlays sit in a `fixed` wrapper — VoiceReview/TextComposer's own
// `absolute inset-0` fills it.
export default function PlanLogButtons({
  me,
  chats,
  reference,
  passage,
}: {
  me: Me;
  chats: ChatSummary[];
  /** Prefill for the log's reference field — always parseReferenceInput-valid. */
  reference: string;
  /** Display form of the entry's passage, for the button labels. */
  passage: string;
}) {
  const [flow, setFlow] = useState<"review" | "text" | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [exiting, setExiting] = useState(false);

  const recorder = useVoiceRecorder({
    onReview: (recordedBlob) => {
      setBlob(recordedBlob);
      setFlow("review");
    },
  });

  const closeOverlay = () => {
    setExiting(true);
    setTimeout(() => {
      setFlow(null);
      setBlob(null);
      setExiting(false);
    }, 200);
  };

  return (
    <>
      {/* Negative vertical margin keeps the 32px tap targets from making
          this card taller than the other pending cards (whose rows are the
          20px text line). */}
      <span className="-my-1.5 flex items-center">
        <button
          type="button"
          onClick={recorder.start}
          aria-label={`Record a voice log for ${passage}`}
          className="flex h-8 w-8 items-center justify-center rounded-full active:bg-neutral-700"
        >
          <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-red-500" />
        </button>
        <button
          type="button"
          onClick={() => setFlow("text")}
          aria-label={`Type a log for ${passage}`}
          className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-lg italic text-neutral-300 active:bg-neutral-700"
        >
          <span aria-hidden className="translate-x-[-0.5px]">t</span>
        </button>
      </span>

      {recorder.recording ? (
        <div className="screen-fade-in fixed inset-0 z-30 flex flex-col bg-neutral-900 text-neutral-100">
          <header className="flex items-center justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Cancel recording"
              className="rounded-full p-2 active:bg-neutral-800"
            >
              <CloseIcon className="h-6 w-6 text-neutral-300" />
            </button>
          </header>
          <div className="flex flex-1 items-center justify-center px-8">
            <p className="text-md text-center italic text-neutral-600">
              {recorder.stopping
                ? "finishing up…"
                : recorder.recordingReady
                  ? `logging ${reference}`
                  : "connecting…"}
            </p>
          </div>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            <div className="mb-2 flex min-h-5 justify-center text-sm text-neutral-400">
              <p aria-hidden={!recorder.recordingReady} className="text-center tabular-nums">
                {recorder.recordingReady ? formatElapsed(recorder.elapsedMs) : " "}
              </p>
            </div>
            <button
              type="button"
              onClick={recorder.stop}
              disabled={recorder.stopping}
              aria-label="Stop recording"
              className="flex h-20 w-full items-center justify-center rounded-md border border-red-500 bg-transparent active:bg-red-500/10 disabled:opacity-60"
            >
              <span aria-hidden className="block h-8 w-8 rounded-sm bg-red-500" />
            </button>
          </div>
        </div>
      ) : null}
      {recorder.micError && !recorder.recording ? (
        <p className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 z-30 px-8 text-center text-sm text-red-400">
          {recorder.micError}
        </p>
      ) : null}

      {flow === "review" && blob ? (
        <div className="fixed inset-0 z-30">
          <VoiceReview
            me={me}
            chats={chats}
            blob={blob}
            initialTranscript={recorder.realtimeTranscript}
            liveTranscribing={recorder.liveTranscribing}
            initialReference={reference}
            onClose={closeOverlay}
            exiting={exiting}
          />
        </div>
      ) : null}
      {flow === "text" ? (
        <div className="fixed inset-0 z-30">
          <TextComposer
            me={me}
            chats={chats}
            initialReference={reference}
            onClose={closeOverlay}
            exiting={exiting}
          />
        </div>
      ) : null}
    </>
  );
}
