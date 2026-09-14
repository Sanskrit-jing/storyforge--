import type { AvgPresentationCue } from "../types/avg";
const phases = ["before", "during", "after"];
/** Waits are cumulative in presentation order; no executable scripts or hidden timers. */
export function avgCueTimeline(cues: AvgPresentationCue[], after: boolean) {
  let at = 0;
  const entries = [...cues]
    .filter((cue) => (after ? cue.phase === "after" : cue.phase !== "after"))
    .sort(
      (a, b) =>
        phases.indexOf(a.phase) - phases.indexOf(b.phase) ||
        a.order - b.order ||
        a.cueKey.localeCompare(b.cueKey),
    )
    .map((cue) => {
      const entry = { cue, at };
      if (cue.type === "wait") at += cue.durationMs;
      return entry;
    });
  return { entries, duration: at };
}
