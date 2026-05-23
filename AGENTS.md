# Agent Guide: mywhisper

## Core Workflow
This app is a stateful CLI utility designed to be triggered by a global hotkey. It toggles between recording and transcribing.

- **Main Entry:** `bun run index.ts` (Handles start/stop/transcribe logic)
- **State Files:** 
    - `/tmp/dictado_pid.txt`: Stores PID of active `arecord` process.
    - `/tmp/dictado.wav`: Current audio recording.
- **API Key:** Required at `~/.config/openrouter_key`.

## Developer Commands
- **Run/Toggle:** `bun run index.ts`
- **Hot Reload:** `bun --hot run index.ts`
- **Logs:** `tail -f ~/.local/state/dictado.log`
- **Cleanup:** If stuck, `rm /tmp/dictado*` and `killall arecord`.

## State Logic (`index.ts`)
The script determines its action based on file presence:
1. **No PID file + No Audio file** -> Starts recording (spawns `arecord`).
2. **PID file exists** -> Kills `arecord` process -> Transcribes the audio.
3. **No PID file + Audio file exists** -> Transcribes (used for recovery).

## Critical System Dependencies
The script relies on these CLI tools being in the PATH:
- `arecord`: Audio recording.
- `paplay`: Feedback sounds (PulseAudio).
- `xsel`: Clipboard management.
- `xdotool`: Simulating `Ctrl+V` to paste the result.

## Configuration
- `config.json`: Automatically created in the project root on first run if missing.
- `config.ts`: Defines `DEFAULT_CONFIG` and handles generation logic.

## Common Gotchas
- **State Mismatch**: If `arecord` is killed manually without removing the PID file, the script might attempt to transcribe a non-existent file.
- **Window Focus**: `xdotool` pastes into the currently focused window 200ms after the "end" sound plays.
- **Environment**: Bun automatically loads `.env`, but the project primarily uses `~/.config/openrouter_key` for authentication.
