/** Minimal Standard MIDI File writer (format 0 or 1). */

export type WriterEvent =
  | { tick: number; type: "on"; pitch: number; velocity: number; channel?: number }
  | { tick: number; type: "off"; pitch: number; channel?: number }
  | { tick: number; type: "cc"; controller: number; value: number; channel?: number }
  | { tick: number; type: "tempo"; bpm: number }
  | { tick: number; type: "timesig"; numerator: number; denominator: number }
  | { tick: number; type: "name"; text: string };

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function trackBytes(events: WriterEvent[], runningStatus: boolean): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const out: number[] = [];
  let last = 0,
    status = -1;
  for (const e of sorted) {
    out.push(...vlq(Math.max(0, Math.round(e.tick - last))));
    last = e.tick;
    const ch = "channel" in e ? (e.channel ?? 0) : 0;
    const push = (s: number, ...data: number[]) => {
      if (!runningStatus || s !== status) out.push(s);
      status = s;
      out.push(...data);
    };
    switch (e.type) {
      case "on":
        push(0x90 | ch, e.pitch, e.velocity);
        break;
      case "off":
        // With running status, a note-on of velocity 0 is the compact note-off.
        if (runningStatus) push(0x90 | ch, e.pitch, 0);
        else push(0x80 | ch, e.pitch, 64);
        break;
      case "cc":
        push(0xb0 | ch, e.controller, e.value);
        break;
      case "tempo": {
        const us = Math.round(60_000_000 / e.bpm);
        out.push(0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
        status = -1;
        break;
      }
      case "timesig":
        out.push(0xff, 0x58, 0x04, e.numerator, Math.log2(e.denominator), 24, 8);
        status = -1;
        break;
      case "name": {
        const bytes = [...new TextEncoder().encode(e.text)];
        out.push(0xff, 0x03, ...vlq(bytes.length), ...bytes);
        status = -1;
        break;
      }
    }
  }
  out.push(0x00, 0xff, 0x2f, 0x00);
  return out;
}

export function writeMidiFile(tracks: WriterEvent[][], ticksPerQuarter = 480, runningStatus = false): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, tracks.length > 1 ? 1 : 0, 0, tracks.length, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff];
  const body: number[] = [];
  for (const t of tracks) {
    const bytes = trackBytes(t, runningStatus);
    body.push(0x4d, 0x54, 0x72, 0x6b, ...u32(bytes.length), ...bytes);
  }
  return new Uint8Array([...header, ...body]);
}
