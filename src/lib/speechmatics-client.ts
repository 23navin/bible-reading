"use client";

import {
  RealtimeClient,
  type AddPartialTranscript,
  type AddTranscript,
  type RealtimeServerMessage,
} from "@speechmatics/real-time-client";

// AudioWorklet that emits Int16 PCM from the input stream. Loaded as a Blob
// URL so we don't need a static asset under /public.
const PCM_WORKLET_SOURCE = `
class PCMS16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const ch = input[0];
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-s16le-processor', PCMS16Processor);
`;

export type SpeechmaticsCallbacks = {
  onPartial?: (text: string) => void;
  /** Called whenever a new final segment is appended. Receives the full accumulated final text. */
  onFinal?: (fullText: string) => void;
  onError?: (err: unknown) => void;
};

export class SpeechmaticsSession {
  private client: RealtimeClient | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private finalText = "";
  private partialText = "";
  private started = false;
  private stopping = false;

  constructor(private readonly callbacks: SpeechmaticsCallbacks = {}) {}

  /** Full accumulated final transcript text. Stable — does not include unconfirmed partials. */
  get finalTranscript(): string {
    return this.finalText;
  }

  /** Most recent partial (may change). */
  get partialTranscript(): string {
    return this.partialText;
  }

  /** Best-effort full transcript: finals + trailing partial. */
  get fullTranscript(): string {
    if (!this.partialText) return this.finalText;
    return this.finalText
      ? `${this.finalText} ${this.partialText}`.replace(/\s+/g, " ")
      : this.partialText;
  }

  async start(stream: MediaStream, opts?: { token?: string }): Promise<void> {
    if (this.started) throw new Error("Session already started");
    this.started = true;

    let token = opts?.token;
    if (!token) {
      const tokenRes = await fetch("/api/speechmatics-token", { method: "POST" });
      if (!tokenRes.ok) throw new Error("Failed to fetch Speechmatics token");
      ({ token } = (await tokenRes.json()) as { token: string });
    }

    const AudioCtx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioCtx();
    this.audioContext = audioContext;

    const workletBlob = new Blob([PCM_WORKLET_SOURCE], {
      type: "application/javascript",
    });
    const workletUrl = URL.createObjectURL(workletBlob);
    try {
      await audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const client = new RealtimeClient();
    this.client = client;

    client.addEventListener("receiveMessage", (ev) => {
      this.handleMessage(ev.data);
    });

    await client.start(token, {
      transcription_config: {
        language: "en",
        enable_partials: true,
        operating_point: "enhanced",
        max_delay: 1,
      },
      audio_format: {
        type: "raw",
        encoding: "pcm_s16le",
        sample_rate: audioContext.sampleRate,
      },
    });

    const source = audioContext.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(audioContext, "pcm-s16le-processor");
    node.port.onmessage = (ev) => {
      if (this.stopping || !this.client) return;
      try {
        this.client.sendAudio(ev.data as ArrayBuffer);
      } catch (err) {
        this.callbacks.onError?.(err);
      }
    };
    source.connect(node);
    // AudioWorkletNode must have a destination for `process` to run in some
    // browsers — connect to a muted gain to keep audio silent.
    const muted = audioContext.createGain();
    muted.gain.value = 0;
    node.connect(muted).connect(audioContext.destination);

    this.sourceNode = source;
    this.workletNode = node;
  }

  /** Send EndOfStream and wait for EndOfTranscript. Returns the final transcript. */
  async stop(): Promise<string> {
    this.stopping = true;
    try {
      try {
        this.workletNode?.disconnect();
      } catch {}
      try {
        this.sourceNode?.disconnect();
      } catch {}
      this.workletNode = null;
      this.sourceNode = null;

      if (this.client) {
        try {
          await this.client.stopRecognition();
        } catch (err) {
          this.callbacks.onError?.(err);
        }
        this.client = null;
      }
    } finally {
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
    }
    return this.finalText;
  }

  /** Abort without waiting for EndOfTranscript. */
  abort(): void {
    this.stopping = true;
    try {
      this.workletNode?.disconnect();
      this.sourceNode?.disconnect();
    } catch {}
    this.workletNode = null;
    this.sourceNode = null;
    this.client = null;
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private handleMessage(msg: RealtimeServerMessage) {
    if (msg.message === "AddTranscript") {
      const text = (msg as AddTranscript).metadata.transcript;
      if (text) {
        this.finalText = this.finalText
          ? `${this.finalText}${text.startsWith(" ") ? "" : " "}${text}`
          : text;
        this.finalText = this.finalText.trim();
        this.partialText = "";
        this.callbacks.onFinal?.(this.finalText);
      }
    } else if (msg.message === "AddPartialTranscript") {
      const text = (msg as AddPartialTranscript).metadata.transcript;
      this.partialText = text ?? "";
      this.callbacks.onPartial?.(this.fullTranscript);
    } else if (msg.message === "Error") {
      this.callbacks.onError?.(msg);
    }
  }
}
