"""
Build the 40.5 s music cue from "Final Lift" and the SFX stem for the fit cut / 16:9 master.
No time-stretch, no pitch change: whole-beat edits on the track's own grid (beat 0.40700 s,
8-beat bar 3.2560 s, bar downbeats at 1.005 + k*3.256 s), 20 ms equal-power crossfades centred on
each cut. SFX are synthesized here (no samples). Deterministic: same inputs, same bytes.
Usage: python lift_cue.py SRC.mp3 OUT_DIR
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf

SR = 48000
FILM = 40.5
BEAT = 0.40700
BAR0 = 1.005
BAR = 8 * BEAT
db = lambda k: BAR0 + k * BAR  # source bar downbeat k

# Edit list: (source in, source out) placed back to back from film 0. Every cut is on the beat grid.
EDITS = [
    # A: bar 1 (808 enters) under the hook; bar 2 thin bass under K1 + "Describe…"; bar 3 thin bass,
    #    its build hit (src 13.0–13.65) in the gap before "First…"; bar 4 sparse percussion under P3.
    (db(1), db(5)),
    # B: from beat 3 of bar 15 (quiet pre-drop under "…what premium costs"); the 808 slams in at
    #    src 52.29 = film 14.65, on the pull-back; heaviest bars 16–17 through "Ready" and the canvas.
    (db(15) + 2 * BEAT, db(18)),
    # C: bars 7–11a: the groove through K2, the edit and the store listing (bar 8's bass dip lands
    #    under "Your own edits are free").
    (db(7), db(11) + 4 * BEAT),
    # D: the outro bar: big 808 at src 63.27 = film 37.03 (lockup), hit at 64.29 = 38.05 (CTA),
    #    last 808 at 65.31 = 39.07, beat out at src 66.12 = film 39.88 (after "…credits", 39.28).
    (db(19), None),
]
XF = 0.020


def decode(path):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-vn", "-ar", str(SR), "-ac", "2", tmp], check=True)
    y, _ = sf.read(tmp, dtype="float64")
    os.unlink(tmp)
    return y


def build_cue(src):
    total = int(round(FILM * SR))
    out = np.zeros((total, 2))
    film = 0.0
    rows = []
    h = int(round(XF / 2 * SR))
    for i, (a, b) in enumerate(EDITS):
        length = (b - a) if b is not None else FILM - film
        f0 = int(round(film * SR))
        n = min(int(round(length * SR)), total - f0)
        s0 = int(round(a * SR))
        # take h extra samples each side for the crossfades
        lo = max(0, s0 - h)
        seg = src[lo : s0 + n + h].copy()
        pre = s0 - lo
        env = np.ones(len(seg))
        if i > 0:  # fade in over [cut - h, cut + h]
            ramp = np.linspace(0, np.pi / 2, 2 * h)
            env[: 2 * h] = np.sin(ramp)
        if b is not None:  # fade out over [end - h, end + h]
            ramp = np.linspace(0, np.pi / 2, 2 * h)
            env[-2 * h :] = np.cos(ramp)
        seg = seg * env[:, None]
        start = f0 - pre
        a0, a1 = max(0, start), min(total, start + len(seg))
        out[a0:a1] += seg[a0 - start : a1 - start]
        rows.append({"source_in": round(a, 3), "source_out": round(a + length, 3), "film_in": round(film, 3), "film_out": round(film + length, 3)})
        film += length
    return out, rows


def env_adsr(n, attack, decay_tau):
    t = np.arange(n) / SR
    e = np.exp(-t / decay_tau)
    a = int(attack * SR)
    if a > 0:
        e[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    return e


def tone(freqs, dur, attack, tau, gains=None):
    n = int(dur * SR)
    t = np.arange(n) / SR
    gains = gains or [1.0] * len(freqs)
    x = sum(g * np.sin(2 * np.pi * f * t) for f, g in zip(freqs, gains))
    return x * env_adsr(n, attack, tau)


rng = np.random.default_rng(7)


def tick():
    """A soft UI press: a 3.2 kHz sine blip with a 1 ms filtered-noise edge, ~25 ms."""
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006)
    noise = rng.standard_normal(n) * np.exp(-t / 0.0012)
    noise = np.convolve(noise, np.ones(6) / 6, mode="same")
    return 0.8 * body + 0.35 * noise


def success():
    """Two short sine notes up a fifth (C6 → G6), the "Ready" / "Saved" confirmation."""
    a = tone([1046.5, 2093.0], 0.16, 0.004, 0.05, [1, 0.25])
    b = tone([1568.0, 3136.0], 0.30, 0.004, 0.09, [1, 0.2])
    out = np.zeros(int(0.42 * SR))
    out[: len(a)] += a
    k = int(0.09 * SR)
    out[k : k + len(b)] += b
    return out


def whoosh(dur=0.9):
    """Band-limited noise swept up from ~250 Hz to ~2.5 kHz, peaking at the end (into the drop)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # one-pole low-pass with a rising cutoff, then subtract a slower low-pass (band-pass-ish)
    fc = 250 * (10 ** (t / dur))
    y = np.zeros(n); z = np.zeros(n); yp = zp = 0.0
    for i in range(n):
        a = 1 - np.exp(-2 * np.pi * fc[i] / SR)
        yp += a * (x[i] - yp); y[i] = yp
        b = 1 - np.exp(-2 * np.pi * (fc[i] / 4) / SR)
        zp += b * (x[i] - zp); z[i] = zp
    bp = y - z
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2 * (t / dur) ** 0.6
    return bp * shape / (np.abs(bp).max() + 1e-9)


def sparkle(notes):
    """Tiny bell notes (sine + 2.76× partial), one per store screenshot appearing."""
    return [tone([f, f * 2.76], 0.5, 0.003, 0.12, [1, 0.18]) for f in notes]


def chime():
    """A soft pitched chime in C (C5 + G5 + C6, light bell partial), 10 ms attack, ~1.5 s decay."""
    return tone([523.25, 783.99, 1046.5, 523.25 * 2.76], 2.6, 0.012, 0.55, [1, 0.6, 0.45, 0.08])


def place(buf, x, t, gain_db):
    g = 10 ** (gain_db / 20)
    i = int(round(t * SR))
    j = min(len(buf), i + len(x))
    buf[i:j, 0] += g * x[: j - i]
    buf[i:j, 1] += g * x[: j - i]


def build_sfx():
    total = int(round(FILM * SR))
    buf = np.zeros((total, 2))
    rows = []

    def add(name, x, t, gain_db, peak):
        x = x / (np.abs(x).max() + 1e-12) * peak
        place(buf, x, t, gain_db)
        rows.append({"sfx": name, "film": round(t, 3), "gain_db": gain_db})

    # Cursor presses in the master (script.ts T): sync to the picture, frame-exact.
    for name, t in [
        ("tick: prompt send", 10.12),
        ("tick: Confirm & build", 14.45),
        ("tick: double-click 1", 25.05),
        ("tick: double-click 2", 25.18),
        ("tick: click away (save)", 27.25),
        ("tick: project menu", 29.95),
        ("tick: Store listing", 30.55),
        ("tick: Make screenshots", 33.35),
    ]:
        add(name, tick(), t, 0, 0.19)
    # Whoosh into the pull-back, ending on the drop (film 14.65).
    add("whoosh into the pull-back", whoosh(0.85), 14.65 - 0.85 + 0.05, 0, 0.14)
    # Success ticks: "Ready" (18.25) and "Saved" (toast at 27.25 + 0.12).
    add("success: Ready", success(), 18.25, 0, 0.09)
    add("success: Saved", success(), 27.37, 0, 0.09)
    # Sparkle: one note per store screenshot appearing (33.55 + 0.22 s each), C minor pentatonic.
    for i, (f, n) in enumerate(zip([1046.5, 1244.5, 1396.9, 1568.0, 2093.0], sparkle([1046.5, 1244.5, 1396.9, 1568.0, 2093.0]))):
        add(f"sparkle: screenshot {i + 1}", n, 33.55 + i * 0.22, 0, 0.05)
    # Chime under the CTA card (CTA fades in 37.55–37.95).
    add("chime: CTA", chime(), 37.6, 0, 0.062)
    return buf, rows


def main():
    src_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    src = decode(src_path)
    cue, edits = build_cue(src)
    sf.write(os.path.join(out_dir, "lift-cue.wav"), cue.astype(np.float32), SR, subtype="FLOAT")
    sfx, rows = build_sfx()
    sf.write(os.path.join(out_dir, "fit-sfx.wav"), sfx.astype(np.float32), SR, subtype="FLOAT")
    json.dump({"beat": BEAT, "bar": BAR, "edits": edits, "sfx": rows}, open(os.path.join(out_dir, "lift-edit.json"), "w"), indent=1)
    for e in edits:
        print("music", e)
    for r in rows:
        print("sfx", r)


if __name__ == "__main__":
    main()
