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

      const pattern: Record<"hh" | "sn" | "k", boolean[]> = {
        hh: [],
        sn: [],
        k: [],
      };

      let stepsPerBar = 16;

      // ---------- Elements ----------
      const bpmEl = document.getElementById("bpm") as HTMLInputElement;
      const tsNumEl = document.getElementById("tsNum") as HTMLInputElement;
      const tsDenEl = document.getElementById("tsDen") as HTMLSelectElement;
      const subdivEl = document.getElementById("subdiv") as HTMLSelectElement;

      const masterEl = document.getElementById("master") as HTMLInputElement;
      const hhVolEl = document.getElementById("hhVol") as HTMLInputElement;
      const snVolEl = document.getElementById("snVol") as HTMLInputElement;
      const kVolEl = document.getElementById("kVol") as HTMLInputElement;

      const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
      const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
      const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
      const presetBtn = document.getElementById("presetBtn") as HTMLButtonElement;

      const statusEl = document.getElementById("status")!;
      const seqEl = document.getElementById("sequencer")!;
      const loopInfoEl = document.getElementById("loopInfo")!;

      // ---------- Helpers ----------
      const clamp = (n: number, a: number, b: number) =>
        Math.max(a, Math.min(b, n));

      function calcStepsPerBar() {
        const num = clamp(+tsNumEl.value || 4, 1, 15);
        const subdiv = +subdivEl.value;
        return num * subdiv;
      }

      function secondsPerStep() {
        const bpm = clamp(+bpmEl.value || 110, 40, 240);
        const den = +tsDenEl.value;
        const subdiv = +subdivEl.value;
        const quarter = 60 / bpm;
        const beat = quarter * (4 / den);
        return beat / subdiv;
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
        const o = audioCtx!.createOscillator();
        const g = audioCtx!.createGain();
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
        const src = audioCtx!.createBufferSource();
        src.buffer = noiseBuffer();
        const hp = audioCtx!.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 900;
        const g = audioCtx!.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        src.connect(hp).connect(g).connect(snGain);
        src.start(t);
        src.stop(t + 0.16);
      }

      function playHiHat(t: number) {
        const src = audioCtx!.createBufferSource();
        src.buffer = noiseBuffer();
        const hp = audioCtx!.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        const g = audioCtx!.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        src.connect(hp).connect(g).connect(hhGain);
        src.start(t);
        src.stop(t + 0.08);
      }

      function buildSequencer() {
        stepsPerBar = calcStepsPerBar();
        ["hh", "sn", "k"].forEach((k) => {
          pattern[k as "hh"].length = stepsPerBar;
          pattern[k as "hh"].fill(false);
        });

        seqEl.innerHTML = "";

        ([
          ["hh", "HI-HAT"],
          ["sn", "SNARE"],
          ["k", "KICK"],
        ] as const).forEach(([key, label]) => {
          const labelEl = document.createElement("div");
          labelEl.className = "inst";
          labelEl.textContent = label;

          const steps = document.createElement("div");
          steps.className = "steps";

          for (let i = 0; i < stepsPerBar; i++) {
            const s = document.createElement("div");
            s.className = "step";
            s.onclick = () => {
              pattern[key][i] = !pattern[key][i];
              s.classList.toggle("on", pattern[key][i]);
            };
            steps.appendChild(s);
          }

          seqEl.appendChild(labelEl);
          seqEl.appendChild(steps);
        });

        loopInfoEl.textContent = `${tsNumEl.value}/${tsDenEl.value} • ${stepsPerBar} steps`;
      }

      // ---------- ROCK PRESET ----------
      function applyRockPreset() {
        bpmEl.value = "110";
        stepsPerBar = calcStepsPerBar();

        ["hh", "sn", "k"].forEach((k) => {
          pattern[k as "hh"].length = stepsPerBar;
          pattern[k as "hh"].fill(false);
        });

        const subdiv = +subdivEl.value;
        const beats = +tsNumEl.value;

        // Hi-hat on 8ths
        const hatInterval = subdiv >= 4 ? subdiv / 2 : 1;
        for (let i = 0; i < stepsPerBar; i += hatInterval) {
          pattern.hh[i] = true;
        }

        // Kick: beats 1 & 3
        pattern.k[0] = true;
        if (beats >= 3) pattern.k[2 * subdiv] = true;

        // Snare: beats 2 & 4
        if (beats >= 2) pattern.sn[subdiv] = true;
        if (beats >= 4) pattern.sn[3 * subdiv] = true;

        buildSequencer();

        // Re-apply visual state
        const rows = seqEl.querySelectorAll(".steps");
        ["hh", "sn", "k"].forEach((inst, rowIdx) => {
          const steps = rows[rowIdx].children;
          for (let i = 0; i < stepsPerBar; i++) {
            steps[i].classList.toggle("on", pattern[inst as "hh"][i]);
          }
        });
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
      presetBtn.onclick = applyRockPreset;

      applyRockPreset();
    })();
  }, []);

  return (
    <>
      <style>{`
        body { background:#000; color:#fff; font-family:system-ui; }
        .wrap { max-width:1200px; margin:0 auto; padding:20px; }
        h1 { margin-bottom:12px; }
        .panel { border:1px solid #fff; border-radius:14px; padding:16px; margin-bottom:16px; }
        .row { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
        label { font-size:12px; }
        input, select, button {
          background:#000; color:#fff; border:1px solid #fff;
          padding:6px 8px;
        }
        button { cursor:pointer; }
        .grid { display:grid; grid-template-columns:110px 1fr; gap:10px; }
        .inst { font-weight:700; }
        .steps { display:grid; grid-auto-flow:column; gap:6px; }
        .step { width:28px; height:28px; border:1px solid #fff; cursor:pointer; }
        .step.on { background:#fff; }
        .status { font-size:12px; margin-top:4px; }
      `}</style>

      <div className="wrap">
        <h1>Drum Machine</h1>

        <div className="panel row">
          <label>BPM <input id="bpm" type="number" defaultValue={110} /></label>
          <label>
            Time Sig <input id="tsNum" type="number" defaultValue={4} />
            <select id="tsDen">
              <option value="4">4</option>
              <option value="8">8</option>
            </select>
          </label>
          <label>
            Subdivision
            <select id="subdiv">
              <option value="4">16ths</option>
              <option value="2">8ths</option>
            </select>
          </label>
          <button id="startBtn">Start</button>
          <button id="stopBtn" disabled>Stop</button>
          <button id="clearBtn">Clear</button>
          <button id="presetBtn">Rock</button>
          <div id="status" className="status">stopped</div>
        </div>

        <div className="panel row">
          <label>Hi-hat <input id="hhVol" type="range" min="0" max="1" step="0.01" defaultValue="0.5" /></label>
          <label>Snare <input id="snVol" type="range" min="0" max="1" step="0.01" defaultValue="0.6" /></label>
          <label>Kick <input id="kVol" type="range" min="0" max="1" step="0.01" defaultValue="0.8" /></label>
          <label>Master <input id="master" type="range" min="0" max="1" step="0.01" defaultValue="0.9" /></label>
        </div>

        <div className="panel">
          <div id="sequencer" className="grid"></div>
          <div id="loopInfo" style={{ marginTop: 8 }} />
        </div>
      </div>
    </>
  );
}
