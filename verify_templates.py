#!/usr/bin/env python3
"""Verify chord templates are correct."""

import numpy as np

# Chromatic scale: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
#                  0  1   2  3   4  5  6   7  8   9  10  11
note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def notes_in_template(template, name):
    """Print which notes are in a template."""
    notes = [note_names[i] for i, v in enumerate(template) if v == 1]
    return f"{name:10s}: {notes}"

# Test E-based chords
templates = {
    'E': [0,0,0,0,1,0,0,0,1,0,0,1],        # E + G# + B (major triad)
    'Em': [0,0,0,0,1,0,0,1,0,0,0,1],       # E + G + B (minor triad)
    'E7': [0,0,1,0,1,0,0,0,1,0,0,1],       # E + G# + B + D (dominant 7th)
    'E7#9': [0,0,1,0,1,0,0,1,1,0,0,1],     # E + G# + B + D + G
}

print("Current templates in hybrid_chord_detector.py:")
print("="*60)
for name, template in templates.items():
    print(notes_in_template(template, name))

print("\n" + "="*60)
print("Theory check:")
print("="*60)

# E major scale: E, F#, G#, A, B, C#, D#
# E = root (0 semitones)
# G# = major 3rd (4 semitones from E)
# B = perfect 5th (7 semitones from E)
# D = minor 7th (10 semitones from E)
# G = #9 (15 semitones from E = 3 semitones in next octave)

print("\nE (major triad):")
print("  Should have: E (index 4), G# (index 8), B (index 11)")
e_check = templates['E']
print(f"  Has: E={e_check[4]}, G#={e_check[8]}, B={e_check[11]} ✓" if e_check[4] and e_check[8] and e_check[11] else "  ✗ WRONG")

print("\nE7 (dominant 7th):")
print("  Should have: E (index 4), G# (index 8), B (index 11), D (index 2)")
e7_check = templates['E7']
print(f"  Has: E={e7_check[4]}, G#={e7_check[8]}, B={e7_check[11]}, D={e7_check[2]} ✓" if e7_check[4] and e7_check[8] and e7_check[11] and e7_check[2] else "  ✗ WRONG")

print("\nE7#9 (Hendrix chord):")
print("  Should have: E (index 4), G# (index 8), B (index 11), D (index 2), G (index 7)")
print("  Note: #9 is 15 semitones = 1 octave + minor 3rd = G in same chroma")
e79_check = templates['E7#9']
print(f"  Has: E={e79_check[4]}, G#={e79_check[8]}, B={e79_check[11]}, D={e79_check[2]}, G={e79_check[7]} ✓" if e79_check[4] and e79_check[8] and e79_check[11] and e79_check[2] and e79_check[7] else "  ✗ WRONG")

# Check for spurious notes
print("\n" + "="*60)
print("Checking for spurious notes (notes that shouldn't be there):")
print("="*60)

for name, template in templates.items():
    notes_present = [note_names[i] for i, v in enumerate(template) if v == 1]
    print(f"\n{name}:")
    print(f"  Notes: {notes_present}")

    # Check for unexpected notes
    if name == 'E':
        expected = {'E', 'G#', 'B'}
    elif name == 'Em':
        expected = {'E', 'G', 'B'}
    elif name == 'E7':
        expected = {'E', 'G#', 'B', 'D'}
    elif name == 'E7#9':
        expected = {'E', 'G#', 'B', 'D', 'G'}

    actual = set(notes_present)
    spurious = actual - expected
    missing = expected - actual

    if spurious:
        print(f"  ✗ SPURIOUS NOTES: {spurious}")
    if missing:
        print(f"  ✗ MISSING NOTES: {missing}")
    if not spurious and not missing:
        print(f"  ✓ Template is correct")
