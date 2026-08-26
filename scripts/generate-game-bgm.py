"""Generate the original looping BGM used by the game.

The composition is an eight-bar motif repeated four times with small arrangement
changes. Every synthesized tail wraps around the buffer boundary, so the final
G7 bar resolves into the opening C major bar without a clipped reverb tail.
"""

from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
BPM = 92
BEAT_SECONDS = 60 / BPM
BARS_PER_CYCLE = 8
CYCLES = 4
BEATS_PER_BAR = 4
TOTAL_BEATS = BARS_PER_CYCLE * CYCLES * BEATS_PER_BAR
TOTAL_SAMPLES = round(TOTAL_BEATS * BEAT_SECONDS * SAMPLE_RATE)

CHORDS = (
    (48, 55, 59, 64),  # Cmaj7
    (47, 55, 59, 62),  # G/B
    (45, 52, 55, 60),  # Am7
    (43, 47, 52, 55),  # Em/G
    (41, 48, 52, 57),  # Fmaj7
    (40, 48, 52, 55),  # C/E
    (38, 45, 48, 53),  # Dm7
    (43, 47, 50, 53),  # G7
)

MOTIF = (
    ((0.0, 76), (0.5, 79), (1.0, 84), (2.0, 79), (3.0, 76)),
    ((0.0, 74), (0.5, 79), (1.0, 83), (2.0, 81), (2.5, 79), (3.0, 74)),
    ((0.0, 76), (0.5, 81), (1.0, 84), (2.0, 83), (2.5, 81), (3.0, 76)),
    ((0.0, 79), (0.5, 83), (1.0, 88), (2.0, 86), (2.5, 83), (3.0, 79)),
    ((0.0, 81), (0.5, 84), (1.0, 89), (2.0, 88), (2.5, 84), (3.0, 81)),
    ((0.0, 79), (0.5, 84), (1.0, 88), (2.0, 86), (2.5, 84), (3.0, 79)),
    ((0.0, 77), (0.5, 81), (1.0, 86), (2.0, 84), (2.5, 81), (3.0, 77)),
    ((0.0, 79), (0.5, 83), (1.0, 86), (1.5, 83), (2.0, 79), (3.0, 74)),
)


def midi_frequency(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def time_axis(duration: float) -> np.ndarray:
    return np.arange(max(1, round(duration * SAMPLE_RATE)), dtype=np.float64) / SAMPLE_RATE


def add_circular(mix: np.ndarray, signal: np.ndarray, beat: float, pan: float = 0.0, gain: float = 1.0) -> None:
    start = round(beat * BEAT_SECONDS * SAMPLE_RATE)
    indices = (start + np.arange(signal.size)) % TOTAL_SAMPLES
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4
    np.add.at(mix[:, 0], indices, signal * math.cos(angle) * gain)
    np.add.at(mix[:, 1], indices, signal * math.sin(angle) * gain)


def marimba(note: int, velocity: float = 1.0) -> np.ndarray:
    t = time_axis(1.45)
    frequency = midi_frequency(note)
    attack = np.minimum(1.0, t / 0.004)
    body = (
        np.sin(2 * np.pi * frequency * t) * np.exp(-4.2 * t)
        + 0.34 * np.sin(2 * np.pi * frequency * 2.01 * t + 0.15) * np.exp(-7.0 * t)
        + 0.16 * np.sin(2 * np.pi * frequency * 3.94 * t + 0.5) * np.exp(-10.0 * t)
    )
    return body * attack * velocity


def felt_piano(note: int, velocity: float = 1.0) -> np.ndarray:
    t = time_axis(4.1)
    frequency = midi_frequency(note)
    attack = np.minimum(1.0, t / 0.028)
    envelope = attack * np.exp(-0.72 * t)
    tone = np.zeros_like(t)
    for partial, amount, phase in ((1, 1.0, 0.0), (2, 0.24, 0.2), (3, 0.10, 0.6), (4, 0.035, 1.0)):
        tone += amount * np.sin(2 * np.pi * frequency * partial * t + phase)
    return tone * envelope * velocity


def pizzicato(note: int, velocity: float = 1.0) -> np.ndarray:
    t = time_axis(0.72)
    frequency = midi_frequency(note)
    envelope = np.minimum(1.0, t / 0.006) * np.exp(-6.0 * t)
    tone = sum(np.sin(2 * np.pi * frequency * harmonic * t) / harmonic for harmonic in range(1, 7))
    return tone * envelope * velocity


def soft_bass(note: int, velocity: float = 1.0) -> np.ndarray:
    t = time_axis(1.65)
    frequency = midi_frequency(note)
    envelope = np.minimum(1.0, t / 0.025) * np.exp(-1.75 * t)
    tone = np.sin(2 * np.pi * frequency * t) + 0.17 * np.sin(4 * np.pi * frequency * t)
    return tone * envelope * velocity


def soft_kick() -> np.ndarray:
    t = time_axis(0.48)
    phase = 2 * np.pi * (52 * t + 40 * (1 - np.exp(-18 * t)) / 18)
    return np.sin(phase) * np.exp(-9.0 * t)


def brushed_hit(rng: np.random.Generator, duration: float = 0.31) -> np.ndarray:
    t = time_axis(duration)
    noise = rng.normal(0.0, 1.0, t.size)
    high = np.concatenate(([noise[0]], np.diff(noise)))
    return high * np.minimum(1.0, t / 0.025) * np.exp(-11.5 * t)


def shaker(rng: np.random.Generator) -> np.ndarray:
    t = time_axis(0.09)
    noise = rng.normal(0.0, 1.0, t.size)
    high = np.concatenate(([noise[0]], np.diff(noise)))
    return high * np.sin(np.pi * np.minimum(1.0, t / 0.09)) * np.exp(-19 * t)


def compose() -> np.ndarray:
    rng = np.random.default_rng(20260803)
    mix = np.zeros((TOTAL_SAMPLES, 2), dtype=np.float64)

    for cycle in range(CYCLES):
        cycle_beat = cycle * BARS_PER_CYCLE * BEATS_PER_BAR
        for bar, chord in enumerate(CHORDS):
            bar_beat = cycle_beat + bar * BEATS_PER_BAR

            chord_gain = (0.074, 0.066, 0.058, 0.071)[cycle]
            for index, note in enumerate(chord):
                add_circular(mix, felt_piano(note, 0.88), bar_beat, pan=(index - 1.5) * 0.13, gain=chord_gain)

            root = chord[0] - 12
            add_circular(mix, soft_bass(root), bar_beat, pan=-0.05, gain=0.10)
            add_circular(mix, soft_bass(root + 7, 0.78), bar_beat + 2, pan=0.04, gain=0.075)

            for step in range(8):
                note = chord[(step + cycle) % len(chord)] + 12
                add_circular(
                    mix,
                    pizzicato(note, 0.72 if step % 2 else 0.58),
                    bar_beat + step * 0.5,
                    pan=-0.34 if step % 2 == 0 else 0.34,
                    gain=0.044 if cycle != 2 else 0.032,
                )

            for offset, note in MOTIF[bar]:
                variation = 12 if cycle == 1 and bar in (3, 7) and offset == 1.0 else 0
                gain = (0.16, 0.145, 0.125, 0.155)[cycle]
                pan = 0.17 * math.sin((bar + offset + cycle) * 1.3)
                add_circular(mix, marimba(note + variation), bar_beat + offset, pan=pan, gain=gain)

            add_circular(mix, soft_kick(), bar_beat, gain=0.085)
            add_circular(mix, soft_kick(), bar_beat + 2, gain=0.055)
            add_circular(mix, brushed_hit(rng), bar_beat + 1, pan=0.26, gain=0.025)
            add_circular(mix, brushed_hit(rng), bar_beat + 3, pan=-0.26, gain=0.028)
            if cycle in (1, 3):
                for step in range(8):
                    add_circular(mix, shaker(rng), bar_beat + step * 0.5, pan=0.42, gain=0.008)

        if cycle in (0, 3):
            add_circular(mix, marimba(91, 0.48), cycle_beat + 31.5, pan=0.25, gain=0.06)

    # Circular room reflections keep the boundary continuous instead of fading to silence.
    dry = mix.copy()
    for delay_seconds, amount, swap in ((0.19, 0.09, True), (0.31, 0.055, False), (0.47, 0.032, True)):
        shifted = np.roll(dry[:, ::-1] if swap else dry, round(delay_seconds * SAMPLE_RATE), axis=0)
        mix += shifted * amount

    mix -= np.mean(mix, axis=0, keepdims=True)
    mix = np.tanh(mix * 1.18)
    peak = float(np.max(np.abs(mix)))
    return mix * (0.89 / peak)


def write_wave(output_path: Path, audio: np.ndarray) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.round(np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(output_path), "wb") as target:
        target.setnchannels(2)
        target.setsampwidth(2)
        target.setframerate(SAMPLE_RATE)
        target.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, nargs="?", default=Path("apps/game/public/audio/bgm-relaxed-loop.wav"))
    args = parser.parse_args()
    write_wave(args.output, compose())
    print(f"Wrote {args.output} ({TOTAL_BEATS * BEAT_SECONDS:.3f}s at {BPM} BPM)")


if __name__ == "__main__":
    main()
