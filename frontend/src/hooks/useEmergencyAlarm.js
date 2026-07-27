import { useRef, useCallback } from 'react';

/**
 * useEmergencyAlarm
 *
 * Generates a terrifying emergency alarm siren using the Web Audio API.
 * Uses two detuned oscillators swept through a frequency range,
 * layered with a harsh buzz oscillator and pulsing gain,
 * to produce an unmistakable "DANGER" sound.
 *
 * Returns: { startAlarm, stopAlarm, isPlaying }
 */
export function useEmergencyAlarm() {
  const ctxRef      = useRef(null);
  const nodesRef    = useRef([]);
  const rafRef      = useRef(null);
  const playingRef  = useRef(false);

  const stopAlarm = useCallback(() => {
    playingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    nodesRef.current.forEach(n => {
      try { n.stop?.(); } catch { /* already stopped */ }
      try { n.disconnect?.(); } catch { /* ok */ }
    });
    nodesRef.current = [];

    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  const startAlarm = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    // ── Master gain ────────────────────────────────────────────────
    const master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);

    // ── Compressor (keeps it loud without clipping) ───────────────
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 12;
    compressor.connect(master);

    // ── Distortion waveshaper (makes it harsh & scary) ────────────
    const distortion = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (Math.PI + 50) * x / (Math.PI + 50 * Math.abs(x));
    }
    distortion.curve = curve;
    distortion.connect(compressor);

    // ── Primary siren oscillator (sawtooth — raspy) ───────────────
    const siren1 = ctx.createOscillator();
    siren1.type = 'sawtooth';
    siren1.frequency.value = 800;
    const siren1Gain = ctx.createGain();
    siren1Gain.gain.value = 0.5;
    siren1.connect(siren1Gain);
    siren1Gain.connect(distortion);
    siren1.start();

    // ── Secondary siren oscillator (square — piercing) ────────────
    const siren2 = ctx.createOscillator();
    siren2.type = 'square';
    siren2.frequency.value = 810;
    const siren2Gain = ctx.createGain();
    siren2Gain.gain.value = 0.25;
    siren2.connect(siren2Gain);
    siren2Gain.connect(distortion);
    siren2.start();

    // ── Low rumble (adds dread) ───────────────────────────────────
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 55;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.15;
    rumble.connect(rumbleGain);
    rumbleGain.connect(compressor);
    rumble.start();

    // ── Pulsing LFO on the master gain (heartbeat-like throb) ─────
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4;           // 4 Hz pulse
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();

    nodesRef.current = [siren1, siren2, rumble, lfo];

    // ── Frequency sweep animation (wailing siren effect) ──────────
    const LOW = 600, HIGH = 1400, SPEED = 0.0018;
    let phase = 0;

    const sweep = () => {
      if (!playingRef.current) return;
      phase += SPEED;
      const t = (Math.sin(phase) + 1) / 2;   // 0 → 1 → 0
      const freq = LOW + t * (HIGH - LOW);
      siren1.frequency.value = freq;
      siren2.frequency.value = freq + 12;     // slight detune for chorus
      rumble.frequency.value = 50 + t * 15;
      rafRef.current = requestAnimationFrame(sweep);
    };
    sweep();
  }, []);

  return { startAlarm, stopAlarm, isPlaying: playingRef };
}
