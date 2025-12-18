"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    (() => {
      // ---------- Audio ----------
      let audioCtx: AudioContext | null = null;
      const lookaheadMs = 25;
      const scheduleAheadSec = 0.12;
      let timerId: any = null;

      let nextNoteTime = 0;
      let currentStep = 0;
      let isPlaying = false;

      let masterGain: GainNode,
        hhGain: GainNode,
        snGain: GainNode,
        kGain: GainNode;

      const mute = { hh: false, sn: false, k: false };

      // ---------- UI ----------
      const bpmEl = document.getElementById("bpm") as HTMLInputElement;
      const tsNumEl = document.getElementById("tsNum") as HTMLInputElement;
      const tsDenEl = document.getElementById("tsDen") as HTMLSelectElement;
      const subdivEl = document.getElementById("subdiv") as HTMLSelectElement;

      const masterEl = document.getElementById("master") as HTMLInputElement;
      const hhVolEl = document.getElementById("hhVol") as HTMLInputElement;
      const snVolEl = document.getElementById("snVol") as HTMLInputElement;
      const kVolEl = document.getElementById("kVol") as HTMLInputElement;

      const masterValEl = document.getElementById("masterVal")!;
      const hhValEl = document.getElementById("hhVal")!;
      const snValEl = document.getElementById("snVal")!;
      const kValEl = document.getElementById("kVal")!;

      const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
      const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
      const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
      const presetBtn = document.getElementById("presetBtn") as HTMLButtonElement;
      const statusEl = document.getElementById("status")!;
      const seqEl = document.getElementById("sequencer")!;
      const loopInfoEl = document.getElementById("loopInfo")!;

      let stepsPerBar = 16;
      const pattern: Record<string, boolean[]> = { hh: [], sn: [], k: [] };

      const clamp = (n: number, a: number, b: number) =>
        Math.max(a, Math.min(b, n));

      function calcStepsPerBar() {
        const num = clamp(parseInt(tsNumEl.value || "4"), 1, 15);
        const den = parseInt(tsDenEl.value);
        const subdiv = parseInt(subdivEl.value);
        return { num, den, subdiv, spb: num * subdiv };
      }

      function secondsPerStep() {
        const bpm = clamp(parseFloat(bpmEl.value || "110"), 40, 240);
        const den = parseInt(tsDenEl.value);
        const subdiv = parseInt(subdivEl.value);
        const quarter = 60 / bpm;
        const beatDur = quarter * (4 / den);
        return beatDur / subdiv;
      }

      function ensureAudio() {
        if (audioCtx) return;
        audioCtx = new AudioContext();

        masterGain = audioCtx.createGain();
        hhGain = audioCtx.createGain();
        snGain = audioCtx.createGain();
        kGain = audioCtx.createGain();

        masterGain.gain.value = +masterEl.value;
        hhGain.gain.value = +hhVolEl.value;
        snGain.gain.value = +snVolEl.value;
        kGain.gain.value = +kVolEl.value;

        hhGain.connect(masterGain);
        snGain.connect(masterGain);
        kGain.connect(masterGain);
        masterGain.connect(audioCtx.destination);
      }

      function noiseBuffer() {
        const length = audioCtx!.sampleRate * 0.25;
        const buffer = audioCtx!.createBuffer(1, length, audioCtx!.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
      }

      function playKick(t: number) {
        if (!audioCtx || mute.k) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
        g.gain.setValueAtTime(1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g).connect(kGain);
        o.start(t);
        o.stop(t + 0.14);
      }

      function playSnare(t: number) {
        if (!audioCtx || mute.sn) return;
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer();
        const hp = audioCtx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 900;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        src.connect(hp).connect(g).connect(snGain);
        src.start(t);
        src.stop(t + 0.16);
      }

      function playHiHat(t: number) {
        if (!audioCtx || mute.hh) return;
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer();
        const hp = audioCtx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        src.connect(hp).connect(g).connect(hhGain);
        src.start(t);
        src.stop(t + 0.08);
      }

      function buildSequencer() {
        const { num, subdiv, spb } = calcStepsPerBar();
        stepsPerBar = spb;

        for (const k of ["hh", "sn", "k"]) {
          pattern[k] = new Array(stepsPerBar).fill(false);
        }

        seqEl.innerHTML = "";

        ["hh", "sn", "k"].forEach((inst) => {
          const label = document.createElement("div");
          label.className = "inst";
          label.textContent =
            inst === "hh" ? "HI-HAT" : inst === "sn" ? "SNARE" : "KICK";

          const steps = document.createElement("div");
          steps.className = "steps";

          for (let i = 0; i < stepsPerBar; i++) {
            const s = document.createElement("div");
            s.className = "step";
            s.onclick = () => {
              pattern[inst][i] = !pattern[inst][i];
              s.classList.toggle("on", pattern[inst][i]);
            };
            steps.appendChild(s);
          }

          seqEl.appendChild(label);
          seqEl.appendChild(steps);
        });

        loopInfoEl.textContent = `${num}/${
          tsDenEl.value
        } • ${stepsPerBar} steps`;
      }

      function scheduler() {
        while (nextNoteTime < audioCtx!.currentTime + scheduleAheadSec) {
          if (pattern.hh[currentStep]) playHiHat(nextNoteTime);
          if (pattern.sn[currentStep]) playSnare(nextNoteTime);
          if (pattern.k[currentStep]) playKick(nextNoteTime);

          currentStep = (currentStep + 1) % stepsPerBar;
          nextNoteTime += secondsPerStep();
        }
      }

      async function start() {
        ensureAudio();
        await audioCtx!.resume();
        isPlaying = true;
        nextNoteTime = audioCtx!.currentTime + 0.05;
        timerId = setInterval(scheduler, lookaheadMs);
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusEl.textContent = "playing";
      }

      function stop() {
        isPlaying = false;
        clearInterval(timerId);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusEl.textContent = "stopped";
      }

      startBtn.onclick = start;
      stopBtn.onclick = stop;
      clearBtn.onclick = buildSequencer;
      presetBtn.onclick = buildSequencer;

      buildSequencer();
    })();
  }, []);

  return (
    <>
      <style>{`
        body { background:#000; color:#fff; font-family:system-ui; }
        .wrap { max-width:1100px; margin:0 auto; padding:18px; }
        h1 { font-size:20px; }
        .panel { border:1px solid #fff; border-radius:12px; padding:14px; margin-bottom:14px; }
        .row { display:flex; gap:12px; flex-wrap:wrap; }
        label { font-size:12px; }
        input, select, button { background:#000; color:#fff; border:1px solid #fff; }
        button { padding:8px 12px; cursor:pointer; }
        .grid { display:grid; grid-template-columns:110px 1fr; gap:10px; }
        .steps { display:grid; grid-auto-flow:column; gap:6px; }
        .step { width:28px; height:28px; border:1px solid #fff; cursor:pointer; }
        .step.on { background:#fff; }
      `}</style>

      <div className="wrap">
        <h1>Drum Machine</h1>

        <div className="panel row">
          <div>
            <label>BPM</label>
            <input id="bpm" type="number" defaultValue={110} />
          </div>
          <div>
            <label>Time Sig</label>
            <input id="tsNum" type="number" defaultValue={4} />
            <select id="tsDen">
              <option value="4">4</option>
              <option value="8">8</option>
            </select>
          </div>
          <div>
            <label>Subdivision</label>
            <select id="subdiv">
              <option value="4">16ths</option>
              <option value="2">8ths</option>
            </select>
          </div>
          <div>
            <button id="startBtn">Start</button>
            <button id="stopBtn" disabled>
              Stop
            </button>
            <button id="clearBtn">Clear</button>
            <button id="presetBtn">Preset</button>
            <div id="status">stopped</div>
          </div>
        </div>

        <div className="panel row">
          <div>
            <label>Hi-hat</label>
            <input id="hhVol" type="range" min="0" max="1" step="0.01" />
          </div>
          <div>
            <label>Snare</label>
            <input id="snVol" type="range" min="0" max="1" step="0.01" />
          </div>
          <div>
            <label>Kick</label>
            <input id="kVol" type="range" min="0" max="1" step="0.01" />
          </div>
          <div>
            <label>Master</label>
            <input id="master" type="range" min="0" max="1" step="0.01" />
          </div>
        </div>

        <div className="panel">
          <div id="sequencer" className="grid"></div>
          <div id="loopInfo"></div>
        </div>
      </div>
    </>
  );
}
