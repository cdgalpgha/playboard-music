"""Write public/samples/compat/manifest.json for the single-layer Tone.js MP3 set.

The MP3s keep their bytes untouched (they are hash-checked). Their encoder
delay and lead-in silence are measured here and skipped at load time through
each zone's `startOffsetMs`.

Usage: python3 -I scripts/build-compat-manifest.py
"""
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "public" / "samples" / "compat"
PC = {"C": 0, "Ds": 3, "Fs": 6, "A": 9}
NAMES = ["A0"] + [f"{n}{o}" for o in range(1, 8) for n in ["C", "Ds", "Fs", "A"]] + ["C8"]


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-"],
        capture_output=True, check=True,
    ).stdout
    rate = int(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", str(path)],
        capture_output=True, check=True, text=True,
    ).stdout.strip())
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2), rate


zones = []
roots = [12 * (int(n[-1]) + 1) + PC[n[:-1]] for n in NAMES]
for i, (name, root) in enumerate(zip(NAMES, roots)):
    path = DIR / f"{name}.mp3"
    x, rate = decode(path)
    mono = np.abs(x).max(axis=1)
    peak = float(mono.max())
    onset = max(0, int(np.argmax(mono > peak * 10 ** (-46 / 20))) - int(0.0005 * rate))
    body = x[onset: onset + int(0.3 * rate)]
    data = path.read_bytes()
    zones.append({
        "file": path.name, "root": root,
        "lokey": 21 if i == 0 else (root + roots[i - 1]) // 2 + 1,
        "hikey": 108 if i == len(roots) - 1 else (root + roots[i + 1]) // 2,
        "lovel": 1, "hivel": 127, "layer": 1,
        "seconds": round(len(x) / rate, 3), "startOffsetMs": round(onset / rate * 1000, 2),
        "peakDb": round(20 * np.log10(peak), 2),
        "rmsDb": round(20 * np.log10(float(np.sqrt((body ** 2).mean())) + 1e-12), 2),
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
    })

manifest = {
    "version": 1, "tier": "compat",
    "source": "Salamander Grand Piano (single layer MP3 subset via Tone.js) by Alexander Holm, CC BY 3.0",
    "sampleRate": 44100, "codec": "mp3", "layers": [1], "zones": zones,
    "releases": [], "harmonics": [], "pedal": [],
}
(DIR / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
print("compat:", len(zones), "zones; lead-in ms", min(z["startOffsetMs"] for z in zones), "-", max(z["startOffsetMs"] for z in zones))
