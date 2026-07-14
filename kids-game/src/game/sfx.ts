import { loadMuted, saveMuted } from './storage';

//  All the game's sound is synthesised with the Web Audio API — no audio
//  files. We run our own AudioContext (rather than Phaser's) so we have full,
//  deterministic control: we unlock it on the first tap, and — crucially —
//  suspend it whenever the tab is hidden or the device is locked, so the game
//  never keeps making noise after it's been put away.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let muted = false;

//  The engine is one oscillator that is SILENT unless he's actively driving,
//  then a soft note whose pitch tracks speed — never a constant idle drone
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

export function initSfx ()
{
    if (ctx)
    {
        return;
    }

    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor)
    {
        return;
    }

    ctx = new AudioCtor();
    master = ctx.createGain();
    muted = loadMuted();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);

    //  Browsers block audio until the first user gesture
    const unlock = () => {

        if (unlocked || !ctx)
        {
            return;
        }

        unlocked = true;
        ctx.resume();
        createEngine();
        startMusic();

        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    //  Stop everything when the game is put away; pick up again on return
    document.addEventListener('visibilitychange', () => {

        if (!ctx)
        {
            return;
        }

        if (document.hidden)
        {
            suspend();
        }
        else if (unlocked)
        {
            ctx.resume();
            startMusic();
        }
    });

    window.addEventListener('pagehide', suspend);
}

function suspend ()
{
    if (musicTimer !== null)
    {
        window.clearTimeout(musicTimer);
        musicTimer = null;
    }

    ctx?.suspend();
}

function createEngine ()
{
    if (engineOsc || !ctx || !master)
    {
        return;
    }

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
}

//  active = pedal down and moving; speedFrac 0..1 sets the pitch. When not
//  active the engine fades to true silence — no idle hum.
export function setEngine (active: boolean, speedFrac: number)
{
    if (!ctx || !engineOsc || !engineGain)
    {
        return;
    }

    const now = ctx.currentTime;
    const frac = Math.max(0, Math.min(1, speedFrac));

    engineOsc.frequency.linearRampToValueAtTime(70 + frac * 90, now + 0.12);
    engineGain.gain.linearRampToValueAtTime(active ? 0.03 + frac * 0.07 : 0, now + (active ? 0.1 : 0.25));
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
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
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

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer();

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    source.connect(low);
    low.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + 0.26);

    const thud = ctx.createOscillator();
    thud.type = 'square';
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.2, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    thud.connect(thudGain);
    thudGain.connect(master);
    thud.start(now);
    thud.stop(now + 0.22);
}

export function playHorn ()
{
    //  Make absolutely sure the context exists and is actually running —
    //  don't rely on the generic first-tap unlock having already fired
    initSfx();
    ctx?.resume();

    if (!ctx || !master)
    {
        return;
    }

    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.25;
    out.connect(master);

    for (const freq of [ 370, 440 ])
    {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.setValueAtTime(0.5, now + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.4);
    }
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
    gain.gain.exponentialRampToValueAtTime(0.13, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
}

function startMusic ()
{
    if (!ctx || !unlocked || document.hidden)
    {
        return;
    }

    //  Never let two loops schedule at once
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
    musicTimer = window.setTimeout(startMusic, (t - ctx.currentTime) * 1000 - 100);
}
