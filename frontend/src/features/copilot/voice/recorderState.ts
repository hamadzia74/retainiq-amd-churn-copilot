// The voice recorder's states as a pure reducer (tested in recorderState.test.ts):
// idle -> requesting (mic permission) -> recording -> transcribing -> idle, with cancel and errors.

export type RecorderPhase = "idle" | "requesting" | "recording" | "transcribing" | "error";

export interface RecorderState {
  phase: RecorderPhase;
  seconds: number;
  level: number;          // 0..1 input loudness, for the meter
  error?: string;
}

export type RecorderEvent =
  | { type: "request" }
  | { type: "started" }
  | { type: "tick"; seconds: number }
  | { type: "level"; level: number }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "transcribed" }
  | { type: "failed"; error: string }
  | { type: "dismiss" };

export const initialRecorder: RecorderState = { phase: "idle", seconds: 0, level: 0 };

export function recorderReducer(s: RecorderState, e: RecorderEvent): RecorderState {
  switch (e.type) {
    case "request":
      return s.phase === "idle" || s.phase === "error" ? { ...initialRecorder, phase: "requesting" } : s;
    case "started":
      return s.phase === "requesting" ? { ...s, phase: "recording", seconds: 0 } : s;
    case "tick":
      return s.phase === "recording" ? { ...s, seconds: e.seconds } : s;
    case "level":
      return s.phase === "recording" ? { ...s, level: Math.max(0, Math.min(1, e.level)) } : s;
    case "stop":
      return s.phase === "recording" ? { ...s, phase: "transcribing", level: 0 } : s;
    case "cancel":
      return { ...initialRecorder };
    case "transcribed":
      return s.phase === "transcribing" ? { ...initialRecorder } : s;
    case "failed":
      return { ...initialRecorder, phase: "error", error: e.error };
    case "dismiss":
      return s.phase === "error" ? { ...initialRecorder } : s;
  }
}

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
