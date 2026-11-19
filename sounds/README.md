# Sounds

Rendered from the dashboard's Web Audio engine (`python tools/audio_lab.py sounds`). Each file is under 5 s and 300 KB, so it can be used as a **Telegram custom notification sound** (see [SETUP §7](../docs/SETUP.md#7-notification-sounds-on-your-phone)) or as a phone ringtone or alarm.

| File | Length | Character | Suggested use |
|---|---|---|---|
| `dz_ALARM_meltdown.mp3` | 4.6 s | two siren sweeps + racing heartbeat | Telegram bot chat (hardest to ignore) |
| `dz_deadline_uhoh.mp3` | 3.2 s | "uh-oh" bell, low thump, heartbeat | Telegram bot chat (less intense) |
| `dz_panic_heartbeat.mp3` | 4.4 s | fast heartbeat + ticking clock | Tension-style alert |
| `dz_warning_bells.mp3` | 2.6 s | bright bell run, twice | Loud but not stressful |
| `dz_soft_heads_up.mp3` | 2.4 s | gentle two-note bell | Sensory-friendly alert |
| `dz_task_added.mp3` | 1.6 s | lock click + sparkle | General notification |
| `dz_reward_jackpot.mp3` | 3.6 s | win fanfare | Fun; not suited to alarms |

The four alarm sounds are lightly compressed so they cut through on phone speakers. All files are peak-normalised to −1 dBFS.
