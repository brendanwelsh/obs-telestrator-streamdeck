/*
 * plugin.js — OBS Telestrator Stream Deck plugin (classic SDK, no build step).
 *
 * Connects to the Stream Deck software, and on key press fires a telestrator
 * command in OBS over obs-websocket. Most commands map to a frontend hotkey on
 * the OBS Telestrator script (TriggerHotkeyByName); a few orchestrate richer
 * obs-websocket flows (screenshot, freeze, instant-replay markup).
 */
(function () {
  "use strict";

  var ACTION_UUID = "com.telestrator.streamdeck.command";

  // command -> OBS Telestrator hotkey name (see obs-telestrator/telestrator.lua)
  var HOTKEY = {
    toggle: "telestrator.toggle",
    tool:   "telestrator.toolcycle",
    color:  "telestrator.colorswap",
    size:   "telestrator.sizetoggle",
    undo:   "telestrator.undo",
    redo:   "telestrator.redo",
    clear:  "telestrator.clear",
    eraser: "telestrator.erasertoggle",
    laser:  "telestrator.laser"
  };

  var sd = null;          // Stream Deck websocket
  var uuid = null;        // plugin uuid (registration context)
  var globalSettings = {};
  var obs = new ObsWs({ log: function (m) { console.log("[obs] " + m); } });

  function sdSend(obj) { if (sd && sd.readyState === 1) sd.send(JSON.stringify(obj)); }
  function showOk(ctx) { if (ctx) sdSend({ event: "showOk", context: ctx }); }
  function showAlert(ctx) { if (ctx) sdSend({ event: "showAlert", context: ctx }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function applyGlobalSettings(s) {
    globalSettings = s || {};
    obs.configure({
      host: globalSettings.obsHost,
      port: globalSettings.obsPort,
      password: globalSettings.obsPassword
    });
  }

  async function dispatch(cmd, ctx) {
    try {
      if (HOTKEY[cmd]) {
        await obs.request("TriggerHotkeyByName", { hotkeyName: HOTKEY[cmd] });
      } else if (cmd === "screenshot") {
        await doScreenshot();
      } else if (cmd === "freeze") {
        await doFreeze();
      } else if (cmd === "replay") {
        await obs.request("SaveReplayBuffer");
      } else if (cmd === "replaymarkup") {
        await doReplayMarkup();
      } else if (cmd === "golive") {
        if (!globalSettings.liveScene) throw new Error("Set 'Live scene' in the plugin settings");
        await obs.request("SetCurrentProgramScene", { sceneName: globalSettings.liveScene });
      } else {
        throw new Error("Unknown command: " + cmd);
      }
      showOk(ctx);
    } catch (e) {
      console.warn("dispatch failed:", e && e.message);
      showAlert(ctx);
    }
  }

  async function doScreenshot() {
    var folder = (globalSettings.screenshotFolder || "").replace(/[\\/]+$/, "");
    if (!folder) throw new Error("Set a screenshot folder in the plugin settings");
    var scene = (await obs.request("GetCurrentProgramScene")).currentProgramSceneName;
    var path = folder + "\\telestrator_" + Date.now() + ".png";
    await obs.request("SaveSourceScreenshot", {
      sourceName: scene, imageFormat: "png", imageFilePath: path
    });
  }

  async function doFreeze() {
    var src = globalSettings.freezeSource;
    var filt = globalSettings.freezeFilter || "Freeze";
    if (!src) throw new Error("Set 'Freeze source' in the plugin settings");
    var cur = await obs.request("GetSourceFilter", { sourceName: src, filterName: filt });
    await obs.request("SetSourceFilterEnabled", {
      sourceName: src, filterName: filt, filterEnabled: !cur.filterEnabled
    });
  }

  // Instant replay + telestrate: save the replay buffer, load it into a media
  // source on the Replay scene, and cut to that scene so you can draw on it.
  async function doReplayMarkup() {
    if (!globalSettings.replayScene || !globalSettings.replaySource) {
      throw new Error("Set 'Replay scene' and 'Replay media source' in the plugin settings");
    }
    await obs.request("SaveReplayBuffer");
    await sleep(700); // let OBS finish writing the clip
    var path = (await obs.request("GetLastReplayBufferReplay")).savedReplayPath;
    await obs.request("SetInputSettings", {
      inputName: globalSettings.replaySource,
      inputSettings: { local_file: path, looping: false, restart_on_activate: true },
      overlay: true
    });
    await obs.request("SetCurrentProgramScene", { sceneName: globalSettings.replayScene });
  }

  // ---- Stream Deck SDK entry point. Stream Deck calls this global on load. ----
  window.connectElgatoStreamDeckSocket = function (inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
    uuid = inUUID;
    sd = new WebSocket("ws://127.0.0.1:" + inPort);

    sd.onopen = function () {
      sdSend({ event: inRegisterEvent, uuid: inUUID });
      sdSend({ event: "getGlobalSettings", context: inUUID });
    };

    sd.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      var event = msg.event;

      if (event === "didReceiveGlobalSettings") {
        applyGlobalSettings(msg.payload && msg.payload.settings);
      } else if (event === "keyDown" && msg.action === ACTION_UUID) {
        var settings = (msg.payload && msg.payload.settings) || {};
        var cmd = settings.command || "toggle";
        dispatch(cmd, msg.context);
      }
    };

    sd.onclose = function () { sd = null; };
  };
})();
