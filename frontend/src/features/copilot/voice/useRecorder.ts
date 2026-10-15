import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "../../../api/client";
import { initialRecorder, recorderReducer } from "./recorderState";
import { toWav16k } from "./wav";

export const MAX_SECONDS = 60;

export const recordingSupported = () =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

function micError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked. Allow it in the browser to use voice.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found.";
  return "Couldn't start the microphone.";
}

/**
 * Record up to 60 s from the microphone, then transcribe it on AMD.
 * `onText` gets the transcript; it never sends anything by itself.
 */
export function useRecorder(onText: (text: string) => void) {
  const [state, dispatch] = useReducer(recorderReducer, initialRecorder);
  const media = useRef<{ stream?: MediaStream; recorder?: MediaRecorder; ctx?: AudioContext; raf?: number; timer?: number }>({});
  const cancelled = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  /** Release the microphone and stop the meter/timer. */
  const release = useCallback(() => {
    const m = media.current;
    if (m.raf) cancelAnimationFrame(m.raf);
    if (m.timer) window.clearInterval(m.timer);
    m.stream?.getTracks().forEach((t) => t.stop());
    void m.ctx?.close().catch(() => {});
    media.current = { recorder: m.recorder };
  }, []);

  const stop = useCallback(() => {
    const rec = media.current.recorder;
    if (rec && rec.state !== "inactive") rec.stop();      // -> onstop: transcribe
  }, []);

  const start = useCallback(async () => {
    if (!recordingSupported()) {
      dispatch({ type: "failed", error: "This browser can't record audio." });
      return;
    }
    cancelled.current = false;
    dispatch({ type: "request" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      dispatch({ type: "failed", error: micError(err) });
      return;
    }
    if (cancelled.current) {                               // cancelled while the permission prompt was open
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      release();
      if (cancelled.current) return;
      dispatch({ type: "stop" });
      try {
        const wav = await toWav16k(new Blob(chunks, { type: recorder.mimeType }));
        const { text } = await api.transcribe(wav);
        dispatch({ type: "transcribed" });
        onTextRef.current(text);
      } catch (err) {
        dispatch({ type: "failed", error: (err as Error).message || "Couldn't transcribe that. Try again." });
      }
    };

    // Live input level for the meter (RMS of the waveform, scaled up for normal speech).
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const meter = () => {
      analyser.getFloatTimeDomainData(samples);
      if (frame++ % 3 === 0) {
        const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
        dispatch({ type: "level", level: Math.min(1, rms * 4) });
      }
      media.current.raf = requestAnimationFrame(meter);
    };

    const began = performance.now();
    const timer = window.setInterval(() => {
      const seconds = (performance.now() - began) / 1000;
      dispatch({ type: "tick", seconds });
      if (seconds >= MAX_SECONDS) stop();                  // hard limit: stop and transcribe
    }, 250);

    media.current = { stream, recorder, ctx, timer };
    recorder.start();
    dispatch({ type: "started" });
    meter();
  }, [release, stop]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    const rec = media.current.recorder;
    if (rec && rec.state !== "inactive") rec.stop();
    release();
    dispatch({ type: "cancel" });
  }, [release]);

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  // Errors fade after a few seconds; leaving the page releases the microphone.
  useEffect(() => {
    if (state.phase !== "error") return;
    const t = window.setTimeout(() => dispatch({ type: "dismiss" }), 5000);
    return () => window.clearTimeout(t);
  }, [state.phase]);
  useEffect(() => () => { cancelled.current = true; media.current.recorder?.state === "recording" && media.current.recorder.stop(); release(); }, [release]);

  return { state, start, stop, cancel, dismiss };
}
