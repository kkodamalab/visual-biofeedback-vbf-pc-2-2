const $ = (selector, root = document) => root.querySelector(selector);
const grid = $("#monitorGrid"), status = $("#monitorStatus");
let bridge = null, lastFrame = 0, currentSettings = null;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("vbf-monitor") : null;
channel?.addEventListener("message", event => {
  if (event.data?.type === "settings") currentSettings = event.data.settings;
});
channel?.postMessage({ type: "ready" });

$(".monitor-bar nav").addEventListener("click", event => {
  const button = event.target.closest("[data-mode]"); if (!button) return;
  grid.dataset.mode = button.dataset.mode;
  document.querySelectorAll("[data-mode] button, button[data-mode]").forEach(item => item.classList.toggle("active", item === button));
});
$("#fullscreen").addEventListener("click", async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { status.textContent = "このブラウザではFullscreenを利用できません"; }
});

function getBridge() {
  try { return window.opener && !window.opener.closed && window.opener.location.origin === location.origin ? window.opener.__vbfMonitorBridge : null; }
  catch { return null; }
}
export function paint(name, settings, sourceBridge = bridge) {
  const source = sourceBridge.views[name], root = $(`[data-view="${name}"]`);
  const canvas = $(".monitor-picture", root), ctx = canvas.getContext("2d");
  const width = source.canvas.width || 1280, height = source.canvas.height || 720;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.fillStyle = "#080a0b"; ctx.fillRect(0, 0, width, height);
  const video = source.video, stream = sourceBridge.sourceState(source.source).stream;
  if (settings.camera !== "off" && stream && video.readyState >= 2) {
    ctx.save();
    if (source.source === "pc") { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, width, height); ctx.restore();
  }
  ctx.save();
  if (source.source === "pc") { ctx.translate(width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source.canvas, 0, 0, width, height); ctx.restore();
  const target = $(".monitor-target", root), originTarget = $(".experiment-target", source.root);
  target.textContent = originTarget?.hidden ? "" : originTarget?.textContent || "";
  target.classList.toggle("outside", !!originTarget?.classList.contains("outside"));
  const values = $(".monitor-values", root), originValues = $(".experiment-values", source.root);
  values.textContent = originValues?.hidden ? "" : originValues?.textContent || "";
  const gauges = $(".monitor-gauges", root), originGauges = $(".experiment-gauges", source.root);
  if (gauges) {
    gauges.hidden = !originGauges || originGauges.hidden;
    if (!gauges.hidden) {
      gauges.dataset.direction = originGauges.dataset.direction;
      if (gauges.dataset.variables !== originGauges.dataset.variables) {
        gauges.dataset.variables = originGauges.dataset.variables;
        gauges.replaceChildren(...[...originGauges.children].map(card => card.cloneNode(true)));
      }
      for (let i = 0; i < originGauges.children.length; i++) {
        const from = originGauges.children[i], to = gauges.children[i];
        to.className = from.className;
        for (const selector of [".gauge-value", ".gauge-status", ".gauge-goal"]) $(selector, to).textContent = $(selector, from).textContent;
        const fromTrack = $(".gauge-track", from), toTrack = $(".gauge-track", to);
        toTrack.style.cssText = fromTrack.style.cssText;
        for (const name of ["aria-label", "aria-valuenow", "aria-valuemin", "aria-valuemax"]) {
          if (fromTrack.hasAttribute(name)) toTrack.setAttribute(name, fromTrack.getAttribute(name)); else toTrack.removeAttribute(name);
        }
      }
    }
  }
  const wave = $(".monitor-wave", root), originWave = $(".experiment-wave", source.root);
  wave.hidden = !originWave || originWave.hidden;
  if (!wave.hidden) {
    const from = $("canvas", originWave), to = $("canvas", wave);
    if (from.width && from.height) {
      if (to.width !== from.width || to.height !== from.height) { to.width = from.width; to.height = from.height; }
      to.getContext("2d").drawImage(from, 0, 0);
    }
  }
}
function loop(time) {
  bridge = getBridge();
  if (!bridge) status.textContent = "Dashboardの「Open Monitor View」から開いてください（Dashboardを閉じると停止します）";
  else if (time - lastFrame >= 33) {
    lastFrame = time;
    const settings = bridge.settings || currentSettings;
    status.textContent = "Dashboardと同期中 · カメラ・PoseはDashboard側のみ";
    paint("front", settings); paint("side", settings);
    const coach = bridge.views.front.root.ownerDocument.querySelector("#coachText");
    $("#monitorCoach").textContent = settings.timing === "concurrent" ? coach?.textContent || "" : "";
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
