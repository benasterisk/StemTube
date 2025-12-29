#!/usr/bin/env python3
"""Debug script to analyze Purple Haze chroma extraction and template matching."""

import numpy as np
import librosa
import json

# Load Purple Haze audio (use guitar stem for clearer analysis)
audio_path = "/home/michael/Documents/Dev/stemtube_dev_v1.2/core/downloads/The Jimi Hendrix Experience - Purple Haze (Official Audio)/audio/stems/guitar.mp3"

print(f"Loading audio from: {audio_path}")
y, sr = librosa.load(audio_path, sr=22050, mono=True)

# Extract chroma using HPSS (same as hybrid detector)
print("\nExtracting chroma with HPSS...")
y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)

chroma = librosa.feature.chroma_cqt(
    y=y_harmonic,
    sr=sr,
    hop_length=2048,
    tuning=0.0,
    norm=2,
    threshold=0.0
)

# Analyze first 10 seconds (where E7#9 should be)
frames_in_10s = int(10.0 * sr / 2048)
chroma_10s = chroma[:, :frames_in_10s]

# Define templates
templates = {
    'E': np.array([0,0,0,0,1,0,0,0,1,0,0,1]),
    'Em': np.array([0,0,0,0,1,0,0,1,0,0,0,1]),
    'E7': np.array([0,0,1,0,1,0,0,0,1,0,0,1]),
    'E7#9': np.array([0,0,1,0,1,0,0,1,1,0,0,1]),
}

print(f"\nAnalyzing first 10 seconds ({chroma_10s.shape[1]} frames)...")
print("\nChroma templates:")
note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
for name, template in templates.items():
    notes = [note_names[i] for i, v in enumerate(template) if v == 1]
    print(f"  {name:6s}: {notes}")

# Test matching for each frame in first 3 seconds
print("\n" + "="*80)
print("Frame-by-frame analysis (first 3 seconds):")
print("="*80)

frames_in_3s = int(3.0 * sr / 2048)
for i in range(0, frames_in_3s, 5):  # Every 5th frame to avoid spam
    timestamp = i * 2048 / sr
    frame_chroma = chroma[:, i]

    # Normalize
    if np.sum(frame_chroma) > 0:
        frame_chroma = frame_chroma / np.sum(frame_chroma)

    # Calculate scores for each template
    scores = {}
    for chord_name, template in templates.items():
        score = np.dot(frame_chroma, template) / (
            np.linalg.norm(frame_chroma) * np.linalg.norm(template) + 1e-10
        )
        scores[chord_name] = score

    # Show top notes in chroma
    top_notes_idx = np.argsort(frame_chroma)[-5:][::-1]  # Top 5 notes
    top_notes = [(note_names[idx], frame_chroma[idx]) for idx in top_notes_idx]

    print(f"\nFrame {i:4d} ({timestamp:.2f}s):")
    print(f"  Top notes: {', '.join([f'{n}({v:.3f})' for n, v in top_notes])}")
    print(f"  Scores: E={scores['E']:.3f}, Em={scores['Em']:.3f}, E7={scores['E7']:.3f}, E7#9={scores['E7#9']:.3f}")
    print(f"  Winner: {max(scores, key=scores.get)}")

# Calculate average chroma for first 3 seconds
print("\n" + "="*80)
print("Average chroma analysis (0-3 seconds):")
print("="*80)
avg_chroma = np.mean(chroma[:, :frames_in_3s], axis=1)
avg_chroma = avg_chroma / np.sum(avg_chroma)

print("\nAverage chroma values:")
for i, note in enumerate(note_names):
    print(f"  {note:3s}: {'█' * int(avg_chroma[i] * 50)}{avg_chroma[i]:.3f}")

print("\nExpected for E7#9: E, G#, B (triad) + D (min7) + G (#9)")
print(f"  E  (index 4): {avg_chroma[4]:.3f} {'✓' if avg_chroma[4] > 0.05 else '✗'}")
print(f"  G# (index 8): {avg_chroma[8]:.3f} {'✓' if avg_chroma[8] > 0.05 else '✗'}")
print(f"  B  (index 11): {avg_chroma[11]:.3f} {'✓' if avg_chroma[11] > 0.05 else '✗'}")
print(f"  D  (index 2): {avg_chroma[2]:.3f} {'✓' if avg_chroma[2] > 0.05 else '✗'}")
print(f"  G  (index 7): {avg_chroma[7]:.3f} {'✓' if avg_chroma[7] > 0.05 else '✗'}")

# Calculate final scores
print("\nTemplate matching scores (average chroma):")
for chord_name, template in templates.items():
    score = np.dot(avg_chroma, template) / (
        np.linalg.norm(avg_chroma) * np.linalg.norm(template) + 1e-10
    )
    print(f"  {chord_name:6s}: {score:.4f}")
