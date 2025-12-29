# LEGAL DISCLAIMER AND TERMS OF USE

## ⚠️ IMPORTANT LEGAL NOTICE ⚠️

**READ THIS DISCLAIMER CAREFULLY BEFORE USING THIS SOFTWARE**

---

## AI DEVELOPMENT PROOF OF CONCEPT

**StemTube Web** is a **100% AI-developed application** created as a **proof of concept** to demonstrate artificial intelligence capabilities in software development. The human contributor acted solely as a **project manager** providing direction and requirements.

This project serves as an experimental demonstration of:
- AI-driven software architecture and development
- Autonomous code generation and problem-solving
- AI-powered system integration and debugging

---

## COPYRIGHT AND YOUTUBE CONTENT DISCLAIMER

### 🚨 USER RESPONSIBILITY WARNING

**THE DEVELOPER ASSUMES NO RESPONSIBILITY FOR HOW THIS SOFTWARE IS USED.**

By using this application, you acknowledge and agree that:

1. **YOU ARE SOLELY RESPONSIBLE** for ensuring compliance with all applicable laws, including but not limited to:
   - Copyright laws in your jurisdiction
   - YouTube's Terms of Service
   - Google's policies and guidelines
   - International copyright treaties

2. **POTENTIAL LEGAL VIOLATIONS**: Downloading copyrighted content from YouTube may violate:
   - YouTube's Terms of Service
   - Copyright holders' exclusive rights
   - Digital Millennium Copyright Act (DMCA)
   - Local and international copyright laws

3. **NO DEVELOPER LIABILITY**: The developer, contributors, and maintainers of this software:
   - Disclaim all responsibility for user actions
   - Are not liable for any legal consequences arising from software use
   - Do not endorse or encourage copyright infringement
   - Provide this software "AS IS" without warranties

---

## RECOMMENDED USAGE

**WE STRONGLY RECOMMEND** using this software only with:

✅ **LEGAL CONTENT:**
- Open source audio/video content
- Creative Commons licensed materials
- Public domain works
- Content you own or have explicit permission to use
- Royalty-free audio libraries

✅ **EDUCATIONAL PURPOSES:**
- Technical learning and experimentation
- Audio processing research
- AI model evaluation
- Software development study

---

## PROHIBITED USES

🚫 **DO NOT USE THIS SOFTWARE TO:**
- Download copyrighted music or videos without permission
- Circumvent content creator monetization
- Violate platform terms of service
- Distribute copyrighted material
- Engage in commercial piracy

---

## TECHNICAL DISCLAIMERS

### Third-Party Dependencies
This software relies on open-source libraries including:
- yt-dlp (YouTube downloading)
- Demucs (AI stem separation)
- FFmpeg (audio processing)

Users are bound by the terms and licenses of these dependencies.

### No Warranty
This software is provided "AS IS" without warranty of any kind. The developers make no guarantees regarding:
- Functionality or performance
- Data security or privacy
- Compliance with any regulations
- Fitness for any particular purpose

---

## JURISDICTION AND COMPLIANCE

- Users must comply with laws in their jurisdiction
- This disclaimer is governed by applicable local laws
- If any provision is unenforceable, other provisions remain in effect
- Use of this software constitutes acceptance of these terms

---

## CONTACT AND REPORTING

If you believe this software facilitates copyright infringement:
- Contact the repository maintainers
- Follow GitHub's DMCA takedown procedures
- Consult with legal counsel as appropriate

---

**BY USING THIS SOFTWARE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THIS DISCLAIMER.**

**USE AT YOUR OWN RISK AND RESPONSIBILITY.**

---

*Last Updated: [Current Date]*
*This disclaimer may be updated without notice*

# StemTube - AI-Powered Music Separation & Analysis

> Professional-grade stem extraction, chord detection, and karaoke system with YouTube integration

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

---

## ✨ Features

- 🎵 **YouTube Integration** - No API key required (aiotube + yt-dlp)
- 🎹 **AI Stem Extraction** - Demucs 4-stem/6-stem separation (GPU accelerated)
- 🎸 **Advanced Chord Detection** - BTC Transformer (170 chords), madmom CRF (24 types), hybrid fallback with Guitar Hero-style fixed reading focus
- 🎤 **Karaoke Mode** - Word-level lyrics with faster-whisper (GPU-accelerated)
- 🎼 **Structure Analysis** - MSAF automatic section detection (intro/verse/chorus)
- 🎚️ **Interactive Mixer** - Independent pitch/tempo control (SoundTouch + Web Audio API)
- 📱 **Mobile Optimized** - Full-featured iOS/Android interface with touch controls
- 👥 **Multi-User** - Authentication + global file deduplication
- 🚀 **GPU Accelerated** - 4-10x faster processing (automatic CUDA detection)
- 🔒 **HTTPS Required** - For pitch/tempo features (ngrok included)

---

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Install system dependencies (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install -y \
  python3.12 python3.12-venv python3-dev build-essential \
  ffmpeg libsndfile1 libatlas-base-dev liblapack-dev

# 2. Clone & setup
git clone https://github.com/Benasterisk/StemTube-dev.git
cd StemTube-dev
python3.12 setup_dependencies.py  # Automatic: venv, PyTorch, dependencies, models

# 3. Configure security (MANDATORY)
cp .env.example .env
python3 -c "import secrets; print('FLASK_SECRET_KEY=' + secrets.token_hex(32))" >> .env
chmod 600 .env

# 4. Start with HTTPS (ngrok)
./start_service.sh

# Access:
# Local: http://localhost:5011
# Remote: https://your-subdomain.ngrok-free.app
# Mobile: https://your-subdomain.ngrok-free.app/mobile
```

**That's it!** 🎉 See [Installation Guide](docs/user-guides/01-INSTALLATION.md) for detailed setup.

---

## 📚 Documentation

**For Users:**
- [📖 Quickstart Guide](docs/user-guides/00-QUICKSTART.md) - Get started in 5 minutes
- [⚙️ Installation](docs/user-guides/01-INSTALLATION.md) - Detailed setup instructions
- [🎮 Usage Guide](docs/user-guides/02-USAGE.md) - How to use features
- [📱 Mobile Guide](docs/user-guides/03-MOBILE.md) - Mobile interface
- [🛠️ Troubleshooting](docs/user-guides/05-TROUBLESHOOTING.md) - Common issues

**For Administrators:**
- [🔐 Security Setup](docs/admin-guides/SECURITY_SETUP.md) - Best practices
- [🚀 Deployment](docs/admin-guides/DEPLOYMENT.md) - Production setup
- [🔒 HTTPS Setup](docs/admin-guides/HTTPS-SETUP.md) - Required for audio features
- [📊 Service Management](docs/admin-guides/SERVICE_COMMANDS.md) - systemd

**For Developers:**
- [🏗️ Architecture](docs/developer-guides/ARCHITECTURE.md) - System design
- [📡 API Reference](docs/developer-guides/API-REFERENCE.md) - All 69 endpoints
- [🗄️ Database Schema](docs/developer-guides/DATABASE-SCHEMA.md) - Tables & relationships
- [💻 Frontend Guide](docs/developer-guides/FRONTEND-GUIDE.md) - JavaScript modules
- [🐍 Backend Guide](docs/developer-guides/BACKEND-GUIDE.md) - Python modules
- [🤖 AI Guidelines](docs/developer-guides/AGENTS.md) - For AI assistants

**Feature Guides:**
- [🎸 Chord Detection](docs/feature-guides/CHORD-DETECTION.md) - BTC/madmom/hybrid
- [🎹 Stem Extraction](docs/feature-guides/STEM-EXTRACTION.md) - Demucs models
- [🎤 Lyrics & Karaoke](docs/feature-guides/LYRICS-KARAOKE.md) - faster-whisper
- [🎼 Structure Analysis](docs/feature-guides/STRUCTURE-ANALYSIS.md) - MSAF
- [🎚️ Pitch/Tempo Control](docs/feature-guides/PITCH-TEMPO-CONTROL.md) - SoundTouch
- [📱 Mobile Architecture](docs/feature-guides/MOBILE-ARCHITECTURE.md) - iOS/Android

---

## 🔧 System Requirements

**Minimum:**
- Python 3.12+
- 4 GB RAM
- 2 GB disk space
- FFmpeg (auto-installed)
- **HTTPS or localhost** (required for pitch/tempo features)

**Recommended:**
- NVIDIA GPU with CUDA 11.x-13.x (10x faster processing)
- 8 GB RAM
- 20 GB disk (models + downloads)
- Ngrok tunnel (automatic HTTPS)

**Supported Platforms:**
- Linux (Ubuntu/Debian recommended)
- Windows 10/11
- macOS (Intel/Apple Silicon)

---

## 🎯 Use Cases

- **Musicians**: Practice with isolated stems, change tempo/pitch
- **DJs**: Remix preparation, acapella extraction
- **Educators**: Music theory analysis, transcription
- **Karaoke**: Word-level synchronized lyrics
- **Researchers**: Music information retrieval, chord analysis

---

## 📊 Performance

| Operation | CPU | GPU (CUDA) | Speedup |
|-----------|-----|------------|---------|
| Stem extraction (4 stems, 4 min song) | 3-8 min | 20-60s | **4-8x** |
| Lyrics transcription | 30-120s | 10-30s | **3-5x** |
| Chord detection (BTC) | 15-30s | 15-30s | - |
| Chord detection (madmom) | 20-40s | 20-40s | - |
| Structure analysis | ~5s | ~5s | - |

---

## 🎸 Chord Detection Backends

StemTube supports **3 chord detection backends** with automatic fallback:

1. **BTC Transformer** (170 chord vocabulary) - Most accurate, GPU-optimized
   - External dependency: `../essentiatest/BTC-ISMIR19`
   - Supports complex jazz/advanced harmonies

2. **madmom CRF** (24 chord types) - Professional-grade, CPU-friendly
   - Built-in, no external dependencies
   - Chordify/Moises accuracy level

3. **Hybrid Detector** - Combines multiple backends for best results
   - Automatic fallback when BTC unavailable
   - Configurable via `core/config.json`

See [Chord Detection Guide](docs/feature-guides/CHORD-DETECTION.md) for details.

---

## 📱 Mobile Features

Full-featured mobile interface at `/mobile`:

- **Responsive Touch Controls** - Optimized for iOS and Android
- **iOS Audio Unlock** - Automatic handling of iOS audio restrictions
- **Timeline Chords** - Compact progression with live playhead
- **SVG Chord Diagrams** - Guitar & piano diagrams from guitar-chords-db-json
- **Focused Karaoke** - Current line + 2 previous for easy reading
- **Shared Transport** - Tempo/pitch/playback synchronized across tabs
- **Zero-Latency Tempo** - Hybrid SoundTouch/playbackRate engine

9 mobile-specific JavaScript modules ensure smooth performance on all devices.

---

## 🤝 Contributing

We welcome contributions! Please:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
2. Follow code style (English comments required)
3. Test on CPU and GPU if possible
4. Update documentation for new features

---

## 📄 License

See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- [Demucs](https://github.com/facebookresearch/demucs) - AI stem separation
- [faster-whisper](https://github.com/guillaumekln/faster-whisper) - Speech recognition
- [madmom](https://github.com/CPJKU/madmom) - Audio analysis & chord detection
- [BTC](https://github.com/jayg996/BTC-ISMIR19) - Advanced chord recognition
- [MSAF](https://github.com/urinieto/msaf) - Structure analysis
- [SoundTouchJS](https://github.com/cutterbl/SoundTouchJS) - Pitch/tempo processing
- [guitar-chords-db-json](https://github.com/tombatossals/guitar-chords-db-json) - Chord diagrams

---

**Version**: 2.0+
**Last Updated**: December 2025
**Status**: Active Development
**GPU Support**: Fully Automated ✨
