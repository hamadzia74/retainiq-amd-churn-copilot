// Turn a browser recording (usually WebM/Opus) into a small 16 kHz mono WAV - the format the
// transcription model takes. The encoders are pure and unit-tested in wav.test.ts.

export const TARGET_RATE = 16000;

/** Average any number of channels into one. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** 16-bit PCM WAV file from float samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);              // fmt chunk size
  v.setUint16(20, 1, true);               // PCM
  v.setUint16(22, 1, true);               // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);  // byte rate
  v.setUint16(32, 2, true);               // block align
  v.setUint16(34, 16, true);              // bits per sample
  str(36, "data");
  v.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Decode a recording and resample it to a 16 kHz mono WAV blob (browser only). */
export async function toWav16k(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * TARGET_RATE)), TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;               // a 1-channel offline context mixes down to mono for us
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), TARGET_RATE)], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}
