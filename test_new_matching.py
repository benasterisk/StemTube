#!/usr/bin/env python3
"""Test new weighted matching logic on Purple Haze chroma."""

import numpy as np
import librosa

# Load Purple Haze guitar stem
audio_path = "/home/michael/Documents/Dev/stemtube_dev_v1.2/core/downloads/The Jimi Hendrix Experience - Purple Haze (Official Audio)/audio/stems/guitar.mp3"
print(f"Loading: {audio_path}")
y, sr = librosa.load(audio_path, sr=22050, mono=True)

# Extract chroma with HPSS
y_harmonic, _ = librosa.effects.hpss(y, margin=3.0)
chroma = librosa.feature.chroma_cqt(
    y=y_harmonic, sr=sr, hop_length=2048, tuning=0.0, norm=2, threshold=0.0
)

# Templates
templates = {
    'E': np.array([0,0,0,0,1,0,0,0,1,0,0,1]),
    'Em': np.array([0,0,0,0,1,0,0,1,0,0,0,1]),
    'E7': np.array([0,0,1,0,1,0,0,0,1,0,0,1]),
    'E7#9': np.array([0,0,1,0,1,0,0,1,1,0,0,1]),
}

# Complexity levels
complexity = {'E': 0, 'Em': 1, 'E7': 3, 'E7#9': 5}

print("\n" + "="*80)
print("Testing WEIGHTED matching on first 3 seconds")
print("="*80)

frames_3s = int(3.0 * sr / 2048)
weighted_wins = {name: 0 for name in templates}
unweighted_wins = {name: 0 for name in templates}

for i in range(frames_3s):
    frame_chroma = chroma[:, i]
    if np.sum(frame_chroma) > 0:
        frame_chroma = frame_chroma / np.sum(frame_chroma)

    # --- UNWEIGHTED (old method) ---
    best_unweighted = None
    best_unweighted_score = 0.0

    for name, template in templates.items():
        score = np.dot(frame_chroma, template) / (
            np.linalg.norm(frame_chroma) * np.linalg.norm(template) + 1e-10
        )
        if score > best_unweighted_score:
            best_unweighted_score = score
            best_unweighted = name

    if best_unweighted:
        unweighted_wins[best_unweighted] += 1

    # --- WEIGHTED (new method) ---
    best_weighted = None
    best_weighted_score = 0.0
    best_complexity = -1

    for name, template in templates.items():
        weights = np.ones(12)
        template_notes = np.where(template > 0)[0]

        if len(template_notes) >= 4:
            for idx, note_idx in enumerate(sorted(template_notes)):
                if idx < 3:  # Triad
                    weights[note_idx] = 1.5
                elif idx == 3:  # 7th
                    weights[note_idx] = 1.2
                else:  # Extensions
                    weights[note_idx] = 0.7

        weighted_chroma = frame_chroma * weights
        weighted_template = template * weights

        score = np.dot(weighted_chroma, weighted_template) / (
            np.linalg.norm(weighted_chroma) * np.linalg.norm(weighted_template) + 1e-10
        )

        comp = complexity[name]
        if score > best_weighted_score + 0.02:
            best_weighted_score = score
            best_weighted = name
            best_complexity = comp
        elif abs(score - best_weighted_score) <= 0.02 and comp > best_complexity:
            best_weighted_score = score
            best_weighted = name
            best_complexity = comp

    if best_weighted:
        weighted_wins[best_weighted] += 1

print(f"\nResults over {frames_3s} frames:")
print("\nUNWEIGHTED (old method):")
for name in ['E7#9', 'E7', 'Em', 'E']:
    pct = 100 * unweighted_wins[name] / frames_3s
    print(f"  {name:6s}: {unweighted_wins[name]:3d} frames ({pct:5.1f}%)")

print("\nWEIGHTED (new method):")
for name in ['E7#9', 'E7', 'Em', 'E']:
    pct = 100 * weighted_wins[name] / frames_3s
    print(f"  {name:6s}: {weighted_wins[name]:3d} frames ({pct:5.1f}%)")

print("\n" + "="*80)
improvement = weighted_wins['E7#9'] - unweighted_wins['E7#9']
print(f"E7#9 improvement: {improvement:+d} frames ({100*improvement/frames_3s:+.1f}%)")
print("="*80)
