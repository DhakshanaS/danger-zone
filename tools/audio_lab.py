"""
Audio lab for the Danger Zone dashboard.

Runs the dashboard's real Web Audio engine inside headless Chromium (OfflineAudioContext),
so everything below is measured from / exported from the exact code users hear.

  python tools/audio_lab.py measure   # noise spectrum, stereo, repetition, clicks, loudness (LUFS)
  python tools/audio_lab.py sounds    # re-export sounds/*.mp3 (Telegram-ready: < 5 s, < 300 KB)

Needs: pip install -r tools/requirements.txt  ·  python -m playwright install chromium  ·  ffmpeg on PATH
"""
import asyncio, base64, re, subprocess, sys
from pathlib import Path

import numpy as np
import scipy.signal as ss
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'apps-script' / 'Dashboard.html').as_uri()
OUT = ROOT / 'tools' / 'out'
SR = 48000

# --------------------------------------------------------------------------- browser rendering
RENDER_JS = """async ([setup, calls, len, sr]) => {
  const oc = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  oc.__res = oc.resume.bind(oc); oc.resume = () => Promise.resolve();
  window.AudioContext = function () { return oc; }; window.webkitAudioContext = window.AudioContext;
  soundMode = 'full'; navigator.vibrate = () => true;
  sfx.unlock();
  if (setup === 'live') { for (let i = 0; i < 100 && sfx._nz.wk !== 2; i++) await new Promise(r => setTimeout(r, 50));
                          if (sfx._nz.wk !== 2) return 'ERR: live noise generator did not load'; }
  if (setup === 'loops') sfx._nz.wk = -1;
  for (const [t, js] of calls) { if (t === 0) eval(js); else oc.suspend(t).then(() => { eval(js); oc.__res(); }); }
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
  let s = ''; const u8 = new Uint8Array(out.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}"""

async def render(jobs):
    """jobs: list of (name, setup, calls, seconds) -> {name: float32 array (n, 2)}"""
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, setup, calls, secs in jobs:
            page = await browser.new_page()
            await page.route('**/fonts.*/**', lambda r: r.abort())          # fonts aren't needed for audio
            await page.goto(PAGE, wait_until='domcontentloaded')
            b64 = await page.evaluate(RENDER_JS, [setup, calls, secs, SR])
            if b64.startswith('ERR'): sys.exit(f'{name}: {b64}')
            out[name] = np.frombuffer(base64.b64decode(b64), dtype=np.float32).reshape(-1, 2)
            print('  rendered', name, flush=True)
            await page.close()
        await browser.close()
    return out

def lufs(x):
    OUT.mkdir(parents=True, exist_ok=True); tmp = OUT / '_tmp.f32'
    x.astype(np.float32).tofile(tmp)
    err = subprocess.run(['ffmpeg', '-hide_banner', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', str(tmp),
                          '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tmp.unlink()
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])

# --------------------------------------------------------------------------- measure
def measure():
    jobs = [(f'{mode}_{c}', mode, [[0, f"sfx.noisePlay('{c}', 45)"]], 60)
            for mode in ('live', 'loops') for c in ('brown', 'pink', 'white')]
    print('rendering 60 s of each noise colour (live generator + loop fallback)…')
    data = render_sync(jobs)
    print('\n| mode | colour | slope dB/oct (200 Hz–4 kHz) | energy < 25 Hz | energy > 5 kHz | L/R correlation | strongest repeat | 1 s level range | loudness @ 45 % |')
    print('|---|---|---|---|---|---|---|---|---|')
    for name, x in data.items():
        mode, color = name.split('_')
        x = x[3 * SR:].astype(float)                                       # skip fade-in
        L, R = x[:, 0], x[:, 1]; m = (L + R) / 2
        f, P = ss.welch(L, SR, nperseg=1 << 16)
        sel = (f >= 200) & (f <= 4000)
        slope = np.polyfit(np.log2(f[sel]), 10 * np.log10(P[sel]), 1)[0]
        tot = P[f > 0].sum()
        sub = P[(f > 0) & (f < 25)].sum() / tot * 100
        hi = P[f > 5000].sum() / tot * 100
        corr = np.corrcoef(L, R)[0, 1]
        ref = L[2 * SR:3 * SR]                                             # does any 1 s chunk come back later?
        c = ss.correlate(L, ref, mode='valid')
        c /= np.sqrt(np.convolve(L ** 2, np.ones(len(ref)), 'valid')) * np.linalg.norm(ref) + 1e-12
        c[2 * SR - SR // 2: 2 * SR + SR // 2] = 0
        env = [10 * np.log10((m[i:i + SR] ** 2).mean()) for i in range(0, len(m) - SR, SR)]
        print(f'| {mode} | {color} | {slope:+.1f} | {sub:.2f} % | {hi:.2f} % | {corr:+.3f} | {c.max():.2f} | {max(env) - min(env):.2f} dB | {lufs(x):.1f} LUFS |')
    print('\nstrongest repeat: 1.0 = exact copy, below ~0.2 = no repetition (random-chance level; brown sits highest because deep noise changes slowly).')

# --------------------------------------------------------------------------- sounds
SOUNDS = {   # name: (seconds, [[time, call], ...], alarm?)
    'dz_ALARM_meltdown':  (4.6, [[0, 'sfx.meltdown()'], [1.55, 'sfx.heartbeat(1)'], [1.95, 'sfx.heartbeat(1)'],
                                 [2.35, 'sfx.meltdown()'], [3.5, 'sfx.heartbeat(1)'], [3.9, 'sfx.heartbeat(1)']], True),
    'dz_deadline_uhoh':   (3.2, [[0, 'sfx.due()'], [1.6, 'sfx.heartbeat(1)'], [2.0, 'sfx.heartbeat(1)']], True),
    'dz_panic_heartbeat': (4.4, [[round(i * .42, 2), 'sfx.heartbeat(1)'] for i in range(10)] +
                                [[round(i * .42 + .21, 2), f"sfx.clock({'true' if i % 2 else 'false'}, 3)"] for i in range(10)], True),
    'dz_warning_bells':   (2.6, [[0, 'sfx.warnMid()'], [1.1, 'sfx.warnMid()']], True),
    'dz_soft_heads_up':   (2.4, [[0, 'sfx.warnSoft()']], False),
    'dz_task_added':      (1.6, [[0, 'sfx.vault()']], False),
    'dz_reward_jackpot':  (3.6, [[0, 'sfx.reward(3, true)']], False),
}

def sounds():
    print('rendering sounds from the dashboard engine…')
    data = render_sync([(n, 'none', calls, secs) for n, (secs, calls, _) in SOUNDS.items()])
    dest = ROOT / 'sounds'; OUT.mkdir(parents=True, exist_ok=True)
    for name, x in data.items():
        wav = OUT / f'{name}.f32'; x.astype(np.float32).tofile(wav)
        # alarms: gentle compression so they cut through on phone speakers; then peak-normalise to -1 dBFS
        comp = 'acompressor=threshold=-24dB:ratio=4:attack=3:release=100:makeup=1' if SOUNDS[name][2] else 'anull'
        stage = OUT / f'{name}_stage.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', str(wav),
                        '-af', comp, '-c:a', 'pcm_s16le', str(stage)], check=True)
        err = subprocess.run(['ffmpeg', '-i', str(stage), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
        gain = -1.0 - float(re.findall(r'max_volume: (-?[\d.]+)', err)[0])
        mp3 = dest / f'{name}.mp3'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(stage), '-af', f'volume={gain:.2f}dB',
                        '-c:a', 'libmp3lame', '-b:a', '160k', str(mp3)], check=True)
        wav.unlink(); stage.unlink()
        print(f'  {mp3.name:26} {SOUNDS[name][0]:.1f} s  {mp3.stat().st_size // 1024} KB')

def render_sync(jobs): return asyncio.run(render(jobs))

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'measure': measure()
    elif cmd == 'sounds': sounds()
    else: print(__doc__)
