// 微信小游戏运行环境的薄封装：画布、屏幕尺寸、安全区、存储、触摸、音效、分享。
// 浏览器预览（dev/preview.html）会先装一个同名的 wx 模拟层，所以这里只认 wx。
const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const W = info.windowWidth, H = info.windowHeight, dpr = Math.min(3, info.pixelRatio || 2);
canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
const safe = info.safeArea || {top: info.statusBarHeight || 0, bottom: H, left: 0, right: W};
let menu = null; try { menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect(); } catch(e){}
if (!menu || !menu.width) menu = null;

const store = {
  // 读失败时再试一次；写入返回是否成功，方便上层提示
  get(k){ for (let i = 0; i < 2; i++){ try { const v = wx.getStorageSync(k); return v === "" || v === undefined ? null : v; } catch(e){} } return null; },
  set(k, v){ for (let i = 0; i < 2; i++){ try { wx.setStorageSync(k, v); return true; } catch(e){} } return false; }
};

let AC = null;
function audio(){ if (AC) return AC; try { AC = wx.createWebAudioContext ? wx.createWebAudioContext() : null; } catch(e){ AC = null; } return AC; }
function vibrate(){ try { wx.vibrateShort && wx.vibrateShort({type:"light"}); } catch(e){} }

function offscreen(w, h){ const c = wx.createCanvas(); c.width = w; c.height = h; return c; }

function onTouch(h){ wx.onTouchStart(h.start); wx.onTouchMove(h.move); wx.onTouchEnd(h.end); wx.onTouchCancel(h.end); }

function actionSheet(items, cb){ wx.showActionSheet({ itemList: items, success: r => cb(r.tapIndex), fail(){} }); }
function confirm(title, content, okText, cb){ wx.showModal({ title, content, confirmText: okText, confirmColor: "#e2475e", cancelText: "取消", success: r => { if (r.confirm) cb(); } }); }

// 分享：get() 返回 {title, canvas}，卡片图片现画现存；存图失败就只发标题
function shareData(get){ const d = get() || {}, o = { title: d.title };
  try { if (d.canvas && d.canvas.toTempFilePathSync) o.imageUrl = d.canvas.toTempFilePathSync({ x: 0, y: 0, width: d.canvas.width, height: d.canvas.height, destWidth: d.canvas.width, destHeight: d.canvas.height }); } catch(e){}
  return o; }
function share(get){
  try {
    wx.showShareMenu && wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage", "shareTimeline"] });
    wx.onShareAppMessage && wx.onShareAppMessage(() => shareData(get));
    wx.onShareTimeline && wx.onShareTimeline(() => shareData(get));
  } catch(e){}
}
function shareNow(get){ try { wx.shareAppMessage && wx.shareAppMessage(shareData(get)); } catch(e){} }
function onShow(fn){ try { wx.onShow && wx.onShow(fn); } catch(e){} }
function onHide(fn){ try { wx.onHide && wx.onHide(fn); } catch(e){} }

// ?days=N 模拟 N 天后（只在浏览器预览里能用）
let shiftDays = 0; try { const q = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query) || {}; shiftDays = parseFloat(q.days) || 0; } catch(e){}

const raf = typeof requestAnimationFrame === "function" ? (f => requestAnimationFrame(f)) : (f => setTimeout(() => f(Date.now()), 16));

module.exports = { canvas, ctx, W, H, dpr, safe, menu, store, audio, vibrate, offscreen, onTouch, actionSheet, confirm, share, shareNow, onShow, onHide, shiftDays, raf };
