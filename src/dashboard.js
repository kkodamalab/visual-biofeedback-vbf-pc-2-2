import Peer from "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm";
import { createPose, draw, measure, setMetrics, getCamera } from "./pose.js";
import { createExperiment } from "./experiment.js";
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="./src/experiment.css">');

const $ = (selector, root = document) => root.querySelector(selector);
const views = Object.fromEntries(["front", "side"].map(name => {
  const root = $(`[data-view="${name}"]`);
  return [name, { root, video: $("video", root), canvas: $("canvas", root), select: $("select", root), source: name === "front" ? "pc" : "A" }];
}));
const phones = { A: { sessionId: null, call: null, conn: null, stream: null, metrics: null, landmarks: null }, B: { sessionId: null, call: null, conn: null, stream: null, metrics: null, landmarks: null } };
const pcFeed = document.createElement("video");
pcFeed.muted = true; pcFeed.playsInline = true;
let pcStream, pcPose, pcMetrics, pcLandmarks, pcLast = -1, pcGeneration = 0;
let recorders = [], recordedUrls = [], experiment, recordingPending = false, recordTimer = 0, recordingBytes = 0;

function sourceName(source) { return source === "pc" ? "PC Camera" : `Smartphone ${source}`; }
function sourceState(source) { return source === "pc" ? { stream: pcStream, metrics: pcMetrics, landmarks: pcLandmarks } : phones[source]; }
function resetMetrics(view) {
  for (const key of ["knee", "hip", "trunk"]) {
    $(`[data-metric="${key}"]`, view.root).innerHTML = "—<small>°</small>";
    $(`[data-bar="${key}"]`, view.root).style.width = "0";
  }
}
function render(view) {
  const state = sourceState(view.source), { stream, metrics, landmarks } = state;
  view.root.dataset.remote = view.source === "pc" ? "false" : "true";
  if (view.video.srcObject !== stream) {
    view.video.srcObject = stream || null;
    if (stream) view.video.play().catch(() => {});
  }
  const canvas = view.canvas;
  canvas.width = view.video.videoWidth || stream?.getVideoTracks()?.[0]?.getSettings()?.width || 1280;
  canvas.height = view.video.videoHeight || stream?.getVideoTracks()?.[0]?.getSettings()?.height || 720;
  if (stream && landmarks) draw(canvas, landmarks);
  else canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  if (metrics) setMetrics(view.root, metrics); else resetMetrics(view);
  experiment?.decorate(view, state);
  $(".placeholder", view.root).classList.toggle("hidden", !!stream);
  const badge = $(".live-badge", view.root);
  badge.textContent = stream ? "● LIVE" : "● WAITING";
  badge.classList.toggle("active", !!stream);
  $(".cue", view.root).textContent = stream ? `${sourceName(view.source)}を解析中` : `${sourceName(view.source)}を待っています`;
}
function renderSource(source) { Object.values(views).filter(view => view.source === source).forEach(render); updateStatus(); updateCoach(); }
function updateStatus() {
  const ready = Object.values(views).filter(view => !!sourceState(view.source).stream).length;
  $("#statusDot").classList.toggle("active", ready === 2);
  $("#systemStatus").textContent = ready === 2 ? "2視点を解析中" : `${ready}/2視点 接続中`;
}
function updateCoach() {
  if (experiment && !experiment.liveVisible()) { $(".feedback").style.visibility = "hidden"; return; }
  $(".feedback").style.visibility = "visible";
  if (experiment?.settings.type === "KR") {
    $("#depthValue").textContent = "KR";
    $("#coachTitle").textContent = "設定Targetとの比較";
    $("#coachText").textContent = "各映像のTarget表示で現在値を確認できます。Trial終了後に結果を要約します。";
    return;
  }
  const values = Object.values(views).map(view => sourceState(view.source).metrics).filter(Boolean);
  const dial = $(".depth-dial");
  if (!values.length) {
    $("#depthValue").textContent = "—"; dial.classList.remove("good", "warn");
    $("#coachTitle").textContent = "2つの視点を準備してください";
    $("#coachText").textContent = "PCカメラまたはRemote Cameraを接続します。";
    return;
  }
  const knee = Math.round(values.reduce((sum, value) => sum + value.knee, 0) / values.length);
  const trunk = Math.round(values.reduce((sum, value) => sum + value.trunk, 0) / values.length);
  $("#depthValue").textContent = `${Math.max(0, Math.min(100, Math.round((170 - knee) / .8)))}%`;
  const target = experiment?.settings.targets.knee, comparing = experiment?.settings.visuals.target && target?.enabled;
  dial.classList.toggle("good", !!comparing && Math.abs(knee - target.value) <= target.tolerance);
  dial.classList.toggle("warn", !!comparing && Math.abs(knee - target.value) > target.tolerance);
  $("#coachTitle").textContent = comparing ? `Knee Target ${target.value}±${target.tolerance}°` : "計測中 / Live Coach";
  $("#coachText").textContent = `${values.length}視点の膝 ${knee}°・体幹 ${trunk}°。${comparing ? "色はユーザー指定Targetとの差を示します。" : "研究仮説に合わせてTargetを設定できます。"}`;
}
function labelPhone(slot) { $("#state" + slot).textContent = phones[slot].stream ? `接続中 · ID ${phones[slot].sessionId.slice(0, 8)}` : "接続待ち"; }
function clearPhone(slot) {
  const phone = phones[slot];
  if (recorders.length && Object.values(views).some(view => view.source === slot)) stopRecording();
  phone.stream = null; phone.metrics = null; phone.landmarks = null;
  experiment?.sourceChanged();
  labelPhone(slot); renderSource(slot);
}
function broadcastFeedback() {
  for (const phone of Object.values(phones)) if (phone.conn?.open) phone.conn.send({ type: "feedback", visible: experiment?.liveVisible() ?? true });
  updateCoach();
}
experiment = createExperiment({ views, sourceState, onSettingsChange: broadcastFeedback });
const peer = new Peer();
peer.on("open", id => {
  $("#roomCode").textContent = id.slice(-6).toUpperCase();
  for (const slot of ["A", "B"]) {
    const url = new URL("./capture.html", location.href);
    url.searchParams.set("peer", id); url.searchParams.set("source", slot);
    $("#link" + slot).href = url.href;
    const qr = $("#qr" + slot); qr.replaceChildren();
    new QRCode(qr, { text: url.href, width: 112, height: 112, colorDark: "#0b0d0f", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  }
  updateStatus();
});
function identity(metadata) {
  // Older capture links without metadata remain Smartphone A for compatibility.
  return { slot: metadata?.source === "B" ? "B" : "A", sessionId: metadata?.sessionId || "legacy" };
}
peer.on("call", call => {
  const { slot, sessionId } = identity(call.metadata), phone = phones[slot];
  phone.sessionId = sessionId; phone.call = call;
  clearPhone(slot);
  call.answer(new MediaStream());
  call.on("stream", stream => {
    if (phone.call !== call || phone.sessionId !== sessionId) return;
    phone.stream = stream; labelPhone(slot); renderSource(slot);
  });
  call.on("close", () => { if (phone.call === call) { phone.call = null; clearPhone(slot); } });
});
peer.on("connection", conn => {
  const { slot, sessionId } = identity(conn.metadata), phone = phones[slot];
  phone.conn = conn;
  conn.on("open", broadcastFeedback);
  conn.on("data", data => {
    if (phone.conn !== conn || phone.call?.peer !== conn.peer || phone.sessionId !== sessionId || data.type !== "pose") return;
    phone.metrics = data.metrics; phone.landmarks = data.landmarks;
    experiment.sample(slot, data.landmarks); renderSource(slot);
  });
  conn.on("close", () => { if (phone.conn === conn) phone.conn = null; });
});
peer.on("error", error => { $("#systemStatus").textContent = `接続エラー: ${error.type}`; });

async function startPc() {
  const button = $("#startPc"); button.disabled = true;
  const generation = ++pcGeneration;
  try {
    if (recorders.length) await stopRecording();
    pcStream?.getTracks().forEach(track => track.stop());
    pcStream = null; pcMetrics = pcLandmarks = null; experiment.sourceChanged(); renderSource("pc");
    pcStream = await getCamera({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    pcFeed.srcObject = pcStream; await pcFeed.play();
    pcPose ??= await createPose();
    pcLast = -1; button.textContent = "PCカメラを再接続";
    renderSource("pc"); requestAnimationFrame(time => loopPc(time, generation));
  } catch (error) { $("#systemStatus").textContent = error.name === "NotAllowedError" ? "カメラを許可してください" : error.message; }
  finally { button.disabled = false; }
}
function loopPc(time, generation) {
  if (generation !== pcGeneration) return;
  if (pcFeed.readyState >= 2 && pcFeed.currentTime !== pcLast) {
    pcLast = pcFeed.currentTime;
    pcPose.detectForVideo(pcFeed, time, result => {
      if (generation !== pcGeneration) return;
      pcLandmarks = result.landmarks?.[0] || null;
      if (pcLandmarks) pcMetrics = measure(pcLandmarks);
      else pcMetrics = null;
      if (pcLandmarks) experiment.sample("pc", pcLandmarks);
      renderSource("pc");
    });
  }
  requestAnimationFrame(next => loopPc(next, generation));
}
$("#startPc").addEventListener("click", startPc);
async function stopRecording() {
  const active = recorders; recorders = [];
  if (!active.length || recordingPending) return;
  clearTimeout(recordTimer); recordTimer = 0;
  recordingPending = true; $("#recordViews").disabled = true;
  await Promise.all(active.map(recorder => new Promise(resolve => {
    if (recorder.state === "inactive") return resolve();
    recorder.addEventListener("stop", resolve, { once: true }); recorder.stop();
  })));
  experiment.endTrial(Object.fromEntries(active.map(recorder => [recorder.viewName, recorder.savedBlob])));
  $("#recordViews").textContent = "2視点を録画";
  for (const view of Object.values(views)) view.select.disabled = false;
  $("#recordStatus").textContent = "録画終了。完成した映像をダウンロードしてください。";
  recordingPending = false; $("#recordViews").disabled = false; broadcastFeedback();
}
$("#recordViews").addEventListener("click", () => {
  if (recordingPending) return;
  if (recorders.length) { stopRecording(); return; }
  if (!window.MediaRecorder) { $("#recordStatus").textContent = "このブラウザは録画に対応していません"; return; }
  const selected = Object.entries(views).map(([name, view]) => [name, view, sourceState(view.source).stream]);
  if (selected.some(([, , stream]) => !stream || !stream.active)) { $("#recordStatus").textContent = "両視点の映像を接続してから録画してください"; return; }
  recordedUrls.forEach(url => URL.revokeObjectURL(url)); recordedUrls = [];
  $("#recordDownloads").replaceChildren();
  try {
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    recordingBytes = 0;
    const prepared = selected.map(([name, view, stream]) => {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks = [];
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); recordingBytes += event.data.size; }
        if (recordingBytes > 450 * 1048576 && recorders.length) stopRecording();
      };
      recorder.onstop = () => {
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        recorder.savedBlob = blob;
        const url = URL.createObjectURL(blob); recordedUrls.push(url);
        const link = document.createElement("a"); link.href = url;
        link.download = `VBF-${stamp}-${name}-${view.source}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
        link.textContent = `${name === "front" ? "Front" : "Side"}映像を保存`;
        $("#recordDownloads").append(link);
      };
      recorder.viewName = name;
      return recorder;
    });
    recorders = prepared;
    for (const recorder of prepared) recorder.start(1000);
    experiment.beginTrial(); broadcastFeedback();
    recordTimer = setTimeout(() => { if (recorders.length) stopRecording(); }, 5 * 60 * 1000);
    for (const view of Object.values(views)) view.select.disabled = true;
    $("#recordViews").textContent = "録画を終了";
    $("#recordStatus").textContent = "Front／Sideの映像を録画中（最大5分・約450 MBで自動終了）";
  } catch (error) {
    stopRecording(); $("#recordStatus").textContent = `録画を開始できません: ${error.message}`;
  }
});
for (const [name, view] of Object.entries(views)) {
  view.select.addEventListener("change", () => {
    const other = views[name === "front" ? "side" : "front"];
    const previous = view.source, chosen = view.select.value;
    if (other.source === chosen) { other.source = previous; other.select.value = previous; }
    view.source = chosen;
    experiment.sourceChanged();
    render(view); render(other); updateStatus(); updateCoach();
  });
  view.video.addEventListener("loadedmetadata", () => render(view));
  render(view);
}
