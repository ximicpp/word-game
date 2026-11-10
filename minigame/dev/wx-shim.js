// 浏览器里的 wx 模拟层：只实现单词星系用到的接口。
(function(){
  window.__wxPreview = true;
  const q = new URLSearchParams(location.search);
  const W = +q.get("w") || Math.min(innerWidth, 390), H = +q.get("h") || Math.min(innerHeight, 844);
  const phone = document.getElementById("phone"); phone.style.width = W + "px"; phone.style.height = H + "px";
  const notch = H >= 700;
  const safe = { top: notch ? 47 : 20, bottom: notch ? H - 34 : H, left: 0, right: W, width: W, height: H - (notch ? 81 : 20) };
  const menu = { top: safe.top + 4, height: 32, width: 87, left: W - 7 - 87, right: W - 7, bottom: safe.top + 36 };
  const cap = document.getElementById("capsule"); Object.assign(cap.style, { left: menu.left + "px", top: menu.top + "px", width: menu.width + "px", height: menu.height + "px" });
  if (q.get("reset")) localStorage.removeItem("wordnet-progress-v1");
  let first = null;
  const touchHandlers = { start: [], move: [], end: [], cancel: [] };
  const rectOf = () => phone.getBoundingClientRect();
  const toTouch = e => { const r = rectOf(); return { identifier: e.pointerId, clientX: e.clientX - r.left, clientY: e.clientY - r.top }; };
  const active = new Map();
  const fire = (kind, e) => { const t = toTouch(e); if (kind === "start") active.set(e.pointerId, t); else if (kind === "move") { if (!active.has(e.pointerId)) return; active.set(e.pointerId, t); } else active.delete(e.pointerId);
    touchHandlers[kind].forEach(h => h({ touches: [...active.values()], changedTouches: [t] })); };
  window.wx = {
    createCanvas(){ const c = document.createElement("canvas"); c.toTempFilePathSync = () => c.toDataURL("image/png"); if (!first){ first = c; phone.insertBefore(c, phone.firstChild);
        c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); fire("start", e); });
        c.addEventListener("pointermove", e => fire("move", e));
        c.addEventListener("pointerup", e => fire("end", e)); c.addEventListener("pointercancel", e => fire("cancel", e));
        c.addEventListener("wheel", e => { e.preventDefault(); }, { passive: false }); }
      return c; },
    getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: devicePixelRatio || 2, safeArea: safe, statusBarHeight: safe.top }),
    getMenuButtonBoundingClientRect: () => menu,
    getStorageSync: k => { const v = localStorage.getItem(k); return v === null ? "" : v; },
    setStorageSync: (k, v) => localStorage.setItem(k, v),
    onTouchStart: h => touchHandlers.start.push(h), onTouchMove: h => touchHandlers.move.push(h),
    onTouchEnd: h => touchHandlers.end.push(h), onTouchCancel: h => touchHandlers.cancel.push(h),
    createWebAudioContext: () => new (window.AudioContext || window.webkitAudioContext)(),
    vibrateShort(){}, showShareMenu(){}, onShareAppMessage(f){ window.__onShare = f; }, onShareTimeline(){}, onShow(f){ window.__show = f; }, onHide(f){ window.__hide = f; },
    shareAppMessage(o){ window.__shared = o; },
    getLaunchOptionsSync: () => ({ query: Object.fromEntries(q.entries()) }),
    showActionSheet({ itemList, success }){ const s = document.getElementById("sheet"), box = s.firstElementChild;
      box.innerHTML = itemList.map((t, i) => `<button data-i="${i}">${t}</button>`).join("") + `<button data-i="-1" style="margin-top:6px">取消</button>`;
      s.style.display = "flex"; box.onclick = e => { const b = e.target.closest("button"); if (!b) return; s.style.display = "none"; if (+b.dataset.i >= 0) success({ tapIndex: +b.dataset.i }); }; },
    showModal({ title, content, confirmText, success }){ const s = document.getElementById("sheet"), box = s.firstElementChild;
      box.innerHTML = `<div class="t"><b>${title}</b><br><br>${content}</div><button data-ok="1" style="color:#e2475e">${confirmText}</button><button>取消</button>`;
      s.style.display = "flex"; box.onclick = e => { const b = e.target.closest("button"); if (!b) return; s.style.display = "none"; success({ confirm: !!b.dataset.ok, cancel: !b.dataset.ok }); }; }
  };
})();
