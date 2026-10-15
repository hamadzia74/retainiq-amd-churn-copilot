// Reads tour steps aloud with the browser's built-in speech (Web Speech API) - no audio
// files, no network. A narrator never overlaps itself: every new line cancels the last.
import { useEffect } from "react";

export interface VoiceLike { name: string; lang: string }

/** Clear, natural English voices first, as in Sentinel EHS; then any English voice. */
export const VOICE_PREFERENCES = [
  /Microsoft.*(Aria|Jenny|Michelle|Ana).*Natural/i,
  /Google US English/i,
  /Natural/i,
  /Samantha/i,
  /Google UK English Female/i,
  /Zira/i,
];

export function pickVoice<V extends VoiceLike>(voices: V[]): V | undefined {
  for (const re of VOICE_PREFERENCES) {
    const v = voices.find((x) => re.test(x.name) && /^en/i.test(x.lang));
    if (v) return v;
  }
  return voices.find((v) => /^en[-_]?US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
}

/** The slice of `speechSynthesis` the narrator uses (stubbed in tests). */
export interface SynthLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export function createNarrator(synth: SynthLike, makeUtterance: (text: string) => SpeechSynthesisUtterance) {
  return {
    /** Speak `text`, cutting off anything still playing. */
    say(text: string) {
      synth.cancel();
      const u = makeUtterance(text);
      u.lang = "en-US";
      u.rate = 1.02;
      u.pitch = 1.05;
      const voice = pickVoice(synth.getVoices());
      if (voice) u.voice = voice;
      synth.speak(u);
    },
    stop() {
      synth.cancel();
    },
  };
}

export const speechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/**
 * Narrate `text` whenever `key` changes, while `enabled`. Stops immediately when the step
 * changes, narration is muted, or the tour closes (unmount).
 */
export function useNarration(text: string, enabled: boolean, key: string) {
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const narrator = createNarrator(synth, (t) => new SpeechSynthesisUtterance(t));
    narrator.stop();
    if (!enabled || !text) return;

    let timer = 0;
    const speak = () => narrator.say(text);
    if (synth.getVoices().length) {
      timer = window.setTimeout(speak, 200);
    } else {
      // Some browsers load voices asynchronously; speak once they arrive (or after a short wait).
      const onVoices = () => {
        window.clearTimeout(timer);
        speak();
      };
      synth.addEventListener("voiceschanged", onVoices, { once: true });
      timer = window.setTimeout(speak, 600);
      return () => {
        window.clearTimeout(timer);
        synth.removeEventListener("voiceschanged", onVoices);
        narrator.stop();
      };
    }
    return () => {
      window.clearTimeout(timer);
      narrator.stop();
    };
  }, [text, enabled, key]);
}
