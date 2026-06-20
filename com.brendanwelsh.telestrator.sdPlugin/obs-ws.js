/*
 * obs-ws.js — tiny obs-websocket v5 client for the browser (Stream Deck plugin).
 * Handles the Hello/Identify handshake (incl. SHA-256 auth via TeleSha) and
 * request/response. No external dependencies.
 *
 * Exposes global ObsWs.
 */
(function (global) {
  "use strict";

  // obs-websocket v5 opcodes
  var OP_HELLO = 0, OP_IDENTIFY = 1, OP_IDENTIFIED = 2, OP_REQUEST = 6, OP_REQUEST_RESPONSE = 7;

  function ObsWs(opts) {
    opts = opts || {};
    this.host = opts.host || "127.0.0.1";
    this.port = opts.port || 4455;
    this.password = opts.password || "";
    this.log = opts.log || function () {};
    this.ws = null;
    this.identified = false;
    this.connecting = null;     // Promise while connecting
    this.pending = {};          // requestId -> {resolve, reject}
    this.reqId = 0;
  }

  ObsWs.prototype.url = function () {
    return "ws://" + this.host + ":" + this.port;
  };

  ObsWs.prototype.configure = function (opts) {
    var changed = (opts.host !== this.host) || (Number(opts.port) !== this.port) || (opts.password !== this.password);
    this.host = opts.host || "127.0.0.1";
    this.port = Number(opts.port) || 4455;
    this.password = opts.password || "";
    if (changed) this.close();
  };

  ObsWs.prototype.close = function () {
    this.identified = false;
    this.connecting = null;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  };

  // Connect + identify. Returns a Promise that resolves once identified.
  ObsWs.prototype.ensure = function () {
    var self = this;
    if (self.identified && self.ws && self.ws.readyState === 1) return Promise.resolve();
    if (self.connecting) return self.connecting;

    self.connecting = new Promise(function (resolve, reject) {
      var ws;
      try {
        ws = new WebSocket(self.url());
      } catch (e) {
        self.connecting = null;
        return reject(e);
      }
      self.ws = ws;
      self.identified = false;

      var done = false;
      function fail(err) {
        if (done) return;
        done = true;
        self.connecting = null;
        reject(err);
      }
      function ok() {
        if (done) return;
        done = true;
        self.connecting = null;
        resolve();
      }

      ws.onerror = function () { self.log("obs ws error"); fail(new Error("WebSocket error connecting to " + self.url())); };
      ws.onclose = function () {
        self.identified = false;
        // reject any in-flight requests
        Object.keys(self.pending).forEach(function (id) {
          self.pending[id].reject(new Error("obs-websocket closed"));
          delete self.pending[id];
        });
        fail(new Error("obs-websocket closed before identify"));
      };
      ws.onmessage = function (evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch (e) { return; }
        self._onMessage(msg, ok, fail);
      };
    });
    return self.connecting;
  };

  ObsWs.prototype._onMessage = function (msg, onIdentified, onFail) {
    var self = this;
    var op = msg.op;
    var d = msg.d || {};

    if (op === OP_HELLO) {
      var identify = { rpcVersion: 1, eventSubscriptions: 0 };
      if (d.authentication) {
        if (!self.password) {
          return onFail(new Error("OBS requires a websocket password but none is set"));
        }
        identify.authentication = global.TeleSha.obsAuth(self.password, d.authentication.salt, d.authentication.challenge);
      }
      self._send({ op: OP_IDENTIFY, d: identify });
    } else if (op === OP_IDENTIFIED) {
      self.identified = true;
      self.log("obs identified");
      onIdentified();
    } else if (op === OP_REQUEST_RESPONSE) {
      var p = self.pending[d.requestId];
      if (!p) return;
      delete self.pending[d.requestId];
      if (d.requestStatus && d.requestStatus.result) {
        p.resolve(d.responseData || {});
      } else {
        p.reject(new Error((d.requestStatus && d.requestStatus.comment) || "request failed: " + (d.requestType || "")));
      }
    }
  };

  ObsWs.prototype._send = function (obj) {
    this.ws.send(JSON.stringify(obj));
  };

  // Send a request and await the RequestResponse.
  ObsWs.prototype.request = function (requestType, requestData) {
    var self = this;
    return self.ensure().then(function () {
      return new Promise(function (resolve, reject) {
        var id = "r" + (++self.reqId);
        self.pending[id] = { resolve: resolve, reject: reject };
        self._send({ op: OP_REQUEST, d: { requestType: requestType, requestId: id, requestData: requestData || {} } });
        setTimeout(function () {
          if (self.pending[id]) {
            delete self.pending[id];
            reject(new Error("obs request timed out: " + requestType));
          }
        }, 5000);
      });
    });
  };

  global.ObsWs = ObsWs;
})(typeof window !== "undefined" ? window : globalThis);
