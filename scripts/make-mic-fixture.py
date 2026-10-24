"""Render tests/fixtures/mic-notes.wav from the Studio samples for the microphone test.

C4 at 0.5 s, A4 at 1.5 s, F#4 at 2.5 s, each held 0.9 s; 4 s, 48 kHz mono 16-bit.
Chromium loops it as a fake microphone (--use-file-for-fake-audio-capture).
Usage: python3 -I scripts/make-mic-fixture.py
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 48000
NOTES = [("C4v11.ogg", 0.5), ("A4v11.ogg", 1.5), ("Fs4v11.ogg", 2.5)]

out = np.zeros(int(4.0 * RATE), dtype=np.float32)
for file, at in NOTES:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(ROOT / "public/samples/studio" / file), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        capture_output=True, check=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.float32)[: int(0.9 * RATE)].copy()
    fade = int(0.08 * RATE)
    x[-fade:] *= np.linspace(1, 0, fade)
    start = int(at * RATE)
    out[start : start + len(x)] += x
out *= 0.8 / max(1e-6, float(np.abs(out).max()))
dest = ROOT / "tests" / "fixtures" / "mic-notes.wav"
with wave.open(str(dest), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("wrote", dest, dest.stat().st_size, "bytes")
