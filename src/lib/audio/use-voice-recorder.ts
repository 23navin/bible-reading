"use client";

import { useEffect, useRef, useState } from "react";
import { SpeechmaticsSession } from "@/lib/speech/speechmatics";

// The voice-memo capture pipeline — mic stream, MediaRecorder, and the
// realtime Speechmatics session — extracted from the home screen so the
// plan page's log overlay can record too. The caller renders the UI; this
// hook owns the state machine.
//
// start() begins capture (triggering the mic prompt), stop() finalizes the
// recording and hands the finished blob to onReview, cancel() aborts
// silently. While recording, realtimeTranscript is "" (or the partials so
// far) when realtime is the source of truth; it downgrades to null only if
// the session fails, telling the review step to fall back to Whisper.
export function useVoiceRecorder({
  onReview,
}: {
  onReview: (blob: Blob) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string | null>(null);
  const [liveTranscribing, setLiveTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const sessionRef = useRef<SpeechmaticsSession | null>(null);
  const finalTextRef = useRef("");
  const realtimeFailedRef = useRef(false);
  const onReviewRef = useRef(onReview);

  useEffect(() => {
    onReviewRef.current = onReview;
  }, [onReview]);

  useEffect(() => {
    if (!recording) return;

    let aborted = false;
    let activeRec: MediaRecorder | null = null;

    // Mint the Speechmatics token in parallel with the start animation and
    // mic-permission prompt so it's ready when SpeechmaticsSession needs it.
    const tokenPromise: Promise<string | undefined> = fetch(
      "/api/speech/token",
      { method: "POST" },
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ token: string }>) : null))
      .then((d) => d?.token)
      .catch(() => undefined);

    const finalizeAndReview = async (recordedBlob: Blob) => {
      // Null the session ref before flipping `recording` so the cleanup
      // below doesn't abort the live session out from under us.
      const session = sessionRef.current;
      sessionRef.current = null;

      if (realtimeFailedRef.current) {
        // Realtime never came up. Fall back to Whisper: hand the blob to
        // the review step, which will transcribe it itself.
        session?.abort();
        setRealtimeTranscript(null);
        setRecording(false);
        onReviewRef.current(recordedBlob);
        return;
      }

      // Realtime is alive. Move to review immediately so the user sees the
      // streaming transcript fill in, and finish the stop in the background.
      // Cleanup + passage parsing happen in the review step once the
      // transcript settles.
      setLiveTranscribing(true);
      setRecording(false);
      onReviewRef.current(recordedBlob);

      if (session) {
        try {
          const finalText = await session.stop();
          if (finalText) finalTextRef.current = finalText;
          setRealtimeTranscript(finalTextRef.current);
        } catch (err) {
          console.warn("speechmatics stop failed", err);
        }
      }
      setLiveTranscribing(false);
    };

    // Bring up the Speechmatics audio path BEFORE starting MediaRecorder.
    // On iOS, attaching an AudioContext to a getUserMedia stream briefly
    // reconfigures the audio session for voice processing — that reroute
    // drops a few ms of samples. If MediaRecorder is already recording when
    // it happens, those dropped samples show up as a stitched/skipped
    // syllable at the start of the clip. Doing prepareAudio first keeps
    // the disruption out of the recording entirely.
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Voice memos are mono speech — 32 kbps keeps files small (storage
        // egress is billed) and Safari treats this as a hint it may ignore.
        const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 });
        activeRec = rec;
        chunksRef.current = [];
        finalTextRef.current = "";
        realtimeFailedRef.current = false;
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (aborted) return;
          const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          void finalizeAndReview(b);
        };

        const session = new SpeechmaticsSession({
          onPartial: (full) => {
            // Partials only fire during recording (Speechmatics stops sending
            // them after StopRecognition). Pushing them into state lets a
            // post-stop view show the trailing partial without a stutter
            // while the final segments catch up.
            setRealtimeTranscript(full);
          },
          onFinal: (full) => {
            finalTextRef.current = full;
            setRealtimeTranscript(full);
          },
          onError: (err) => {
            console.warn("speechmatics error", err);
            realtimeFailedRef.current = true;
          },
        });
        // Track immediately so a stop/cancel mid-handshake can abort it.
        sessionRef.current = session;

        try {
          await session.prepareAudio(stream);
        } catch (err) {
          console.warn("speechmatics prepareAudio failed", err);
          realtimeFailedRef.current = true;
          session.abort();
          if (sessionRef.current === session) sessionRef.current = null;
        }
        if (aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        rec.start();
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        recorderRef.current = rec;
        setRecordingReady(true);

        if (!realtimeFailedRef.current) {
          void (async () => {
            try {
              const token = await tokenPromise;
              await session.connectClient(token ? { token } : undefined);
              if (aborted) {
                session.abort();
                if (sessionRef.current === session) sessionRef.current = null;
              }
            } catch (err) {
              console.warn("speechmatics connectClient failed", err);
              realtimeFailedRef.current = true;
              session.abort();
              if (sessionRef.current === session) sessionRef.current = null;
            }
          })();
        }
      } catch {
        if (!aborted) {
          setMicError("Microphone access denied.");
          setRecording(false);
        }
      }
    })();

    return () => {
      aborted = true;
      if (recorderRef.current === activeRec) recorderRef.current = null;
      if (activeRec && activeRec.state !== "inactive") activeRec.stop();
      if (sessionRef.current) {
        sessionRef.current.abort();
        sessionRef.current = null;
      }
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    setMicError(null);
    finalTextRef.current = "";
    realtimeFailedRef.current = false;
    // Empty string (vs. null) signals to the review step that realtime is
    // the source of truth; only a failed session downgrades it to null.
    setRealtimeTranscript("");
    setLiveTranscribing(false);
    setRecordingReady(false);
    setStopping(false);
    setElapsedMs(0);
    setRecording(true);
  };

  const stop = () => {
    if (!recordingReady) {
      // Tapped before the session finished connecting — treat it as a
      // cancel rather than a silent no-op.
      setRecording(false);
      return;
    }
    if (stopping) return;
    setStopping(true);
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const cancel = () => setRecording(false);

  return {
    recording,
    recordingReady,
    stopping,
    elapsedMs,
    micError,
    realtimeTranscript,
    liveTranscribing,
    start,
    stop,
    cancel,
  };
}
