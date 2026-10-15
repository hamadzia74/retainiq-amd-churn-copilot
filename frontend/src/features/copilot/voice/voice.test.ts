import { describe, expect, it } from "vitest";
import { formatClock, initialRecorder, recorderReducer, type RecorderEvent, type RecorderState } from "./recorderState";
import { encodeWav, mixToMono, TARGET_RATE } from "./wav";

describe("WAV encoding", () => {
  it("writes a valid 16-bit mono PCM header", () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), TARGET_RATE));
    const text = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(o + i)));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.getUint16(20, true)).toBe(1);                 // PCM
    expect(wav.getUint16(22, true)).toBe(1);                 // mono
    expect(wav.getUint32(24, true)).toBe(16000);
    expect(wav.getUint32(28, true)).toBe(32000);             // byte rate
    expect(wav.getUint32(40, true)).toBe(10);                // 5 samples x 2 bytes
    expect(wav.byteLength).toBe(54);
    expect([wav.getInt16(46, true), wav.getInt16(50, true), wav.getInt16(52, true)]).toEqual([16383, 32767, -32768]);
  });

  it("clamps out-of-range samples", () => {
    const wav = new DataView(encodeWav(new Float32Array([3, -3]), TARGET_RATE));
    expect([wav.getInt16(44, true), wav.getInt16(46, true)]).toEqual([32767, -32768]);
  });

  it("averages channels to mono", () => {
    expect([...mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
    const one = new Float32Array([0.25]);
    expect(mixToMono([one])).toBe(one);
  });
});

describe("recorder states", () => {
  const run = (...events: RecorderEvent[]) => events.reduce<RecorderState>(recorderReducer, initialRecorder);

  it("goes idle -> requesting -> recording -> transcribing -> idle", () => {
    expect(run({ type: "request" }).phase).toBe("requesting");
    expect(run({ type: "request" }, { type: "started" }).phase).toBe("recording");
    const recording = run({ type: "request" }, { type: "started" }, { type: "tick", seconds: 3.4 }, { type: "level", level: 0.6 });
    expect(recording).toMatchObject({ phase: "recording", seconds: 3.4, level: 0.6 });
    expect(recorderReducer(recording, { type: "stop" }).phase).toBe("transcribing");
    expect(run({ type: "request" }, { type: "started" }, { type: "stop" }, { type: "transcribed" })).toEqual(initialRecorder);
  });

  it("cancel always returns to idle", () => {
    expect(run({ type: "request" }, { type: "started" }, { type: "cancel" })).toEqual(initialRecorder);
    expect(run({ type: "request" }, { type: "cancel" })).toEqual(initialRecorder);
  });

  it("permission denied and failed transcription become a dismissible error", () => {
    const denied = run({ type: "request" }, { type: "failed", error: "Microphone access was blocked." });
    expect(denied).toMatchObject({ phase: "error", error: "Microphone access was blocked." });
    expect(recorderReducer(denied, { type: "dismiss" })).toEqual(initialRecorder);
    expect(recorderReducer(denied, { type: "request" }).phase).toBe("requesting");     // can try again
  });

  it("ignores events that don't fit the current phase", () => {
    expect(run({ type: "started" })).toEqual(initialRecorder);                 // not requested
    expect(run({ type: "tick", seconds: 5 })).toEqual(initialRecorder);
    expect(run({ type: "request" }, { type: "request" }).phase).toBe("requesting");
    expect(run({ type: "level", level: 9 })).toEqual(initialRecorder);
    expect(run({ type: "request" }, { type: "started" }, { type: "level", level: 9 }).level).toBe(1);   // clamped
  });

  it("formats the timer", () => {
    expect([formatClock(0), formatClock(7.9), formatClock(60)]).toEqual(["0:00", "0:07", "1:00"]);
  });
});
