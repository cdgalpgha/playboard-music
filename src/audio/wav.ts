/** 16-bit PCM stereo WAV from channel chunks. */
export function wavFromChunks(left: Int16Array[], right: Int16Array[], sampleRate: number): Blob {
  const frames = left.reduce((n, c) => n + c.length, 0);
  const bytes = frames * 4;
  const header = new DataView(new ArrayBuffer(44));
  const text = (at: number, s: string) => [...s].forEach((c, i) => header.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  header.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 2, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 4, true);
  header.setUint16(32, 4, true);
  header.setUint16(34, 16, true);
  text(36, "data");
  header.setUint32(40, bytes, true);
  const body = new Int16Array(frames * 2);
  let at = 0;
  for (let c = 0; c < left.length; c++) {
    const l = left[c]!,
      r = right[c] ?? l;
    for (let i = 0; i < l.length; i++) {
      body[at++] = l[i]!;
      body[at++] = r[i]!;
    }
  }
  return new Blob([header.buffer, body.buffer], { type: "audio/wav" });
}
