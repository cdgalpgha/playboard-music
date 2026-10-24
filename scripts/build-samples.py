"""Build Playboard's Lite and Studio sample tiers from the Salamander Grand Piano V3.

Source: SalamanderGrandPianoV3+20161209_48khz24bit.tar.xz from
https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html (CC BY 3.0, Alexander Holm).

Usage:
    python3 -I scripts/build-samples.py <path to the extracted 48khz24bit folder>

For every selected source file the script:
  1. decodes it to float32 with ffmpeg,
  2. trims the silent lead-in before the hammer attack (8-15 ms in the source),
  3. trims the tail at -60 dB or at the tier's length cap, with a cosine fade,
  4. encodes Ogg Opus with libopus,
  5. records level, length and SHA-256 in the tier manifest.
Recordings are only trimmed and faded; nothing else about the sound changes.
"""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

RATE = 48000
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
NOTE_NAMES = ["A", "C", "D#", "F#"]
PC = {"C": 0, "D#": 3, "F#": 6, "A": 9}

# Velocity ranges come from the Salamander SFZ (lovel/hivel per layer).
SFZ_LAYER_LOVEL = [1, 27, 35, 37, 44, 47, 51, 57, 65, 73, 81, 89, 97, 105, 113, 121]

TIERS = {
    "lite": {
        "layers": [6, 13],
        "bitrate": "96k",
        "caps": [(45, 6.0), (60, 5.0), (72, 4.0), (84, 3.5), (127, 3.0)],
        "harmonics": False,
    },
    "studio": {
        "layers": [3, 7, 11, 16],
        "bitrate": "160k",
        "caps": [(45, 10.0), (60, 8.0), (72, 6.5), (84, 5.0), (127, 4.0)],
        "harmonics": True,
    },
}


def zones():
    """The 30 sampled notes: A0, then C/D#/F#/A for octaves 1-7, then C8."""
    names = ["A0"] + [f"{n}{o}" for o in range(1, 8) for n in ["C", "D#", "F#", "A"]] + ["C8"]
    out = []
    for name in names:
        midi = 12 * (int(name[-1]) + 1) + PC[name[:-1]]
        out.append((name, midi))
    return out


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(RATE), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def trim(x, cap_seconds, onset_db=-46.0, tail_db=-60.0, fade_seconds=0.35):
    mono = np.abs(x).max(axis=1)
    peak = float(mono.max())
    if peak <= 0:
        raise RuntimeError("silent sample")
    onset = int(np.argmax(mono > peak * 10 ** (onset_db / 20)))
    onset = max(0, onset - int(0.0005 * RATE))  # keep 0.5 ms before the attack
    x = x[onset:]
    window = 2400
    energy = np.convolve((x * x).mean(axis=1), np.ones(window) / window, mode="same")
    rms_db = 10 * np.log10(energy / (peak * peak) + 1e-15)
    below = np.nonzero(rms_db[int(0.2 * RATE):] < tail_db)[0]
    end = len(x) if len(below) == 0 else int(0.2 * RATE) + int(below[0])
    end = min(end, int(cap_seconds * RATE))
    x = x[:end].copy()
    fade = min(int(fade_seconds * RATE), len(x) // 3)
    if fade > 0:
        x[-fade:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fade)))[:, None]
    # Raised-cosine fade-in across the 0.5 ms of near-silence kept before the attack.
    ramp = min(24, len(x))
    x[:ramp] *= (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ramp)))[:, None]
    rms = float(np.sqrt((x[: min(len(x), int(0.3 * RATE))] ** 2).mean()))
    return x, onset / RATE, 20 * np.log10(peak), 20 * np.log10(rms + 1e-12)


def encode(x, dest, bitrate, channels):
    dest.parent.mkdir(parents=True, exist_ok=True)
    pcm = x if channels == 2 else x.mean(axis=1, keepdims=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "f32le", "-ar", str(RATE), "-ac", str(channels), "-i", "-",
            "-c:a", "libopus", "-b:a", bitrate, "-application", "audio",
            "-frame_duration", "10", "-vbr", "on", "-map_metadata", "-1",
            str(dest),
        ],
        input=pcm.astype(np.float32).tobytes(),
        check=True,
    )
    data = dest.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def layer_range(layers, i):
    lo = 1 if i == 0 else SFZ_LAYER_LOVEL[layers[i] - 1]
    hi = 127 if i == len(layers) - 1 else SFZ_LAYER_LOVEL[layers[i + 1] - 1] - 1
    return lo, hi


def cap_for(caps, midi):
    return next(seconds for top, seconds in caps if midi <= top)


def build_tier(src, tier, spec):
    layers = spec["layers"]
    items = []
    zone_list = zones()
    for zi, (name, midi) in enumerate(zone_list):
        lokey = 21 if zi == 0 else (midi + zone_list[zi - 1][1]) // 2 + 1
        hikey = 108 if zi == len(zone_list) - 1 else (midi + zone_list[zi + 1][1]) // 2
        for li, layer in enumerate(layers):
            lovel, hivel = layer_range(layers, li)
            items.append((name, midi, lokey, hikey, layer, lovel, hivel))

    def work(item):
        name, midi, lokey, hikey, layer, lovel, hivel = item
        x, lead, peak_db, rms_db = trim(decode(src / f"{name}v{layer}.wav"), cap_for(spec["caps"], midi))
        file = f"{name.replace('#', 's')}v{layer}.ogg"
        sha, size = encode(x, OUT / tier / file, spec["bitrate"], 2)
        return {
            "file": file, "root": midi, "lokey": lokey, "hikey": hikey,
            "lovel": lovel, "hivel": hivel, "layer": layer,
            "seconds": round(len(x) / RATE, 3), "trimmedLeadMs": round(lead * 1000, 2),
            "peakDb": round(peak_db, 2), "rmsDb": round(rms_db, 2),
            "sha256": sha, "bytes": size,
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        result = list(pool.map(work, items))
    return result


def build_common(src):
    """Hammer releases (88, mono), string-resonance releases (46), pedal mechanics (4)."""
    jobs = []
    for key in range(1, 89):
        jobs.append(("release", f"rel{key}", {"key": 20 + key}, 1, "48k", 1.2))
    zone_list = zones()[:-1]  # harm samples stop at D#6
    for kind in ("L", "S"):
        for zi, (name, midi) in enumerate(zone_list):
            if midi > 87:
                continue
            lokey = 20 if zi == 0 else midi - 1
            hikey = midi + 1
            jobs.append(("harmonic", f"harm{kind}{name}", {"root": midi, "lokey": lokey, "hikey": hikey, "loud": kind == "L"}, 2, "96k", 4.0))
    for name in ("pedalD1", "pedalD2", "pedalU1", "pedalU2"):
        jobs.append(("pedal", name, {"down": name.startswith("pedalD")}, 2, "96k", 3.0))

    def work(job):
        kind, name, meta, channels, bitrate, cap = job
        x, lead, peak_db, rms_db = trim(decode(src / f"{name}.wav"), cap, onset_db=-50.0, tail_db=-66.0, fade_seconds=0.15)
        file = f"{name.replace('#', 's')}.ogg"
        sha, size = encode(x, OUT / "common" / file, bitrate, channels)
        return kind, {"file": file, **meta, "seconds": round(len(x) / RATE, 3),
                      "peakDb": round(peak_db, 2), "rmsDb": round(rms_db, 2), "sha256": sha, "bytes": size}

    with ThreadPoolExecutor(max_workers=4) as pool:
        result = list(pool.map(work, jobs))
    return {
        "releases": [m for k, m in result if k == "release"],
        "harmonics": [m for k, m in result if k == "harmonic"],
        "pedal": [m for k, m in result if k == "pedal"],
    }


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    common = build_common(src)
    for tier, spec in TIERS.items():
        zone_items = build_tier(src, tier, spec)
        manifest = {
            "version": 1,
            "tier": tier,
            "source": "Salamander Grand Piano V3 (48 kHz, 24-bit) by Alexander Holm, CC BY 3.0",
            "sampleRate": RATE,
            "codec": "opus",
            "layers": spec["layers"],
            "zones": zone_items,
            "releases": common["releases"],
            "harmonics": common["harmonics"] if spec["harmonics"] else [],
            "pedal": common["pedal"],
        }
        (OUT / tier / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
        total = sum(z["bytes"] for z in zone_items)
        pcm = sum(z["seconds"] for z in zone_items) * RATE * 2 * 2
        print(f"{tier}: {len(zone_items)} zones, {total / 1e6:.1f} MB download, {pcm / 1e6:.0f} MB PCM (int16)")
    extra = sum(m["bytes"] for group in common.values() for m in group)
    print(f"common: {extra / 1e6:.1f} MB download")


if __name__ == "__main__":
    main()
