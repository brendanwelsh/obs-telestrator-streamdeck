# OBS Telestrator — Stream Deck plugin

Control the [**OBS Telestrator**](https://github.com/brendanwelsh/obs-telestrator)
from your Elgato Stream Deck. One configurable key type — pick a command per key —
that fires telestrator actions in OBS over **obs-websocket** (no keyboard focus
required, works while you're in a game).

This is the companion to the OBS-side engine. The engine does the drawing; this
plugin is the control surface.

> Windows · classic Stream Deck SDK (no build step) · talks raw obs-websocket v5.

---

## What it can do

Each key runs one command:

**Drawing** (these map to the engine's OBS hotkeys via `TriggerHotkeyByName`):
`Toggle Drawing On/Off` · `Cycle Tool` · `Cycle Color` · `Cycle Brush Size` ·
`Toggle Eraser` · `Toggle Laser` · `Undo` · `Redo` · `Clear`

**OBS / broadcast** (orchestrated directly over obs-websocket):
`Save Screenshot` · `Toggle Freeze` · `Save Replay Buffer` ·
`Instant Replay + Markup` · `Go Live`

---

## Requirements

1. **OBS 28+** (obs-websocket v5 is built in) with the
   [OBS Telestrator](https://github.com/brendanwelsh/obs-telestrator) script loaded.
2. In OBS, set hotkeys for the telestrator actions you want
   (Settings → Hotkeys, search "Telestrator"). You don't need to assign keyboard
   keys — the plugin triggers them **by name** — but the actions must exist
   (they're registered as soon as the script is loaded).
3. **obs-websocket** enabled: OBS → Tools → **WebSocket Server Settings** →
   Enable, note the **port** (default `4455`) and **password**.

## Install

This is a no-build classic plugin — just drop the folder into Stream Deck's
plugins directory:

1. Quit the Stream Deck app.
2. Copy `com.welsh.telestrator.sdPlugin` into:
   `%APPDATA%\Elgato\StreamDeck\Plugins\`
3. Start the Stream Deck app. "OBS Telestrator" appears in the actions list.

(During development you can symlink instead:
`mklink /D "%APPDATA%\Elgato\StreamDeck\Plugins\com.welsh.telestrator.sdPlugin" "<repo>\com.welsh.telestrator.sdPlugin"`.)

## Configure

1. Drag **Telestrator Command** onto a key.
2. In the inspector, pick the **command** for that key.
3. Fill in the **OBS connection** (host `127.0.0.1`, port, password) on any key —
   it's shared across all keys.
4. Repeat for each key you want.

## Suggested deck page

```
┌──────────┬──────────┬──────────┬──────────┐
│  TOGGLE  │   TOOL   │  COLOR   │  LASER   │
├──────────┼──────────┼──────────┼──────────┤
│   UNDO   │   REDO   │  SIZE+   │  CLEAR   │
├──────────┼──────────┼──────────┼──────────┤
│ SCREENSH │  FREEZE  │  REPLAY  │ GO LIVE  │
└──────────┴──────────┴──────────┴──────────┘
```
Top row = your live drawing controls (Toggle is the headline). Bottom row = the
broadcast tricks. Set each key's title yourself in Stream Deck.

---

## Advanced: Freeze, Screenshot, Instant Replay

These use extra obs-websocket calls and need a little OBS setup. Configure the
fields under **Advanced** in the inspector (also shared across keys).

- **Save Screenshot** — set a **Screenshot folder**. Saves the current program
  scene to `telestrator_<timestamp>.png` there.
- **Toggle Freeze** — add a **Freeze** filter (from
  [StreamFX](https://github.com/Xaymar/obs-StreamFX)) to a source, then set
  **Freeze source** / **Freeze filter**. The key toggles that filter — freeze the
  shot, telestrate, unfreeze.
- **Instant Replay + Markup** — the marquee feature:
  1. Enable OBS **Replay Buffer** (Settings → Output → Replay Buffer).
  2. Make a **Replay** scene containing a **Media Source** (e.g. `ReplayClip`)
     and a **Telestrator** source on top.
  3. In the inspector set **Replay scene**, **Replay media source**, and your
     **Live scene**.
  4. Press the key: it saves the buffer, loads the clip into the media source,
     and cuts to the Replay scene so you can draw on the replay. Use a **Go Live**
     key to cut back.

---

## How it works

```
Stream Deck key  ──►  this plugin (Node/JS in Stream Deck)  ──obs-websocket v5──►  OBS
                                                                                    │
                                                          TriggerHotkeyByName  ─────┤──►  whiteboard.lua
                                                          SaveSourceScreenshot ─────┤
                                                          SaveReplayBuffer / ... ───┘
```

- `sha256.js` — dependency-free SHA-256 for the obs-websocket auth handshake
  (the plugin page runs from `file://`, where `crypto.subtle` is often
  unavailable). Validated against Node's `crypto`.
- `obs-ws.js` — minimal obs-websocket v5 client (Hello/Identify + request/response).
- `plugin.js` — Stream Deck wiring + command dispatch.
- `pi.js` / `pi.html` — the property inspector (per-key command + shared settings).

## License

[MIT](LICENSE). Built to drive
[obs-telestrator](https://github.com/brendanwelsh/obs-telestrator), a fork of
katarai/obs-whiteboard-lua (originally mwelsh/Tari).
