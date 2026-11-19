# Noise measurements

Measured from the dashboard's real audio engine, rendered offline in headless Chromium (`OfflineAudioContext`, 48 kHz, 60 s per colour, volume 45%, first 3 s skipped for the fade-in). Reproduce with:

```bash
python tools/audio_lab.py measure
```

## Results

| Mode | Colour | Slope (200 Hz–4 kHz) | Energy < 25 Hz | Energy > 5 kHz | L/R correlation | Strongest repeat | 1 s level range | Loudness @ 45% |
|---|---|---|---|---|---|---|---|---|
| live | brown | −5.4 dB/oct | 0.15 % | 0.75 % | −0.003 | 0.18 | 1.08 dB | −25.8 LUFS |
| live | pink | −2.6 dB/oct | 0.30 % | 7.15 % | −0.005 | 0.14 | 0.93 dB | −25.8 LUFS |
| live | white | 0.0 dB/oct | 0.10 % | 79.17 % | 0.000 | 0.02 | 0.10 dB | −26.1 LUFS |
| loops (fallback) | brown | −5.4 dB/oct | 0.16 % | 0.76 % | +0.010 | 0.35 | 1.30 dB | −25.8 LUFS |
| loops (fallback) | pink | −2.6 dB/oct | 0.27 % | 7.19 % | −0.008 | 0.40 | 0.89 dB | −25.9 LUFS |
| loops (fallback) | white | 0.0 dB/oct | 0.11 % | 79.17 % | 0.000 | 0.34 | 0.15 dB | −26.1 LUFS |

**How to read it**
- **Slope:** the theoretical values are brown −6, pink −3 and white 0. Pink and brown measure slightly shallower because the 6 kHz soft roll-off and 35 Hz high-pass shape the edges of the fitted range.
- **Strongest repeat:** the best normalised match between a 1 s excerpt and the rest of the minute. 1.0 means an exact copy. Live mode sits at random-chance level (deep brown noise changes slowly, so its chance level is a bit higher). In fallback mode each loop carries a third of the signal, so the largest possible match is about 0.33.
- **L/R correlation ≈ 0:** the channels are independent, so the noise sounds wide rather than centred inside your head.
- **1 s level range:** natural fluctuation only; there is no modulation.
- **Loudness:** all three colours are within 0.3 LU of each other, so switching colour doesn't change perceived volume. Around 70% volume, output reaches roughly −18 LUFS, which is where the dashboard starts showing a loudness warning.
- **Clicks:** every fallback-loop seam measured 0.06–1.7σ of a normal sample-to-sample step, so the seams are inaudible.

## Before vs after the noise-engine rework

The first version played one 12-second mirrored buffer per colour. Comparing it against a published brown-noise production guide led to these changes:

| Check | Before | After |
|---|---|---|
| Repetition | Exact repeat every 12 s | Never repeats (live); ~85 min cycle (fallback) |
| Deep rumble < 25 Hz (brown) | 12.0 % of energy | 0.15 % |
| Hiss > 5 kHz (brown) | 1.8 % | 0.75 % |
| Loudness difference between colours | White ~4.4 dB louder | ≤ 0.3 LU |
| High-volume warning | none | above 70% |

## Not adopted from the guide

- **Layering rain or aircraft-cabin sound:** a comfort preference with no evidence behind it, and it could add recognisable patterns.
- **Filtering white noise:** left unfiltered to match the noise used in the ADHD studies.
