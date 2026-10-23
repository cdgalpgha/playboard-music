/**
 * Key-to-sound latency, measured per note in the running app.
 *
 * For a note-on with input timestamp T (performance.now() domain):
 *   dispatch  = time the handler posted to the worklet − T
 *   audio     = from the post to the voice's first frame reaching the speaker:
 *               the wait for the next render quantum plus the device buffers,
 *               located with AudioContext.getOutputTimestamp()
 *   total     = dispatch + audio
 * The quantum wait cannot be separated from device buffering from the main
 * thread (currentTime already points at the next block), so it is not split out.
 * USB transport and the keyboard's own scan time happen before T and are not
 * visible to the browser; class-compliant USB MIDI adds about 1 ms.
 */
export interface LatencySample {
  note: number;
  source: string;
  dispatchMs: number;
  audioMs: number;
  totalMs: number;
  at: number;
}

export interface ClockPoint {
  contextTime: number;
  performanceTime: number;
}

/** When a context time will be heard, in performance.now() milliseconds. */
export function heardAt(contextTime: number, ref: ClockPoint): number {
  return ref.performanceTime + (contextTime - ref.contextTime) * 1000;
}

/** The context time that will be heard at a performance.now() instant. */
export function contextTimeHeardAt(perfMs: number, ref: ClockPoint): number {
  return ref.contextTime + (perfMs - ref.performanceTime) / 1000;
}

export function measure(
  note: number,
  source: string,
  inputMs: number,
  postedMs: number,
  startFrame: number,
  sampleRate: number,
  ref: ClockPoint,
): LatencySample {
  const heard = heardAt(startFrame / sampleRate, ref);
  const dispatchMs = Math.max(0, postedMs - inputMs);
  const totalMs = Math.max(dispatchMs, heard - inputMs);
  return { note, source, dispatchMs, audioMs: totalMs - dispatchMs, totalMs, at: postedMs };
}

export function summarize(samples: LatencySample[]): { median: number; p95: number; count: number } | null {
  if (!samples.length) return null;
  const sorted = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return { median: q(0.5), p95: q(0.95), count: sorted.length };
}
