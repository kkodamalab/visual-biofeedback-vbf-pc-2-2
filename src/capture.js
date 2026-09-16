import Peer from "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm";
import { createPose, draw, measure, setMetrics, getCamera } from "./pose.js";
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="./src/remote-camera.css">');

const $ = (s, r = document) => r.querySelector(s);
const target = new URLSearchParams(location.search).get("peer");
const source = new URLSearchParams(location.search).get("source") === "B" ? "B" : "A";
const sessionId = crypto.randomUUID();
const video = $("video"), canvas = $("canvas"), root = $(".capture-card");
$(".privacy-note").textContent = "映像は接続中のPCへ直接送られます。PCで録画を開始した場合のみ保存されます。";
let stream, pose, conn, call, peer, last = -1, running = false, lastSent = 0;
let facing = "environment", lens = "wide", cameraDevices = [], ultraId = null, wideId = null;
let manualDevice = "", switching = false, generation = 0;

const switcher = document.createElement("div");
switcher.className = "camera-switcher";
switcher.setAttribute("role", "group");
switcher.setAttribute("aria-label", "前面・背面カメラ");
switcher.innerHTML = '<button type="button" class="active" data-facing="environment">背面カメラ</button><button type="button" data-facing="user">インカメラ</button>';
$(".lens-controls").before(switcher);
if (!target) { $("#systemStatus").textContent = "接続先がありません"; $("#startCapture").disabled = true; }
else $("#systemStatus").textContent = `Smartphone ${source} / ID ${sessionId.slice(0, 8)} 接続準備完了`;

function classify(label) {
  if (/front|face\s*time|selfie|前面|インカメラ/i.test(label)) return "front";
  if (/ultra[\s-]*wide|ultrawide|super[\s-]*wide|超広角|0[.,]5\s*[x×]/i.test(label)) return "ultra";
  if (/telephoto|望遠|tele\b/i.test(label)) return "tele";
  if (/\bwide\b|広角|back|rear|背面|environment/i.test(label)) return "wide";
  return "unknown";
}
function updateButtons() {
  $("[data-lens=ultra]").disabled = !ultraId;
  document.querySelectorAll("[data-lens]").forEach(b => b.classList.toggle("active", facing === "environment" && !manualDevice && b.dataset.lens === lens));
  switcher.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.facing === facing));
  $("#lensStatus").textContent = ultraId
    ? "物理的なUltra Wideを検出しました。0.5×で切替可能です。"
    : "この端末・ブラウザでは0.5×カメラを選択できません。手動選択も確認してください。";
}
async function cameras() {
  try {
    cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    ultraId = cameraDevices.find(d => classify(d.label) === "ultra")?.deviceId || null;
    wideId = cameraDevices.find(d => classify(d.label) === "wide")?.deviceId || null;
    const select = $("#cameraSelect");
    select.replaceChildren(new Option("自動選択", ""), ...cameraDevices.map((d, i) => new Option(d.label || `カメラ ${i + 1}`, d.deviceId)));
    if (manualDevice && cameraDevices.some(d => d.deviceId === manualDevice)) select.value = manualDevice;
    else { manualDevice = ""; select.value = ""; }
    updateButtons();
  } catch (error) { $("#lensStatus").textContent = `カメラ一覧を取得できません: ${error.message}`; }
}
function closeConnection() {
  running = false; generation++;
  $("#statusDot").classList.remove("active");
  stream?.getTracks().forEach(t => t.stop());
  call?.close(); conn?.close(); peer?.destroy();
  stream = call = conn = peer = null;
  video.srcObject = null;
}
async function start() {
  if (switching) return;
  switching = true;
  const button = $("#startCapture"); button.disabled = true;
  try {
    closeConnection(); last = -1;
    const deviceId = manualDevice || (facing === "environment" ? lens === "ultra" ? ultraId : wideId : cameraDevices.find(d => classify(d.label) === "front")?.deviceId);
    if (lens === "ultra" && facing === "environment" && !manualDevice && !ultraId) throw new Error("0.5×カメラを選択できません");
    stream = await getCamera({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } }, audio: false });
    const actualId = stream.getVideoTracks()[0].getSettings().deviceId;
    if (lens === "ultra" && !manualDevice && actualId && actualId !== ultraId) throw new Error("Ultra Wideを開始できませんでした");
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $(".placeholder", root).classList.add("hidden");
    await cameras(); // 権限許可後にデバイス名が公開される場合がある
    pose ??= await createPose();
    peer = new Peer();
    await new Promise((resolve, reject) => { peer.on("open", resolve); peer.on("error", reject); });
    call = peer.call(target, stream, { metadata: { source, sessionId } });
    conn = peer.connect(target, { reliable: false, metadata: { source, sessionId } });
    conn.on("data", message => {
      if (message.type !== "feedback") return;
      root.classList.toggle("feedback-suppressed", !message.visible);
      if (!message.visible) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    });
    conn.on("open", () => {
      $("#statusDot").classList.add("active");
      $("#systemStatus").textContent = `Smartphone ${source} · ${facing === "user" ? "インカメラ" : lens === "ultra" ? "0.5× Ultra Wide" : "背面カメラ"}をPCへ送信中`;
      button.textContent = "カメラを再接続";
      running = true; const current = generation; requestAnimationFrame(t => loop(t, current));
    });
    peer.on("error", e => { $("#systemStatus").textContent = `接続エラー: ${e.type}`; });
  } catch (error) {
    closeConnection();
    $("#systemStatus").textContent = error.name === "NotAllowedError" ? "カメラを許可してください" : error.message;
  } finally { button.disabled = false; switching = false; }
}
function loop(t, current) {
  if (!running || current !== generation) return;
  if (video.readyState >= 2 && video.currentTime !== last) {
    last = video.currentTime;
    pose.detectForVideo(video, t, result => {
      if (current !== generation) return;
      const landmarks = result.landmarks?.[0]; if (!landmarks) return;
      draw(canvas, landmarks); const metrics = measure(landmarks); setMetrics(root, metrics);
      if (conn?.open && t - lastSent > 66) { conn.send({ type: "pose", timestamp: Date.now(), metrics, landmarks, facing, lens }); lastSent = t; }
    });
  }
  requestAnimationFrame(next => loop(next, current));
}
switcher.addEventListener("click", async event => {
  const b = event.target.closest("button[data-facing]"); if (!b || b.dataset.facing === facing || switching) return;
  facing = b.dataset.facing; manualDevice = ""; $("#cameraSelect").value = ""; updateButtons();
  if (stream) await start();
});
$(".lens-switcher").addEventListener("click", async event => {
  const b = event.target.closest("button[data-lens]"); if (!b || b.disabled || switching || (lens === b.dataset.lens && facing === "environment" && !manualDevice)) return;
  lens = b.dataset.lens; facing = "environment"; manualDevice = ""; $("#cameraSelect").value = ""; updateButtons();
  if (stream) await start();
});
$("#cameraSelect").addEventListener("change", async event => {
  if (switching) return;
  manualDevice = event.target.value;
  const type = classify(cameraDevices.find(d => d.deviceId === manualDevice)?.label || "");
  if (type === "front") facing = "user";
  else if (manualDevice) facing = "environment";
  if (type === "ultra") lens = "ultra"; else if (type === "wide") lens = "wide";
  updateButtons(); if (stream) await start();
});
$("#fullBody").addEventListener("change", e => root.classList.toggle("full-body", e.target.checked));
root.classList.add("full-body");
$("#startCapture").addEventListener("click", start);
cameras(); navigator.mediaDevices?.addEventListener("devicechange", cameras);
