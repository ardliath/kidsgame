import { Scene } from 'phaser';
import { loadMuted, saveMuted } from './storage';

//  All the game's sound is synthesised with the Web Audio API — no audio
//  files. We piggyback on Phaser's own AudioContext so browser autoplay
//  unlocking (first tap) is handled for us, and route everything through a
//  master gain so one mute switch silences the lot.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let started = false;
let muted = false;

//  The engine is one long-lived oscillator whose pitch and loudness track
//  the car's speed
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;

let musicTimer: number | null = null;
let musicNextTime = 0;

//  A gentle major-key loop: [frequency, beats]
const BEAT = 0.5;
const MELODY: [number, number][] = [
    [ 392.00, 1 ], [ 523.25, 1 ], [ 493.88, 1 ], [ 392.00, 1 ],
    [ 440.00, 1 ], [ 392.00, 1 ], [ 329.63, 1 ], [ 293.66, 1 ],
    [ 349.23, 1 ], [ 440.00, 1 ], [ 392.00, 1 ], [ 329.63, 1 ],
    [ 392.00, 2 ], [ 293.66, 2 ]
];

export function initSfx (scene: Scene)
{
    if (ctx)
    {
        return;
    }

    const manager = scene.sound as unknown as { context?: AudioContext };

    if (!manager.context)
    {
        return;
    }

    ctx = manager.context;
    master = ctx.createGain();
    muted = loadMuted();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    //  Start the engine and music once the audio is unlocked (Phaser resumes
    //  the context on the first touch/click)
    if (scene.sound.locked)
    {
        scene.sound.once('unlocked', () => start());
    }
    else
    {
        start();
    }
}

function start ()
{
    if (started || !ctx || !master)
    {
        return;
    }

    started = true;

    //  Engine: a buzzy sawtooth softened by a low-pass filter
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.012;

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    musicNextTime = ctx.currentTime;
    scheduleMusic();
}

//  intensity 0 (idle) .. 1 (flat out)
export function setEngine (intensity: number)
{
    if (!ctx || !engineOsc || !engineGain)
    {
        return;
    }

    const i = Math.max(0, Math.min(1, intensity));
    const now = ctx.currentTime;

    engineOsc.frequency.linearRampToValueAtTime(50 + i * 105, now + 0.08);
    engineGain.gain.linearRampToValueAtTime(0.012 + i * 0.05, now + 0.08);
}

export function playBrake ()
{
    if (!ctx || !master)
    {
        return;
    }

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer();

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1400, now);
    band.frequency.exponentialRampToValueAtTime(500, now + 0.35);
    band.Q.value = 6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    source.connect(band);
    band.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + 0.42);
}

export function playCrunch ()
{
    if (!ctx || !master)
    {
        return;
    }

    const now = ctx.currentTime;

    //  A burst of noise for the smash
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer();

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    source.connect(low);
    low.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + 0.26);

    //  ...with a low thud under it
    const thud = ctx.createOscillator();
    thud.type = 'square';
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.12, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    thud.connect(thudGain);
    thudGain.connect(master);
    thud.start(now);
    thud.stop(now + 0.22);
}

export function setMuted (value: boolean)
{
    muted = value;
    saveMuted(value);

    if (ctx && master)
    {
        master.gain.linearRampToValueAtTime(value ? 0 : 1, ctx.currentTime + 0.05);
    }
}

export function isMuted (): boolean
{
    return muted;
}

//  ---- helpers ----

let cachedNoise: AudioBuffer | null = null;

function noiseBuffer (): AudioBuffer
{
    if (cachedNoise || !ctx)
    {
        return cachedNoise as AudioBuffer;
    }

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++)
    {
        data[i] = Math.random() * 2 - 1;
    }

    cachedNoise = buffer;

    return buffer;
}

function playNote (freq: number, at: number, duration: number)
{
    if (!ctx || !master)
    {
        return;
    }

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.04, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
}

function scheduleMusic ()
{
    if (!ctx || !started)
    {
        return;
    }

    //  Guard against two loops ever running at once
    if (musicTimer !== null)
    {
        window.clearTimeout(musicTimer);
        musicTimer = null;
    }

    if (musicNextTime < ctx.currentTime)
    {
        musicNextTime = ctx.currentTime;
    }

    let t = musicNextTime;

    for (const [ freq, beats ] of MELODY)
    {
        playNote(freq, t, beats * BEAT * 0.9);
        t += beats * BEAT;
    }

    musicNextTime = t;

    //  Queue the next loop a touch before this one ends
    musicTimer = window.setTimeout(scheduleMusic, (t - ctx.currentTime) * 1000 - 100);
}
