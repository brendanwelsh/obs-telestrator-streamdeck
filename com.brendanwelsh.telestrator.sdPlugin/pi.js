/*
 * pi.js — Property Inspector for the OBS Telestrator action.
 *
 * "command" is per-key (action settings). The OBS connection + advanced fields
 * are shared across every key (global settings).
 */
(function () {
  "use strict";

  var ws = null;
  var piUUID = null;
  var settings = {};        // per-action
  var globalSettings = {};  // shared

  var ACTION_FIELD = "command";
  var GLOBAL_FIELDS = [
    "obsHost", "obsPort", "obsPassword",
    "screenshotFolder", "freezeSource", "freezeFilter",
    "replayScene", "replaySource", "liveScene"
  ];

  function $(id) { return document.getElementById(id); }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function saveAction() { send({ event: "setSettings", context: piUUID, payload: settings }); }
  function saveGlobal() { send({ event: "setGlobalSettings", context: piUUID, payload: globalSettings }); }

  function fillAction() {
    if ($(ACTION_FIELD) && settings.command) $(ACTION_FIELD).value = settings.command;
  }
  function fillGlobal() {
    GLOBAL_FIELDS.forEach(function (f) {
      if ($(f) && globalSettings[f] !== undefined && globalSettings[f] !== null) $(f).value = globalSettings[f];
    });
  }

  function wire() {
    var cmd = $(ACTION_FIELD);
    if (cmd) cmd.addEventListener("change", function () {
      settings.command = cmd.value;
      saveAction();
    });
    GLOBAL_FIELDS.forEach(function (f) {
      var el = $(f);
      if (!el) return;
      el.addEventListener("input", function () {
        globalSettings[f] = el.value;
        saveGlobal();
      });
    });
  }

  // Stream Deck calls this on load.
  window.connectElgatoStreamDeckSocket = function (inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
    piUUID = inUUID;
    try {
      var info = JSON.parse(inActionInfo);
      settings = (info.payload && info.payload.settings) || {};
    } catch (e) { settings = {}; }

    ws = new WebSocket("ws://127.0.0.1:" + inPort);
    ws.onopen = function () {
      send({ event: inRegisterEvent, uuid: inUUID });
      send({ event: "getGlobalSettings", context: inUUID });
      fillAction();
    };
    ws.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      if (msg.event === "didReceiveGlobalSettings") {
        globalSettings = (msg.payload && msg.payload.settings) || {};
        fillGlobal();
      }
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
