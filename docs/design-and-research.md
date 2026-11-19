# Design and research

Why the dashboard looks, behaves and sounds the way it does. The design follows ADHD research on executive function, time perception and reward. Where the evidence is thin, this doc says so.

> Not medical advice. This is a productivity tool built on published findings, not a treatment.

---

## 1. Principles

| Problem | Design response |
|---|---|
| **Decision paralysis:** a long list makes it hard to start anything | One **main quest** chosen automatically. The rest is visible but secondary. |
| **Time blindness:** deadlines feel abstract until they're too late | Live countdowns, a burning fuse bar, and urgency you can hear that grows as time runs out |
| **Out of sight, out of mind** | 24x7 Telegram alerts, a morning digest, and ten-second task capture from chat or the `N` key |
| **Low motivation for tasks with no immediate reward** | Immediate, varied rewards for finishing; combo streaks; a wins counter |
| **Shame spirals make avoidance worse** | No failure sounds. Pausing or skipping is neutral. Missed deadlines get a nudge, not a scolding. |
| **Sensory overload** | Soft sound mode, a snooze for panic mode, quiet hours, reduced-motion support |

## 2. Prioritisation

Each open task gets a score; the highest becomes the main quest.

```
w      = danger weight (Critical 4 · High 3 · Medium 2 · Low 1)
h      = hours until deadline
score  = 100000 + 1000·w − h        if overdue  (overdue always wins; most dangerous, then most overdue, first)
       = 100·w / max(h, 0.25)        otherwise   (urgency rises as the deadline approaches)
       = 0.5·w                       if there's no deadline
score ×= 1.15 if already started     (momentum: finish what you began)
```

So a Medium task due in 1 hour (score 200) outranks a Critical task due in 3 hours (133), but a Critical task overdue by any amount outranks everything. Lanes (overdue / 24 h / 3 days / week / later) give the whole picture at a glance.

## 3. Urgency engine (panic mode)

Panic mode locks onto the **soonest deadline within 3 hours that hasn't been started**.

| Level | Trigger | Heart rate | Effects |
|---|---|---|---|
| 1 · tense | ≤ 3 h | 64 → 94 bpm | heartbeat, red edges pulse with each beat |
| 2 · panic | ≤ 1 h | 95 → 140 bpm | + ticking clock, main box thumps, countdown glitches, card shakes |
| 3 · meltdown | ≤ 10 min | 140 → 170 bpm | + rising tension drone, screen glitch and scanlines, vibration; full-screen alert at 5 min |
| 4 · blown | 0 to −15 min | ~168 bpm, irregular | then handed over to periodic reminders |

**The key mechanic: starting is the exit.** Marking the task *Doing* silences its panic immediately. The pressure is designed to push you into starting, not to leave you anxious. A **pause 10 min** option is always available so the effects never trap anyone.

## 4. Sound design

Everything is synthesised at runtime with the Web Audio API: FM bells, a dynamics compressor and convolution reverb. No audio files are loaded.

| Moment | Sound | Reasoning |
|---|---|---|
| Task done | Bell melody chosen at random from 5 | Varied rewards resist habituation better than a fixed one |
| Done again within 20 min | Pitch rises a semitone per combo | Makes momentum audible |
| Random (~18%) or every 4th combo | "Jackpot" fanfare + extra confetti | Unpredictable bonus rewards (variable-ratio reinforcement) sustain engagement |
| Task added | Lock click + sparkle | Signals the task is safely stored, so you can stop holding it in memory |
| Start | "Power-up" arpeggio | Lowers the barrier to starting |
| 1 h / 10 min / deadline | Soft bell → brighter bells → "uh-oh" + low thump | Escalates noticeably without being harsh |
| Overdue reminders | Rotate between 3 timbres | A repeated identical sound fades into the background |
| Skip / pause | Neutral swoosh | No punishment, so no shame loop |

Comfort options: **full / soft / off** volume modes, Android vibration, and `prefers-reduced-motion` support.

## 5. Noise lab

### The idea
The *moderate brain arousal* model proposes that some ADHD brains are under-stimulated, and that steady background noise adds just enough input to improve performance through **stochastic resonance**: too little noise does nothing, too much distracts, and the best level varies from person to person ([Söderlund et al., 2007](https://pubmed.ncbi.nlm.nih.gov/17683456/)).

### What the evidence says
- A 2024 meta-analysis found a **small** benefit of white or pink noise on task performance for people with ADHD, and a slight *negative* effect for people without it ([summary](https://www.adxs.org/en/page/517/white-pink-brown-noise)).
- A 2024 study found that a plain tone helped about as much as noise, which questions whether stochastic resonance is really the mechanism ([same summary](https://www.adxs.org/en/page/517/white-pink-brown-noise)).
- **Brown noise** is the popular favourite and the most comfortable, but has the least direct research ([overview](https://www.brain.fm/blog/brown-noise-adhd-white-noise-pink-noise-focus)).
- Some people focus best in silence.

So the dashboard offers all three colours **and a way to test what works for you**, rather than assuming one answer.

### Goldilocks finder
A browser can't know the real sound level at your ears, because that depends on device volume and headphones. Instead, the finder measures performance:

- **Task:** a short continuous-performance test. Letters flash every 850 ms for 450 ms; respond only to **X** (25% of trials, never two in a row).
- **Conditions:** silence, 25%, 50% and 75% volume, 30 seconds each, **in random order** to spread out practice and fatigue effects.
- **Score:** hit rate minus false-alarm rate; reaction time only breaks ties.
- **Result:** the best level averaged across all runs (the last 10 per level are kept). Ties go to the quieter level. One run is noisy, so users are told to repeat it on different days.

### Engineering
| Requirement | Implementation |
|---|---|
| No audible loop | Noise generated sample by sample in an `AudioWorklet`, so it never repeats. If the browser blocks that, it falls back to 3 overlapping loops (13 / 17 / 23 s) that repeat only every ~85 min, each with an equal-power crossfade at the seam (no click, no volume dip) |
| Spectrum | White: flat. Pink: Paul Kellet filter (−3 dB/oct). Brown: leaky integrator (−6 dB/oct) |
| No rumble, softer hiss | Pink and brown: 4th-order high-pass at 35 Hz + gentle low-pass from 6 kHz. White stays unfiltered, as in the studies |
| Width | Independent random sources per channel, so the noise sounds wide rather than inside your head |
| Steady | No modulation or swells; 1.5 s fade-in only |
| Fair comparison | All three colours trimmed to equal loudness (LUFS) |
| Hearing safety | Warning above 70% volume, roughly where output exceeds −18 LUFS |

Measured results are in [noise-measurements.md](noise-measurements.md).

## 6. Telegram integration

- **Polling, not webhooks:** a one-minute time-driven trigger calls `getUpdates`, processes button taps and messages, then checks deadlines. Everything stays inside one trigger, no public endpoint is exposed, and `LockService` prevents overlapping runs.
- **No duplicate alerts:** each alert level is recorded per `row|deadline`, so changing a deadline re-arms its alerts. The first run after connecting marks thresholds that have already passed, so linking doesn't flood you with old alerts.
- **Bursts imitate ringing:** bots can't place calls, so imminent alerts send 2–4 messages in a row.
- **Security:** the token lives in Script Properties, and only the chat linked during setup is accepted.

## 7. What I'd do next

- Optional real phone-call escalation for the final 5 minutes, through a voice API.
- Recurring tasks.
- Google Calendar sync, so deadlines show up in existing reminder systems.
- A small user study comparing finder results against self-reported focus.

## References

- Söderlund, G., Sikström, S., & Smart, A. (2007). Listen to the noise: noise is beneficial for cognitive performance in ADHD. *Journal of Child Psychology and Psychiatry.* [PubMed](https://pubmed.ncbi.nlm.nih.gov/17683456/)
- ADxS.org: *White, pink and brown noise in ADHD* (research summary, including the 2024 meta-analysis and tone study). [Link](https://www.adxs.org/en/page/517/white-pink-brown-noise)
- Brain.fm: *Brown noise for ADHD* (overview of colour differences). [Link](https://www.brain.fm/blog/brown-noise-adhd-white-noise-pink-noise-focus)
