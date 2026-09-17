import { draw } from "./pose.js";
import { ANGLES, POSITIONS, LABELS, BILATERAL_ANGLES, evaluate, sampleValue, angleVariables, variableLabel } from "./experiment-math.js";
import { gaugeVariables, gaugeState } from "./gauge.js";
import { selectedPositionSegments, positionForSide } from "./position-connections.js";
import { lowPassSamples, estimatedNyquistHz } from "./wave-filter.js";
import { TargetEntryGate, BEEP_SOUNDS, unlockBeepAudio, playBeepTone } from "./target-beep.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const colors = ["#c9ff39", "#66e1ef", "#ff9c70"];
const DEFAULTS = { timing: "concurrent", type: "KP", amount: "detailed", camera: "on", gaugeDirection: "horizontal", skeletonWidth: 3, markerSize: 3, angleSide: "left", angleSides: ["left"], positionSide: "midpoint", connectPositions: false, waveLowPass: false, waveCutoffHz: 6, beepView: "side", beepSound: "clear", beepVolume: 80, angles: ["knee", "hip", "trunk"], positions: [], visuals: { numeric: true, skeleton: true, trajectory: false, waveform: false, gauge: false, target: false }, targets: Object.fromEntries([...ANGLES.map(key => [key, { enabled: key === "knee", beep: false, value: key === "knee" ? 90 : 30, tolerance: 5 }]), ...POSITIONS.flatMap(name => ["x", "y"].map(axis => [`${name}.${axis}`, { enabled: false, beep: false, value: .5, tolerance: .05 }]))]) };
const ANGLE_POINTS = { knee: [23, 25, 27], hip: [11, 23, 25], ankle: [25, 27, 31] };
const format = value => Number.isFinite(value) ? value.toFixed(1) : "—";
const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const size = bytes => bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export function createExperiment({ views, sourceState, onSettingsChange, beep = playBeepTone, unlockAudio = unlockBeepAudio }) {
  const settings = structuredClone(DEFAULTS);
  const live = { front: [], side: [] };
  const beepGate = new TargetEntryGate();
  let current = null, trials = [], nextId = 1, replayTrial = null, replayConfig = null, selectedTrialId = null, replayUrls = [], replayAnimation = 0, lastBeepAudioAt = -Infinity;
  const angleChecks = ANGLES.map(key => `<label><input type="checkbox" data-angle="${key}" ${settings.angles.includes(key) ? "checked" : ""}>${LABELS[key] || key}</label>`).join("");
  const positionChecks = POSITIONS.map(key => `<label><input type="checkbox" data-position="${key}">${LABELS[key] || key}</label>`).join("");
  const targetInputs = ANGLES.map(key => `<label><input type="checkbox" data-target-enabled="${key}" ${settings.targets[key].enabled ? "checked" : ""}>${LABELS[key] || key}<input type="number" data-target-value="${key}" value="${settings.targets[key].value}" aria-label="${key} target">±<input type="number" min="0" data-target-tolerance="${key}" value="5" aria-label="${key} tolerance">° <span class="beep-choice"><input type="checkbox" data-target-beep="${key}" aria-label="${key} beep">Beep</span></label>`).join("");
  const positionTargetInputs = POSITIONS.flatMap(name => ["x", "y"].map(axis => `<label data-position-target="${name}" hidden><input type="checkbox" data-target-enabled="${name}.${axis}">${LABELS[name] || name} ${axis.toUpperCase()}<input type="number" min="0" max="1" step="0.01" data-target-value="${name}.${axis}" value="0.5" aria-label="${name} ${axis} target">±<input type="number" min="0" max="1" step="0.01" data-target-tolerance="${name}.${axis}" value="0.05" aria-label="${name} ${axis} tolerance"></label>`)).join("");
  $(".workspace").insertAdjacentHTML("afterend", `<section class="experiment-panel" aria-label="Visual Biofeedback設定"><h2>FEEDBACK / 実験設定</h2><div class="camera-display-control"><span>LIVE CAMERA VIDEO</span><div class="experiment-tabs" data-group="camera"><button type="button" data-value="on" class="active">映像 ON</button><button type="button" data-value="off">映像 OFF</button></div><small>映像OFFでも選択したFBを表示し、カメラ入力・Pose推定・録画は継続します。Skeletonは独立して切り替えます。</small></div><div class="experiment-grid">
    <fieldset><legend>WHEN / Timing</legend><div class="experiment-tabs" data-group="timing"><button type="button" data-value="none">No BF</button><button type="button" data-value="concurrent" class="active">Concurrent</button><button type="button" data-value="terminal">Terminal</button></div></fieldset>
    <fieldset><legend>WHAT / Feedback Type</legend><div class="experiment-tabs" data-group="type"><button type="button" data-value="KR">KR / 結果</button><button type="button" data-value="KP" class="active">KP / 過程</button></div></fieldset>
    <fieldset><legend>HOW MUCH / Amount</legend><div class="experiment-tabs" data-group="amount"><button type="button" data-value="simple">Simple</button><button type="button" data-value="detailed" class="active">Detailed</button></div></fieldset>
  </div><details open><summary>Variables / 計測変数</summary><div class="experiment-grid"><fieldset><legend>ANGLES</legend>${angleChecks}<div class="angle-side-choices"><strong>SIDE</strong><label><input type="checkbox" data-angle-side="left" checked>Left</label><label><input type="checkbox" data-angle-side="right">Right</label></div><small>Trunk / Head–Neckは1系列（両側選択時はLeft）</small></fieldset><fieldset><legend>POSITIONS (normalized 0–1)</legend>${positionChecks}<div><label>位置の側 <select id="positionSide"><option value="midpoint">Midpoint</option><option value="left">Left</option><option value="right">Right</option></select></label></div><label><input type="checkbox" id="connectPositions">Connect selected positions</label><small>接続線は選択したSIDEごとに解剖学的な隣接点だけ結びます</small></fieldset><fieldset><legend>HOW / Visualization</legend>${["numeric", "skeleton", "trajectory", "waveform", "gauge", "target"].map(key => `<label><input type="checkbox" data-visual="${key}" ${settings.visuals[key] ? "checked" : ""}>${key}</label>`).join("")}<div class="wave-filter-control"><label><input type="checkbox" id="waveLowPass">Low-pass filter</label><label>Cutoff <input type="number" id="waveCutoffHz" min="0.1" max="15" step="0.1" value="6">Hz</label><small id="waveNyquist">推定Nyquist: 未計測（上限15 Hz）</small></div><label>Gauge direction <select id="gaugeDirection"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><div class="display-levels"><label>Skeleton line width <input type="range" min="1" max="5" step="1" value="3" data-level="skeletonWidth"><output data-level-output="skeletonWidth">3</output></label><label>Joint marker size <input type="range" min="1" max="5" step="1" value="3" data-level="markerSize"><output data-level-output="markerSize">3</output></label></div><small id="visualHint">TrajectoryはPosition選択時に利用可能</small></fieldset></div></details>
  <details><summary>Target / 仮説に基づく目標値</summary><div class="experiment-target-grid">${targetInputs}</div><div class="beep-controls"><label>Beep source <select id="beepView"><option value="side">Side View</option><option value="front">Front View</option></select></label><label>Beep sound <select id="beepSound">${BEEP_SOUNDS.map(sound => `<option value="${sound.id}" ${sound.id === settings.beepSound ? "selected" : ""}>${sound.label}</option>`).join("")}</select></label><label>Volume <input type="range" id="beepVolume" min="20" max="100" step="10" value="80"><output id="beepVolumeOutput">80%</output></label><button type="button" id="testBeep">Test Beep ♪</button><small id="beepStatus">BeepはTargetへの進入時に1回。音声は操作後に有効化します。</small></div><div class="experiment-target-grid position-targets">${positionTargetInputs}</div><small>Gaugeは現在値と設定した目標±許容幅を表示します。Positionの目標は画像内の正規化座標0–1です。固定の「正解」ではありません。</small></details></section>`);
  $(".remote-record").insertAdjacentHTML("afterend", `<section class="trial-panel"><div class="trial-head"><h2>TRIALS / REPLAY</h2><small id="trialStorage">0 Trial · 0 KB / 500 MB</small></div><div id="trialHistory" class="trial-history">まだTrialはありません</div><p id="trialSummary" class="trial-summary">録画開始〜停止が1 Trialです。データはこのブラウザのメモリに保持され、ページを閉じると消去されます。</p><div class="trial-actions"><button id="exportTrial" type="button" disabled>選択Trial CSV</button><button id="exportAllTrials" type="button" disabled>全Trial CSV</button><button id="deleteAllTrials" type="button" disabled>全Trialを削除</button></div></section>`);
  document.body.insertAdjacentHTML("beforeend", `<section id="experimentReplay" class="replay-modal" role="dialog" aria-label="Trial Replay" hidden><div class="replay-head"><h2 id="replayTitle">Trial Replay</h2><button id="closeExperimentReplay" type="button">閉じる ×</button></div><div class="replay-options">${["video", "skeleton", "trajectory", "numeric", "waveform", "target"].map(key => `<label><input type="checkbox" data-replay-option="${key}" ${["video", "skeleton", "numeric", "waveform", "target"].includes(key) ? "checked" : ""}>${key}</label>`).join("")}</div><details><summary>Replay変数を選択</summary><div class="replay-options">${ANGLES.map(key => `<label><input type="checkbox" data-replay-angle="${key}">${LABELS[key] || key}</label>`).join("")}${POSITIONS.map(key => `<label><input type="checkbox" data-replay-position="${key}">${LABELS[key] || key} position</label>`).join("")}</div></details><div class="replay-grid">${["front", "side"].map(name => `<div class="replay-view" data-replay-view="${name}"><strong>${name.toUpperCase()}</strong><div class="replay-viewport"><video playsinline muted></video><canvas></canvas></div><div class="replay-values"></div></div>`).join("")}</div><div class="replay-controls"><button id="replayPlay" type="button">▶ Play</button><input id="replaySeek" type="range" min="0" max="1000" value="0" aria-label="Replay Seek"><span id="replayTime">0.0 s</span><label>Speed <select id="replaySpeed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label></div><div class="replay-wave"><canvas data-replay-wave="front"></canvas><canvas data-replay-wave="side"></canvas></div></section>`);
  for (const view of Object.values(views)) {
    $(".viewport", view.root).insertAdjacentHTML("beforeend", '<div class="experiment-target" hidden></div>');
    $(".viewport", view.root).insertAdjacentHTML("afterend", `<div class="experiment-wave" hidden><small>${view.root.dataset.view.toUpperCase()} / Time-series</small><canvas data-wave="${view.root.dataset.view}"></canvas></div>`);
    $(".experiment-wave", view.root).insertAdjacentHTML("beforebegin", '<div class="experiment-gauges" hidden></div>');
    $(".metrics", view.root).insertAdjacentHTML("afterend", '<div class="experiment-values"></div>');
  }

  function liveVisible() { return settings.timing === "concurrent"; }
  function chosenVariables() {
    return [...angleVariables(settings), ...settings.positions.flatMap(name => [`${name}.x`, `${name}.y`])];
  }
  function angleTargetKey(key) { return key.startsWith("left.") || key.startsWith("right.") ? key.split(".")[1] : key; }
  function updateCutoffLimit() {
    const active = Object.values(live).filter(samples => samples.length >= 4 && performance.now() - samples.at(-1).liveTime < 2000);
    const limit = active.length ? Math.min(...active.map(estimatedNyquistHz)) : 15;
    const input = $("#waveCutoffHz"); input.max = String(limit);
    if (settings.waveCutoffHz > limit) { settings.waveCutoffHz = limit; input.value = String(limit); }
    $("#waveNyquist").textContent = active.length ? `推定Nyquistの95%: ${limit.toFixed(1)} Hz` : "推定Nyquist: 未計測（上限15 Hz）";
  }
  function snapshot() { return structuredClone(settings); }
  function refreshSettings() {
    $$("[data-group]").forEach(group => $$('button', group).forEach(button => button.classList.toggle("active", settings[group.dataset.group] === button.dataset.value)));
    const positionAvailable = settings.positions.length > 0;
    const trajectory = $('[data-visual="trajectory"]'); trajectory.disabled = !positionAvailable;
    if (!positionAvailable) { trajectory.checked = false; settings.visuals.trajectory = false; }
    const target = $('[data-visual="target"]'); target.disabled = !settings.angles.length;
    if (!settings.angles.length) { target.checked = false; settings.visuals.target = false; }
    $("#visualHint").textContent = `Trajectory: ${positionAvailable ? "選択したPosition" : "Positionを選択してください"} / Waveform: 選択系列を表示`;
    $$(".experiment-wave").forEach(root => root.hidden = !(liveVisible() && settings.type === "KP" && settings.visuals.waveform && settings.amount === "detailed" && chosenVariables().length));
    $$('[data-position-target]').forEach(row => row.hidden = !settings.positions.includes(row.dataset.positionTarget));
    updateCutoffLimit();
    Object.values(views).forEach(view => {
      view.root.classList.toggle("feedback-suppressed", !liveVisible());
      view.root.classList.toggle("camera-video-off", settings.camera === "off");
      decorate(view, sourceState(view.source));
    });
    drawLiveWaves(); onSettingsChange({ visible: liveVisible(), settings: snapshot() });
  }
  $(".experiment-panel").addEventListener("click", event => {
    const button = event.target.closest("[data-group] button"); if (!button) return;
    settings[button.parentElement.dataset.group] = button.dataset.value; refreshSettings();
  });
  $(".experiment-panel").addEventListener("change", event => {
    const el = event.target;
    if (el.dataset.angle) settings.angles = $$('[data-angle]:checked').map(input => input.dataset.angle);
    if (el.dataset.angleSide) {
      const selected = $$('[data-angle-side]:checked').map(input => input.dataset.angleSide);
      if (!selected.length) { el.checked = true; return; }
      settings.angleSides = selected; settings.angleSide = selected[0]; beepGate.reset();
    }
    if (el.dataset.position) settings.positions = $$('[data-position]:checked').map(input => input.dataset.position);
    if (el.dataset.visual) settings.visuals[el.dataset.visual] = el.checked;
    if (el.id === "connectPositions") settings.connectPositions = el.checked;
    if (el.id === "waveLowPass") settings.waveLowPass = el.checked;
    if (el.id === "waveCutoffHz") { settings.waveCutoffHz = Math.max(.1, Math.min(+el.max || 15, +el.value || 6)); el.value = String(settings.waveCutoffHz); }
    if (el.id === "beepView") { settings.beepView = el.value; beepGate.reset(); }
    if (el.id === "beepSound") settings.beepSound = el.value;
    if (["angleSide", "positionSide", "gaugeDirection"].includes(el.id)) settings[el.id] = el.value;
    if (el.dataset.targetEnabled) settings.targets[el.dataset.targetEnabled].enabled = el.checked;
    if (el.dataset.targetValue) settings.targets[el.dataset.targetValue].value = +el.value;
    if (el.dataset.targetTolerance) settings.targets[el.dataset.targetTolerance].tolerance = Math.max(0, +el.value);
    if (el.dataset.targetBeep) {
      settings.targets[el.dataset.targetBeep].beep = el.checked;
      if (el.checked) unlockAudio().then(() => $("#beepStatus").textContent = "音声の準備ができました").catch(error => $("#beepStatus").textContent = error.message);
    }
    if (el.dataset.targetEnabled || el.dataset.targetValue || el.dataset.targetTolerance || el.dataset.targetBeep) beepGate.reset();
    refreshSettings();
  });
  $("#testBeep").addEventListener("click", async () => {
    try { await unlockAudio(); if (beep(settings.beepSound, settings.beepVolume / 100) === false) throw new Error("音声出力を開始できませんでした"); $("#beepStatus").textContent = `${BEEP_SOUNDS.find(sound => sound.id === settings.beepSound)?.label}を再生しました`; }
    catch (error) { $("#beepStatus").textContent = error.message; }
  });
  $("#beepVolume").addEventListener("input", event => {
    settings.beepVolume = +event.target.value;
    $("#beepVolumeOutput").value = `${settings.beepVolume}%`;
    onSettingsChange({ visible: liveVisible(), settings: snapshot() });
  });
  $(".experiment-panel").addEventListener("input", event => {
    const key = event.target.dataset.level;
    if (!key) return;
    settings[key] = +event.target.value;
    $(`[data-level-output="${key}"]`).value = event.target.value;
    refreshSettings();
  });

  function sample(source, landmarks) {
    if (!landmarks) return;
    const now = performance.now();
    for (const [name, view] of Object.entries(views)) {
      if (view.source !== source) continue;
      const video = view.video, track = sourceState(source).stream?.getVideoTracks()?.[0], dimensions = track?.getSettings?.();
      const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : dimensions?.width && dimensions?.height ? dimensions.width / dimensions.height : 1;
      const values = evaluate(landmarks, settings.angleSide, settings.positionSide, aspect);
      if (!values) continue;
      const entry = { t: current ? Math.max(0, now - current.start) : now, ...values,
        landmarks: landmarks.map(point => ({ x: +point.x.toFixed(5), y: +point.y.toFixed(5), z: +(point.z || 0).toFixed(5), visibility: +(point.visibility ?? 1).toFixed(3) })) };
      live[name].push({ ...entry, liveTime: now });
      while (live[name].length > 300 || live[name][0]?.liveTime < now - 10000) live[name].shift();
      if (current) current.samples[name].push(entry);
      if (name === settings.beepView && liveVisible()) for (const key of angleVariables(settings)) {
        const target = settings.targets[angleTargetKey(key)];
        if (beepGate.update(key, sampleValue(entry, key), target, now) && now - lastBeepAudioAt >= 120) { beep(settings.beepSound, settings.beepVolume / 100); lastBeepAudioAt = now; }
      }
    }
    updateCutoffLimit();
    drawLiveWaves();
  }
  function targetResults(entry, config = settings) {
    if (!entry) return [];
    return angleVariables(config).filter(key => config.targets[angleTargetKey(key)]?.enabled).map(key => {
      const target = config.targets[angleTargetKey(key)], value = sampleValue(entry, key), diff = Number.isFinite(value) ? value - target.value : NaN;
      return { key, value, target: target.value, tolerance: target.tolerance, diff, inside: Number.isFinite(diff) && Math.abs(diff) <= target.tolerance };
    });
  }
  function drawTrail(ctx, samples, t, config = settings) {
    config.positions.slice(0, 3).forEach((key, index) => {
      const points = samples.filter(point => t - point.t <= 3000 && t >= point.t).map(point => point.positions[key]).filter(Boolean);
      if (points.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = colors[index]; ctx.lineWidth = Math.max(2, ctx.canvas.width / 300);
      points.forEach((point, i) => i ? ctx.lineTo(point.x * ctx.canvas.width, point.y * ctx.canvas.height) : ctx.moveTo(point.x * ctx.canvas.width, point.y * ctx.canvas.height)); ctx.stroke();
    });
  }
  function drawSelectedVariables(ctx, entry, view) {
    if (!entry) return;
    const p = entry.landmarks, width = ctx.canvas.width, height = ctx.canvas.height;
    const point = index => ({ x: p[index].x * width, y: p[index].y * height });
    const label = (text, x, y, color) => {
      ctx.save(); ctx.font = `${Math.max(16, width / 75)}px sans-serif`; ctx.textBaseline = "middle";
      const padding = 5, textWidth = ctx.measureText(text).width;
      ctx.fillStyle = "#0b0d0fdb"; ctx.fillRect(x - padding, y - 12, textWidth + padding * 2, 24);
      ctx.fillStyle = color;
      if (view.source === "pc") { ctx.translate(x + textWidth, 0); ctx.scale(-1, 1); ctx.fillText(text, 0, y); }
      else ctx.fillText(text, x, y);
      ctx.restore();
    };
    angleVariables(settings).forEach((key, index) => {
      const side = key.startsWith("right.") ? "right" : key.startsWith("left.") ? "left" : settings.angleSide;
      const angleKey = angleTargetKey(key), offset = side === "right" ? 1 : 0;
      const color = colors[index % colors.length], joints = ANGLE_POINTS[angleKey]?.map(id => point(id + offset));
      let first, pivot, last;
      if (joints) [first, pivot, last] = joints;
      else {
        const shoulder = point(11 + offset), end = angleKey === "headNeck" ? point(7 + offset) : shoulder;
        pivot = angleKey === "headNeck" ? shoulder : point(23 + offset);
        first = { x: pivot.x, y: end.y }; last = end;
      }
      ctx.save(); ctx.lineWidth = Math.max(3, width / 350); ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(pivot.x, pivot.y); ctx.lineTo(last.x, last.y); ctx.stroke();
      const a = Math.atan2(first.y - pivot.y, first.x - pivot.x), b = Math.atan2(last.y - pivot.y, last.x - pivot.x);
      const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      ctx.beginPath(); ctx.arc(pivot.x, pivot.y, Math.max(22, width / 30), a, a + delta, delta < 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(pivot.x, pivot.y, Math.max(5, width / 180), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (settings.visuals.numeric) label(`${variableLabel(key)} ${format(sampleValue(entry, key))}°`, pivot.x + 14, pivot.y - 20 - index * 4, color);
    });
    const sides = settings.connectPositions ? settings.angleSides : [settings.positionSide];
    if (settings.connectPositions) for (const { side, a, b } of selectedPositionSegments(settings.positions, sides)) {
      const start = positionForSide(p, a, side), end = positionForSide(p, b, side);
      if (!start || !end) continue;
      ctx.save(); ctx.strokeStyle = side === "left" ? "#66e1ef" : "#ff9c70"; ctx.lineWidth = Math.max(4, width / 220); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(start.x * width, start.y * height); ctx.lineTo(end.x * width, end.y * height); ctx.stroke(); ctx.restore();
    }
    sides.forEach((side, sideIndex) => settings.positions.forEach((key, index) => {
      const position = settings.connectPositions ? positionForSide(p, key, side) : entry.positions[key]; if (!position) return;
      const x = position.x * width, y = position.y * height, color = settings.connectPositions ? side === "left" ? "#66e1ef" : "#ff9c70" : colors[(index + 1) % colors.length];
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, width / 350);
      ctx.beginPath(); ctx.arc(x, y, Math.max(9, width / 110), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15); ctx.stroke(); ctx.restore();
      if (settings.visuals.numeric) label(`${settings.connectPositions ? side === "left" ? "Left " : "Right " : ""}${LABELS[key] || key} X${format(position.x)} Y${format(position.y)}`, x + 18, y + 18 + sideIndex * 3, color);
    }));
  }
  function renderGauges(view, entry) {
    const root = $(".experiment-gauges", view.root);
    const variables = gaugeVariables(settings);
    root.hidden = !(liveVisible() && settings.type === "KP" && settings.visuals.gauge && variables.length);
    if (root.hidden) return;
    root.dataset.direction = settings.gaugeDirection;
    const signature = variables.join("|");
    if (root.dataset.variables !== signature) {
      root.dataset.variables = signature;
      root.replaceChildren();
      for (const key of variables) {
        const card = document.createElement("div"); card.className = "gauge-card"; card.dataset.key = key;
        card.innerHTML = '<div class="gauge-heading"><strong></strong><span class="gauge-value"></span></div><div class="gauge-track" role="meter"><div class="gauge-fill"></div><div class="gauge-band"></div><div class="gauge-target"></div><div class="gauge-thumb"></div></div><div class="gauge-caption"><span class="gauge-status"></span><span class="gauge-goal"></span></div>';
        root.append(card);
      }
    }
    for (const card of $$(".gauge-card", root)) {
      const key = card.dataset.key, gauge = gaugeState(entry, key, settings.targets[angleTargetKey(key)]);
      $(".gauge-heading strong", card).textContent = gauge.label;
      $(".gauge-value", card).textContent = settings.visuals.numeric && gauge.valid ? `${format(gauge.value)}${gauge.unit}` : "";
      const track = $(".gauge-track", card);
      track.style.setProperty("--current", `${gauge.currentPercent}%`);
      track.style.setProperty("--target", `${gauge.targetPercent}%`);
      track.style.setProperty("--band-start", `${gauge.bandStart}%`);
      track.style.setProperty("--band-size", `${gauge.bandEnd - gauge.bandStart}%`);
      track.setAttribute("aria-label", `${gauge.label} ${gauge.valid ? format(gauge.value) + gauge.unit : "未検出"}`);
      track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", String(gauge.max));
      if (gauge.valid) track.setAttribute("aria-valuenow", String(gauge.value)); else track.removeAttribute("aria-valuenow");
      card.classList.toggle("has-target", gauge.targetEnabled);
      card.classList.toggle("inside", gauge.inside);
      card.classList.toggle("no-value", !gauge.valid);
      $(".gauge-status", card).textContent = !gauge.valid ? "Pose待ち" : !gauge.targetEnabled ? "目標未設定" : gauge.inside ? "目標範囲内" : gauge.value < gauge.targetValue - gauge.tolerance ? "目標より低い" : "目標より高い";
      $(".gauge-goal", card).textContent = gauge.targetEnabled ? settings.visuals.numeric ? `Target ${format(gauge.targetValue)}±${format(gauge.tolerance)}${gauge.unit}` : "Target zone" : "";
    }
  }
  function decorate(view, state) {
    const canvas = view.canvas, ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const recent = live[view.root.dataset.view], entry = recent.at(-1), points = state.landmarks || entry?.landmarks;
    if (entry) for (const key of ["knee", "hip", "trunk"]) {
      const number = entry.angles[key], metric = $(`[data-metric="${key}"]`, view.root), bar = $(`[data-bar="${key}"]`, view.root);
      metric.innerHTML = `${format(number)}<small>°</small>`;
      bar.style.width = `${Math.max(0, Math.min(100, key === "trunk" ? number * 2 : number / 1.8))}%`;
    }
    const display = liveVisible(), detailed = settings.amount === "detailed", kp = settings.type === "KP";
    renderGauges(view, entry);
    if (display && settings.visuals.skeleton && points) draw(canvas, points, { lineLevel: settings.skeletonWidth, markerLevel: settings.markerSize });
    if (display && kp && entry) drawSelectedVariables(ctx, entry, view);
    if (display && kp && detailed && settings.visuals.trajectory && entry) drawTrail(ctx, recent, entry.t);
    const values = $(".experiment-values", view.root), target = $(".experiment-target", view.root);
    values.hidden = !(display && kp && detailed && settings.visuals.numeric);
    values.textContent = entry && !values.hidden ? [
      ...angleVariables(settings).map(key => `${variableLabel(key)}: ${format(sampleValue(entry, key))}°`),
      ...settings.positions.map(key => `${LABELS[key] || key}: X ${format(entry.positions[key]?.x)} / Y ${format(entry.positions[key]?.y)}`)
    ].join("   ·   ") : "";
    const smooth = entry && recent.length >= 3 ? { ...entry, angles: Object.fromEntries(ANGLES.map(key => [key, +(recent.slice(-3).reduce((sum, point) => sum + (point.angles[key] ?? 0), 0) / 3).toFixed(1)])) } : entry;
    const results = targetResults(smooth);
    target.hidden = !(display && settings.visuals.target && results.length);
    target.classList.toggle("outside", results.some(result => !result.inside));
    target.textContent = target.hidden ? "" : settings.amount === "simple" || settings.type === "KR"
      ? results.map(result => `${variableLabel(result.key)}: ${result.inside ? "Target内" : result.diff > 0 ? "高い" : "低い"}`).join(" / ")
      : results.map(result => `${variableLabel(result.key)} ${format(result.value)}° / ${result.target}±${result.tolerance}° (Δ${result.diff >= 0 ? "+" : ""}${format(result.diff)}°)`).join("  ·  ");
    for (const key of ["knee", "hip", "trunk"]) {
      const bar = $(`[data-bar="${key}"]`, view.root)?.parentElement, targetConfig = settings.targets[key];
      if (!bar) continue;
      if (display && settings.visuals.target && targetConfig.enabled) {
        const scale = key === "trunk" ? 50 : 180;
        const lower = Math.max(0, Math.min(100, (targetConfig.value - targetConfig.tolerance) / scale * 100));
        const upper = Math.max(0, Math.min(100, (targetConfig.value + targetConfig.tolerance) / scale * 100));
        bar.style.background = `linear-gradient(to right,#303537 ${lower}%,#66852e ${lower}%,#66852e ${upper}%,#303537 ${upper}%)`;
      } else bar.style.background = "";
    }
    $(".metrics", view.root).style.visibility = display && kp && settings.visuals.numeric && detailed ? "visible" : "hidden";
    for (const key of ["knee", "hip", "trunk"]) {
      const metric = $(`[data-metric="${key}"]`, view.root).closest(".metric");
      if (metric) metric.hidden = !settings.angles.includes(key);
    }
  }

  function wave(canvas, samples, config, cursor = null) {
    const width = canvas.clientWidth || 400, height = canvas.clientHeight || 150, dpr = devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr); ctx.fillStyle = "#0b0d0f"; ctx.fillRect(0, 0, width, height);
    const variables = [...angleVariables(config), ...config.positions.flatMap(name => [`${name}.x`, `${name}.y`])];
    if (!samples.length || !variables.length) return;
    const raw = samples.map(sample => ({ t: sample.t, values: Object.fromEntries(variables.map(key => [key, sampleValue(sample, key)])) }));
    const displayed = config.waveLowPass ? lowPassSamples(raw, variables, config.waveCutoffHz) : raw;
    const duration = Math.max(1, samples.at(-1).t - samples[0].t), start = samples[0].t;
    const all = displayed.flatMap(sample => variables.map(key => sample.values[key])).filter(Number.isFinite);
    if (!all.length) return;
    let low = Math.min(...all), high = Math.max(...all); if (high === low) { low--; high++; }
    const toY = value => height - 14 - (value - low) / (high - low) * (height - 28);
    variables.forEach((key, index) => {
      const target = config.targets[angleTargetKey(key)];
      if (config.visuals.target && target?.enabled) {
        ctx.fillStyle = "#c9ff3920"; const top = toY(target.value + target.tolerance), bottom = toY(target.value - target.tolerance);
        ctx.fillRect(0, top, width, bottom - top); ctx.strokeStyle = "#c9ff3970"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, toY(target.value)); ctx.lineTo(width, toY(target.value)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = colors[index % colors.length]; ctx.lineWidth = 2; ctx.beginPath(); let first = true;
      for (const sample of displayed) { const value = sample.values[key]; if (!Number.isFinite(value)) continue; const x = (sample.t - start) / duration * width; first ? ctx.moveTo(x, toY(value)) : ctx.lineTo(x, toY(value)); first = false; }
      ctx.stroke(); ctx.fillStyle = colors[index % colors.length]; ctx.font = "10px sans-serif"; ctx.fillText(variableLabel(key), 8, 13 + index * 12);
    });
    if (cursor !== null) { ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(Math.max(0, Math.min(width, (cursor - start) / duration * width)), 0); ctx.lineTo(Math.max(0, Math.min(width, (cursor - start) / duration * width)), height); ctx.stroke(); }
  }
  function drawLiveWaves() {
    if ($(".experiment-wave").hidden) return;
    for (const name of ["front", "side"]) wave($(`[data-wave="${name}"]`), live[name], settings);
  }
  function beginTrial() {
    live.front = []; live.side = [];
    beepGate.reset();
    current = { id: nextId++, timestamp: new Date().toISOString(), start: performance.now(), settings: snapshot(), sources: { front: views.front.source, side: views.side.source }, samples: { front: [], side: [] } };
    $("#trialSummary").textContent = `Trial ${String(current.id).padStart(2, "0")} 計測中。${settings.timing === "terminal" ? "終了後にFeedbackを提示します。" : ""}`;
    $(".experiment-panel").inert = true;
    refreshSettings();
  }
  function representative(samples) {
    if (!samples.length) return null;
    return samples.reduce((best, sample) => (sample.angles.knee ?? Infinity) < (best.angles.knee ?? Infinity) ? sample : best, samples[0]);
  }
  function summary(trial) {
    const duration = (trial.duration / 1000).toFixed(1);
    const results = Object.entries(trial.samples).map(([name, samples]) => {
      const entry = representative(samples), targets = targetResults(entry, trial.settings);
      return `${name.toUpperCase()}: ${entry ? `最深部 Knee ${format(entry.angles.knee)}°` : "Pose未検出"}${targets.length ? ` / ${targets.map(target => `${variableLabel(target.key)} ${target.inside ? "Target内" : "Target外"} (Δ${format(target.diff)}°)`).join(" · ")}` : ""}`;
    });
    return `Trial ${String(trial.id).padStart(2, "0")} · ${duration} s · ${results.join(" | ")}`;
  }
  function trialBytes(trial) {
    return Object.values(trial.blobs).reduce((total, blob) => total + (blob?.size || 0), 0) + JSON.stringify(trial.samples).length * 2;
  }
  function removeTrial(id) {
    const target = trials.find(trial => trial.id === id); if (!target) return;
    if (replayTrial?.id === id) closeReplay();
    trials = trials.filter(trial => trial.id !== id);
    if (selectedTrialId === id) selectedTrialId = trials.at(-1)?.id || null;
    renderHistory();
  }
  function endTrial(blobs) {
    if (!current) return;
    const trial = { ...current, duration: performance.now() - current.start, blobs: { front: blobs.front || null, side: blobs.side || null } };
    delete trial.start; current = null; trials.push(trial); selectedTrialId = trial.id;
    $(".experiment-panel").inert = false;
    while (trials.length > 10 || (trials.length > 1 && trials.reduce((total, item) => total + trialBytes(item), 0) > 500 * 1048576)) removeTrial(trials[0].id);
    renderHistory();
    $("#trialSummary").textContent = settings.timing === "none" ? "No BF: 計測・記録は完了しました。Feedbackを見るにはTimingを切り替えてください。" : summary(trial);
    if (trialBytes(trial) > 500 * 1048576) $("#trialSummary").textContent += " · このTrialだけで500 MBを超えています。ダウンロード後に削除してください。";
    if (settings.timing === "terminal") openReplay(trial.id);
    live.front = []; live.side = [];
    refreshSettings();
  }
  function renderHistory() {
    const root = $("#trialHistory"); root.replaceChildren();
    if (!trials.length) root.textContent = "まだTrialはありません";
    for (const trial of trials) {
      const item = document.createElement("div"); item.className = "trial-item";
      const button = document.createElement("button"); button.type = "button"; button.classList.toggle("active", trial.id === selectedTrialId); button.textContent = `Trial ${String(trial.id).padStart(2, "0")}${trial === trials.at(-1) ? " ← Latest" : ""}`;
      button.addEventListener("click", () => openReplay(trial.id)); item.append(button);
      for (const name of ["front", "side"]) if (trial.blobs[name]) {
        const save = document.createElement("button"); save.type = "button"; save.textContent = `${name === "front" ? "Front" : "Side"} video ↓`;
        save.addEventListener("click", () => download(trial.blobs[name], `vbf_trial_${trial.id}_${name}.${trial.blobs[name].type.includes("mp4") ? "mp4" : "webm"}`)); item.append(save);
      }
      const del = document.createElement("button"); del.type = "button"; del.className = "delete-trial"; del.textContent = "×"; del.setAttribute("aria-label", `Trial ${trial.id}を削除`);
      del.addEventListener("click", () => { if (confirm(`Trial ${trial.id}を削除しますか？`)) removeTrial(trial.id); }); item.append(del); root.append(item);
    }
    $("#trialStorage").textContent = `${trials.length} Trial · ${size(trials.reduce((total, trial) => total + trialBytes(trial), 0))} / 500 MB (memory)`;
    for (const id of ["exportTrial", "exportAllTrials", "deleteAllTrials"]) $("#" + id).disabled = !trials.length;
  }
  function csvRows(trial) {
    const rows = [];
    for (const view of ["front", "side"]) for (const sample of trial.samples[view]) {
      rows.push({ trial_id: trial.id, timestamp: trial.timestamp, view, source: trial.sources[view], time_ms: Math.round(sample.t),
        ...Object.fromEntries(ANGLES.map(key => [key, sample.angles[key]])),
        ...Object.fromEntries(["left", "right"].flatMap(side => BILATERAL_ANGLES.map(key => [`${side}_${key}`, sample.anglesBySide?.[side]?.[key]]))),
        ...Object.fromEntries(POSITIONS.flatMap(key => [[`${key}_x`, sample.positions[key]?.x], [`${key}_y`, sample.positions[key]?.y]])),
        angle_side: trial.settings.angleSide, angle_sides: trial.settings.angleSides || [trial.settings.angleSide], position_side: trial.settings.positionSide,
        connect_positions: trial.settings.connectPositions, wave_low_pass: trial.settings.waveLowPass, wave_cutoff_hz: trial.settings.waveCutoffHz, beep_view: trial.settings.beepView, beep_sound: trial.settings.beepSound, beep_volume: trial.settings.beepVolume,
        feedback_timing: trial.settings.timing, feedback_type: trial.settings.type, feedback_amount: trial.settings.amount,
        selected_angles: trial.settings.angles, selected_positions: trial.settings.positions, visualizations: trial.settings.visuals,
        targets: trial.settings.targets, landmarks: sample.landmarks });
    }
    return rows;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function exportCsv(selected) {
    const rows = (selected ? [selected] : trials).flatMap(csvRows);
    if (!rows.length) { $("#trialSummary").textContent = "Pose sampleがないためCSVは空です。"; return; }
    const fields = Object.keys(rows[0]);
    const content = [fields.join(","), ...rows.map(row => fields.map(field => csvCell(typeof row[field] === "object" ? JSON.stringify(row[field]) : row[field])).join(","))].join("\r\n");
    download(new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }), selected ? `vbf_trial_${selected.id}.csv` : "vbf_all_trials.csv");
  }
  $("#exportTrial").addEventListener("click", () => exportCsv(trials.find(trial => trial.id === selectedTrialId) || trials.at(-1)));
  $("#exportAllTrials").addEventListener("click", () => exportCsv(null));
  $("#deleteAllTrials").addEventListener("click", () => {
    if (!confirm("全Trialの録画と計測データをこのブラウザから削除しますか？")) return;
    closeReplay(); trials = []; selectedTrialId = null; renderHistory(); $("#trialSummary").textContent = "全Trialを削除しました。";
  });

  function nearest(samples, time) {
    if (!samples.length) return null;
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].t < time) lo = mid + 1; else hi = mid; }
    return lo && Math.abs(samples[lo - 1].t - time) < Math.abs(samples[lo].t - time) ? samples[lo - 1] : samples[lo];
  }
  function replayOptions() { return Object.fromEntries($$("[data-replay-option]").map(input => [input.dataset.replayOption, input.checked])); }
  function renderReplay(time) {
    if (!replayTrial) return;
    const options = replayOptions();
    for (const name of ["front", "side"]) {
      const root = $(`[data-replay-view="${name}"]`), video = $("video", root), canvas = $("canvas", root), viewport = $(".replay-viewport", root);
      const sample = nearest(replayTrial.samples[name], time), ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
      viewport.classList.toggle("skeleton-only", !options.video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sample && options.skeleton) draw(canvas, sample.landmarks, { lineLevel: replayConfig.skeletonWidth, markerLevel: replayConfig.markerSize });
      if (sample && options.trajectory) drawTrail(ctx, replayTrial.samples[name], time, replayConfig);
      const results = options.target ? targetResults(sample, replayConfig) : [];
      $(".replay-values", root).textContent = sample && options.numeric
        ? [...angleVariables(replayConfig).map(key => `${variableLabel(key)} ${format(sampleValue(sample, key))}°`), ...replayConfig.positions.map(key => `${key} X${format(sample.positions[key]?.x)} Y${format(sample.positions[key]?.y)}`), ...results.map(result => `${variableLabel(result.key)} Δ${format(result.diff)}° ${result.inside ? "Target内" : "Target外"}`)].join(" · ") : "";
      const waveCanvas = $(`[data-replay-wave="${name}"]`); waveCanvas.hidden = !options.waveform;
      if (options.waveform) wave(waveCanvas, replayTrial.samples[name], { ...replayConfig, visuals: { ...replayConfig.visuals, target: options.target } }, time);
    }
    $("#replaySeek").value = Math.round(time / Math.max(1, replayTrial.duration) * 1000);
    $("#replayTime").textContent = `${(time / 1000).toFixed(1)} s`;
  }
  function replayTick() {
    if (!replayTrial) return;
    const front = $('[data-replay-view="front"] video'), side = $('[data-replay-view="side"] video');
    const frontReady = !!front.getAttribute("src"), sideReady = !!side.getAttribute("src");
    if (frontReady || sideReady) {
      const primary = frontReady ? front : side, time = Math.min(replayTrial.duration, (primary.currentTime || 0) * 1000);
      if (frontReady && sideReady && Math.abs(front.currentTime - side.currentTime) > .15) side.currentTime = front.currentTime;
      renderReplay(time);
    }
    replayAnimation = requestAnimationFrame(replayTick);
  }
  function openReplay(id) {
    const trial = trials.find(item => item.id === id); if (!trial) return;
    closeReplay(); replayTrial = trial; replayConfig = structuredClone(trial.settings); selectedTrialId = id; renderHistory(); $("#experimentReplay").hidden = false;
    $$("[data-replay-angle]").forEach(input => input.checked = replayConfig.angles.includes(input.dataset.replayAngle));
    $$("[data-replay-position]").forEach(input => input.checked = replayConfig.positions.includes(input.dataset.replayPosition));
    $("#replayTitle").textContent = `Trial ${String(id).padStart(2, "0")} / ${trial.timestamp}`;
    $("#trialSummary").textContent = settings.timing === "none" ? "No BF: Trialを記録しました。Feedbackの閲覧はTimingを切り替えてください。" : summary(trial);
    $$("[data-replay-option]").forEach(input => input.checked = trial.settings.timing === "none" ? input.dataset.replayOption === "video" : ["video", "skeleton", "numeric", "waveform", "target"].includes(input.dataset.replayOption));
    for (const name of ["front", "side"]) {
      const root = $(`[data-replay-view="${name}"]`), video = $("video", root), blob = trial.blobs[name];
      root.dataset.pc = trial.sources[name] === "pc" ? "true" : "false";
      video.src = blob ? URL.createObjectURL(blob) : "";
      if (blob) replayUrls.push(video.src);
      video.playbackRate = +$("#replaySpeed").value;
    }
    renderReplay(0); replayAnimation = requestAnimationFrame(replayTick);
  }
  function closeReplay() {
    cancelAnimationFrame(replayAnimation); replayAnimation = 0;
    for (const video of $$(".replay-view video")) { video.pause(); video.removeAttribute("src"); video.load(); }
    replayUrls.forEach(url => URL.revokeObjectURL(url)); replayUrls = []; replayTrial = null;
    $("#experimentReplay").hidden = true; $("#replayPlay").textContent = "▶ Play";
  }
  $("#closeExperimentReplay").addEventListener("click", closeReplay);
  $("#replayPlay").addEventListener("click", () => {
    const videos = $$(".replay-view video").filter(video => video.src && video.getAttribute("src"));
    if (!videos.length) return;
    if (videos[0].paused) { videos.forEach(video => video.play().catch(() => {})); $("#replayPlay").textContent = "❚❚ Pause"; }
    else { videos.forEach(video => video.pause()); $("#replayPlay").textContent = "▶ Play"; }
  });
  $("#replaySeek").addEventListener("input", event => {
    if (!replayTrial) return;
    const time = replayTrial.duration * +event.target.value / 1000;
    for (const video of $$(".replay-view video")) if (video.getAttribute("src")) video.currentTime = time / 1000;
    renderReplay(time);
  });
  $("#replaySpeed").addEventListener("change", event => $$(".replay-view video").forEach(video => video.playbackRate = +event.target.value));
  $$("[data-replay-option]").forEach(input => input.addEventListener("change", () => renderReplay(+$("#replaySeek").value * (replayTrial?.duration || 0) / 1000)));
  $("#experimentReplay").addEventListener("change", event => {
    if (!replayConfig) return;
    if (event.target.dataset.replayAngle) replayConfig.angles = $$("[data-replay-angle]:checked").map(input => input.dataset.replayAngle);
    if (event.target.dataset.replayPosition) replayConfig.positions = $$("[data-replay-position]:checked").map(input => input.dataset.replayPosition);
    renderReplay(+$("#replaySeek").value * replayTrial.duration / 1000);
  });
  for (const canvas of $$("[data-replay-wave]")) canvas.addEventListener("click", event => {
    if (!replayTrial) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth));
    $("#replaySeek").value = Math.round(ratio * 1000); $("#replaySeek").dispatchEvent(new Event("input"));
  });
  refreshSettings(); renderHistory();
  function sourceChanged() { live.front = []; live.side = []; beepGate.reset(); refreshSettings(); }
  return { sample, decorate, beginTrial, endTrial, liveVisible, settings, refreshSettings, sourceChanged, openReplay, csvRows };
}
