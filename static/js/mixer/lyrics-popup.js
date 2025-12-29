class LyricsPopup {
    constructor() {
        this.popup = document.getElementById('lyrics-popup');
        if (!this.popup) {
            return;
        }

        this.openBtn = document.getElementById('lyrics-popup-open');
        this.closeBtn = document.getElementById('lyrics-popup-close');
        this.slider = document.getElementById('lyrics-popup-slider');
        this.popupLyricsSlot = document.getElementById('lyrics-popup-lyrics');
        this.originalLyricsElement = document.querySelector('#karaoke-container-lyrics .karaoke-lyrics');
        this.originalParent = this.originalLyricsElement ? this.originalLyricsElement.parentElement : null;
        this.placeholder = null;
        this.isOpen = false;

        this.bindEvents();
    }

    bindEvents() {
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.slider) {
            const refocus = () => {
                if (window.karaokeDisplayInstance) {
                    window.karaokeDisplayInstance.refocusCurrentLine(true);
                }
            };

            this.slider.addEventListener('input', (event) => {
                this.applyScale(parseFloat(event.target.value));
            });

            this.slider.addEventListener('change', refocus);
            this.slider.addEventListener('mouseup', refocus);
            this.slider.addEventListener('touchend', refocus);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        this.popup.addEventListener('click', (event) => {
            if (event.target === this.popup) {
                this.close();
            }
        });
    }

    open() {
        if (this.isOpen || !this.popupLyricsSlot || !this.originalLyricsElement) {
            return;
        }

        // Insert placeholder to remember where to restore lyrics
        if (!this.placeholder) {
            this.placeholder = document.createElement('div');
            this.placeholder.className = 'lyrics-placeholder';
        }

        if (this.originalParent) {
            this.originalParent.insertBefore(this.placeholder, this.originalLyricsElement);
        }

        this.popupLyricsSlot.appendChild(this.originalLyricsElement);
        this.popup.classList.add('active');
        document.body.classList.add('lyrics-popup-open');
        this.isOpen = true;

        // Reset slider to default if lyrics were scaled before
        if (this.slider) {
            this.slider.value = this.slider.value || '1';
            this.applyScale(parseFloat(this.slider.value));
        }

        if (window.karaokeDisplayInstance) {
            window.karaokeDisplayInstance.refocusCurrentLine(true);
        }
    }

    close() {
        if (!this.isOpen || !this.originalLyricsElement) {
            return;
        }

        if (this.placeholder && this.placeholder.parentNode) {
            this.placeholder.parentNode.replaceChild(this.originalLyricsElement, this.placeholder);
        } else if (this.originalParent) {
            this.originalParent.appendChild(this.originalLyricsElement);
        }

        this.popup.classList.remove('active');
        document.body.classList.remove('lyrics-popup-open');
        this.isOpen = false;
        this.applyScale(1);
        if (this.slider) {
            this.slider.value = '1';
        }

        if (window.karaokeDisplayInstance) {
            window.karaokeDisplayInstance.refocusCurrentLine(true);
        }
    }

    applyScale(scaleValue) {
        if (!this.originalLyricsElement) {
            return;
        }
        const clamped = Math.min(1.6, Math.max(0.8, scaleValue || 1));
        this.originalLyricsElement.style.fontSize = `${clamped}rem`;
        this.originalLyricsElement.style.lineHeight = `${clamped * 1.4}rem`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.lyricsPopup = new LyricsPopup();
});
