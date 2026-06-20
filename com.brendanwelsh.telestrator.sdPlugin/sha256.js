/*
 * sha256.js — minimal, dependency-free SHA-256 + obs-websocket v5 auth helper.
 *
 * The Stream Deck plugin page is loaded from file://, where window.crypto.subtle
 * is often unavailable (non-secure context). So we ship our own SHA-256 rather
 * than depend on SubtleCrypto. Validated against Node's crypto in the repo tests.
 *
 * Exposes global TeleSha = { sha256Bytes, bytesToBase64, utf8Bytes, obsAuth }.
 */
(function (global) {
  "use strict";

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c < 0xdc00) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function sha256Bytes(input) {
    var bytes = (typeof input === "string") ? utf8Bytes(input) : input;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var l = bytes.length;
    var withOne = l + 1;
    var k = (56 - (withOne % 64) + 64) % 64;
    var total = withOne + k + 8;
    var m = new Uint8Array(total);
    m.set(bytes, 0);
    m[l] = 0x80;

    var dv = new DataView(m.buffer);
    var bitLenHi = Math.floor((l * 8) / 0x100000000);
    var bitLenLo = (l * 8) >>> 0;
    dv.setUint32(total - 8, bitLenHi);
    dv.setUint32(total - 4, bitLenLo);

    var w = new Uint32Array(64);
    for (var off = 0; off < total; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
        var s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (var j = 0; j < 8; j++) odv.setUint32(j * 4, H[j]);
    return out;
  }

  function bytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    if (typeof btoa !== "undefined") return btoa(bin);
    return Buffer.from(bytes).toString("base64"); // Node fallback (tests only)
  }

  // obs-websocket v5 authentication string:
  //   secret = Base64(SHA256(password + salt))
  //   auth   = Base64(SHA256(secret + challenge))
  function obsAuth(password, salt, challenge) {
    var secret = bytesToBase64(sha256Bytes(password + salt));
    return bytesToBase64(sha256Bytes(secret + challenge));
  }

  global.TeleSha = {
    sha256Bytes: sha256Bytes,
    bytesToBase64: bytesToBase64,
    utf8Bytes: utf8Bytes,
    obsAuth: obsAuth
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = (typeof window !== "undefined" ? window : globalThis).TeleSha;
