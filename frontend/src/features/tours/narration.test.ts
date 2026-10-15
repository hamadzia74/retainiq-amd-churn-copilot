import { describe, expect, it, vi } from "vitest";
import { createNarrator, pickVoice, type SynthLike } from "./narration";

const voice = (name: string, lang = "en-US") => ({ name, lang }) as SpeechSynthesisVoice;

function stubSynth(voices: SpeechSynthesisVoice[] = []) {
  const log: string[] = [];
  const synth: SynthLike = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => log.push(`speak:${u.text}`)),
    cancel: vi.fn(() => log.push("cancel")),
    getVoices: () => voices,
  };
  const make = (text: string) => ({ text }) as SpeechSynthesisUtterance;
  return { synth, log, make };
}

describe("narration", () => {
  it("cancels whatever is playing before every new line (never overlaps)", () => {
    const { synth, log, make } = stubSynth();
    const n = createNarrator(synth, make);
    n.say("Step one");
    n.say("Step two");
    expect(log).toEqual(["cancel", "speak:Step one", "cancel", "speak:Step two"]);
  });

  it("stop() cancels speech (used on close, mute and step change)", () => {
    const { synth, make } = stubSynth();
    createNarrator(synth, make).stop();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it("uses the preferred natural English voice", () => {
    const { synth, make } = stubSynth([voice("Microsoft David"), voice("Microsoft Aria Online (Natural)"), voice("Google français", "fr-FR")]);
    const spoken: SpeechSynthesisUtterance[] = [];
    synth.speak = (u) => { spoken.push(u); };
    createNarrator(synth, make).say("Hello");
    expect(spoken[0].voice?.name).toBe("Microsoft Aria Online (Natural)");
    expect(spoken[0].lang).toBe("en-US");
  });

  it("falls back to any English voice, and ignores non-English ones", () => {
    expect(pickVoice([voice("Hortense", "fr-FR"), voice("Some UK voice", "en-GB")])?.name).toBe("Some UK voice");
    expect(pickVoice([voice("Hortense", "fr-FR")])).toBeUndefined();
  });
});
