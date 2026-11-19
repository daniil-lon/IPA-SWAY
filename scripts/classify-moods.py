"""Analyze local catalog audio. Usage: py scripts/classify-moods.py <ffmpeg.exe>."""

import json
import colorsys
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public"
catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8-sig"))
rate = 8000


def measure(track):
    source = root / track["audio"].lstrip("/")
    if not source.is_file():
        return None
    try:
        audio = subprocess.run(
            [sys.argv[1], "-nostdin", "-v", "error", "-threads", "1", "-i", str(source), "-vn",
             "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"],
            capture_output=True, check=True, timeout=22,
        ).stdout
    except (subprocess.SubprocessError, OSError):
        return None
    samples = np.frombuffer(audio, dtype="<f4")
    if samples.size < rate * 4:
        return None
    start = min(int(samples.size * .21), max(0, samples.size - rate * 6))
    excerpt = samples[start:start + rate * 23]
    frames = excerpt[:excerpt.size // 160 * 160].reshape(-1, 160)
    volume = np.sqrt(np.mean(frames ** 2, axis=1))
    filtered = np.convolve(volume, [1 / 3] * 3, "same")
    smooth = np.convolve(filtered, [1 / 9] * 9, "same")
    rise = np.maximum(0, filtered[10:-10] - smooth[10:-10])
    attacks = np.percentile(rise, 92) / (np.median(volume) + .015)
    spectrum = np.abs(np.fft.rfft(frames[::3] * np.hanning(160), axis=1))
    brightness = np.sum(spectrum[:, 21:]) / (np.sum(spectrum[:, 2:]) + 1e-6)
    loudness = np.percentile(volume, 65)
    onsets = rise - np.mean(rise)
    lag = max(range(15, 50), key=lambda k: np.dot(onsets[:-k], onsets[k:]) / (len(onsets) - k))
    pace = min(135, 3000 / lag)
    blocks = samples[:samples.size // 80 * 80].reshape(-1, 80)
    energy = np.log1p(26 * np.sqrt(np.mean(blocks ** 2, axis=1)))
    fast = np.convolve(energy, [.25, .5, .25], "same")
    slow = np.convolve(fast, np.full(9, 1 / 9), "same")
    flux = np.maximum(0, fast - slow)
    peaks = np.nonzero((flux[1:-1] >= flux[:-2]) & (flux[1:-1] > flux[2:]))[0] + 1
    norm = max(.055, np.percentile(flux, 95))
    accents = []
    for i in peaks:
        if i < 10 or i >= len(flux) - 9 or flux[i] < norm * .63 or energy[i] < .115:
            continue
        v = min(96, int(27 + 38 * flux[i] / norm))
        if not accents or i - accents[-2] >= 19:
            accents.extend((int(i), v))
        elif v > accents[-1] + 12:
            accents[-2:] = [int(i), v]
    return track["id"], (loudness, attacks, brightness, pace), accents


def cover_palette(track):
    path = root / track["art"].lstrip("/")
    if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        return None
    try:
        with Image.open(path) as original:
            img = original.convert("RGB")
            img.thumbnail((40, 40))
    except (OSError, ValueError):
        return None
    bins = np.zeros((24, 3))
    for r, g, b in np.asarray(img).reshape(-1, 3):
        hue, light, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if light < .12 or light > .93 or sat < .16:
            continue
        weight = (sat + .2) * (1 - abs(light - .45))
        bins[int(hue * 24) % 24] += (weight, weight * sat, weight * light)
    winner = int(np.argmax(bins[:, 0]))
    count, saturation, light = bins[winner]
    if not count:
        return [220, 9, 28, 227]
    alternate = int(np.argmax([row[0] if min((i-winner)%24,(winner-i)%24) >= 2 else 0 for i,row in enumerate(bins)]))
    return [round((winner+.5)*15), round(100*saturation/count), round(100*light/count),
            round((alternate+.5)*15) if bins[alternate,0] > count*.2 else round((winner+1.5)*15)%360]


def main():
    with ThreadPoolExecutor(max_workers=6) as pool:
        entries = [result for result in pool.map(measure, catalog) if result]
        palettes = dict(zip((t["id"] for t in catalog), pool.map(cover_palette, catalog)))
    measured = {track_id: features for track_id, features, _ in entries}
    if not measured:
        raise RuntimeError("No local catalog audio could be analyzed")
    features = np.array(list(measured.values()))
    # Rank measured signals against the catalog, using the same cutoffs for all genres.
    order = np.sort(features, axis=0).T
    result = {}
    for track_id, values in measured.items():
        level, accents, treble, pace = (
            np.searchsorted(column, value, side="right") / len(features)
            for column, value in zip(order, values)
        )
        energy = .42 * level + .25 * accents + .21 * treble + .12 * pace
        tags = []
        if energy < .46 and accents < .62:
            tags.append("calm")
        if energy < .57 and treble < .53:
            tags.append("night")
        if accents < .43 and energy < .6:
            tags.append("focus")
        if energy > .54 and (treble > .46 or pace > .58):
            tags.append("bright")
        result[track_id] = {"moods": tags, "palette": palettes.get(track_id)}
    (root / "track-moods.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    pulse_path = root / "wave-pulses.json"
    previous = json.loads(pulse_path.read_text(encoding="utf-8-sig")) if pulse_path.exists() else {}
    previous.update({key: pulses for key, _, pulses in entries})
    pulse_path.write_text(json.dumps(previous, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Measured {len(measured)}/{len(catalog)} tracks; {sum(bool(item['moods']) for item in result.values())} tagged")


if __name__ == "__main__":
    main()
