// Sound, all synthesized with WebAudio — no audio files, no network. Effects
// are short oscillator and noise bursts; the engine is a low sawtooth whose
// pitch follows speed; the siren is a two-tone wail; the music is a laid-back
// sunset loop (a bass line and soft chords, scheduled ahead of time).

const MUSIC_BPM = 96;
const BASS_LINE = [45, 0, 45, 48, 43, 0, 43, 50, 45, 0, 45, 48, 52, 50, 48, 45];
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [50, 53, 57]];

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function createSound() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(duration) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  function noise(duration, volume, filterFreq) {
    if (!context) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function scheduleMusic() {
    if (!context) return;
    const stepTime = 60 / MUSIC_BPM / 2;
    while (nextNoteTime < context.currentTime + 0.3) {
      const step = musicStep % 16;
      const bass = BASS_LINE[step];
      if (bass) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(bass);
        gain.gain.setValueAtTime(0.16, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + stepTime * 1.8);
        osc.connect(gain);
        gain.connect(master);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + stepTime * 2);
      }
      if (step % 8 === 0) {
        const chord = CHORDS[(musicStep / 8) % 4 | 0];
        for (const note of chord) {
          const osc = context.createOscillator();
          const gain = context.createGain();
          osc.type = 'sine';
          osc.frequency.value = midiToFreq(note);
          gain.gain.setValueAtTime(0.05, nextNoteTime);
          gain.gain.linearRampToValueAtTime(0.07, nextNoteTime + stepTime * 2);
          gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + stepTime * 8);
          osc.connect(gain);
          gain.connect(master);
          osc.start(nextNoteTime);
          osc.stop(nextNoteTime + stepTime * 8);
        }
      }
      if (step % 4 === 2) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200;
        gain.gain.setValueAtTime(0.04, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.05);
        osc.connect(gain);
        gain.connect(master);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + 0.06);
      }
      musicStep += 1;
      nextNoteTime += stepTime;
    }
  }

  return {
    /** Call from a user gesture: creates the context and starts the music. */
    unlock() {
      if (!ensure()) return;
      if (context.state === 'suspended') void context.resume();
      if (!musicTimer) {
        nextNoteTime = context.currentTime + 0.1;
        musicTimer = window.setInterval(scheduleMusic, 120);
      }
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineGain = context.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 50;
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
    },
    /** Engine hum follows speed 0..1; silent on foot. */
    engine(level) {
      if (!engineGain || !context) return;
      const target = muted ? 0 : level * 0.09;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + level * 130, context.currentTime, 0.08);
    },
    /** Siren wail while wanted; call with 0 to silence. */
    siren(stars) {
      if (!ensure()) return;
      if (stars <= 0) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.2);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenGain = context.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 700;
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        lfo.frequency.value = 0.7;
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        lfo.start();
      }
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.05, context.currentTime, 0.2);
    },
    shoot() { if (context) { noise(0.12, 0.5, 2400); blip(220, 0.08, 'square', 0.25, 60); } },
    enemyShoot() { if (context) { noise(0.1, 0.25, 1800); } },
    swing() { if (context) noise(0.12, 0.25, 900); },
    thud() { if (context) { blip(90, 0.18, 'sine', 0.5, 40); noise(0.1, 0.3, 500); } },
    crash() { if (context) { noise(0.25, 0.5, 800); blip(70, 0.2, 'sine', 0.4, 35); } },
    explosion() { if (context) { noise(0.7, 0.7, 500); blip(60, 0.6, 'sine', 0.6, 28); } },
    hurt() { if (context) blip(160, 0.15, 'sawtooth', 0.3, 80); },
    pickup() { if (context) { blip(660, 0.1, 'sine', 0.3); window.setTimeout(() => blip(880, 0.14, 'sine', 0.3), 90); } },
    cash() { if (context) { blip(990, 0.08, 'sine', 0.25); window.setTimeout(() => blip(1320, 0.12, 'sine', 0.25), 70); } },
    door() { if (context) { blip(180, 0.08, 'square', 0.2, 120); noise(0.08, 0.2, 1200); } },
    objective() { if (context) { blip(520, 0.12, 'sine', 0.3); window.setTimeout(() => blip(780, 0.16, 'sine', 0.3), 110); } },
    missionStart() { if (context) { [440, 554, 659].forEach((f, i) => window.setTimeout(() => blip(f, 0.16, 'triangle', 0.3), i * 120)); } },
    missionComplete() { if (context) { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'triangle', 0.3), i * 130)); } },
    missionFail() { if (context) { [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'sawtooth', 0.25), i * 150)); } },
    busted() { if (context) { [330, 262, 196].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'sawtooth', 0.25), i * 160)); } },
    clear() { if (context) { blip(784, 0.15, 'sine', 0.25); window.setTimeout(() => blip(1046, 0.2, 'sine', 0.25), 120); } },
    enemyDown() { if (context) blip(300, 0.12, 'square', 0.2, 90); },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.05);
      return muted;
    },
    isMuted() { return muted; },
  };
}
