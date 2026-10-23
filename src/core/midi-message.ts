/** Typed view of one Web MIDI message. Web MIDI delivers whole messages, so no running status. */
export type MidiMessage =
  | { kind: "noteon"; channel: number; note: number; velocity: number }
  | { kind: "noteoff"; channel: number; note: number; velocity: number }
  | { kind: "cc"; channel: number; controller: number; value: number }
  | { kind: "other" };

export const CC = {
  sustain: 64,
  sostenuto: 66,
  soft: 67,
  allSoundOff: 120,
  allNotesOff: 123,
} as const;

export function parseMidiMessage(data: ArrayLike<number>): MidiMessage {
  const status = data[0];
  if (status === undefined || status < 0x80 || status >= 0xf0) return { kind: "other" };
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const a = (data[1] ?? 0) & 0x7f;
  const b = (data[2] ?? 0) & 0x7f;
  switch (type) {
    case 0x90:
      if (data.length < 3) return { kind: "other" };
      // Note-on with velocity 0 is a note-off (common with running-status devices).
      return b === 0
        ? { kind: "noteoff", channel, note: a, velocity: 64 }
        : { kind: "noteon", channel, note: a, velocity: b };
    case 0x80:
      if (data.length < 3) return { kind: "other" };
      return { kind: "noteoff", channel, note: a, velocity: b };
    case 0xb0:
      if (data.length < 3) return { kind: "other" };
      return { kind: "cc", channel, controller: a, value: b };
    default:
      return { kind: "other" };
  }
}
