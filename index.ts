import { $ } from "bun";
import fs from "fs/promises";
import { homedir } from "os";
import { isTranscriptionResult } from "./types.ts";
import { log, errorMessage } from "./utils.ts";
import { loadConfig } from "./config.ts";
import { volumeToPaplay, getRecordingPid, audioFileExists } from "./audio.ts";

await log("--- Script begins execution ---");

const config = await loadConfig();

const KEY_PATH = `${homedir()}/.config/openrouter_key`;
let API_KEY = "";

try {
    const rawKey = await fs.readFile(KEY_PATH, "utf8");
    API_KEY = rawKey.trim();
} catch (error) {
    await log(`FATAL ERROR: No se pudo leer la API Key en: ${KEY_PATH}`);
    process.exit(1);
}

const pid = await getRecordingPid(config.paths.pidFile);
const hasAudio = await audioFileExists(config.paths.audioFile);

const paplayVolume = volumeToPaplay(config.sounds.volume);

if (pid) {
    await log(`Active recording found (PID: ${pid}). Stopping recording...`);
    await $`kill -INT ${pid}`.quiet().nothrow();
    await fs.unlink(config.paths.pidFile).catch(() => {});
    await log("Stopped recording successfully.");
}

if (!pid && !hasAudio) {
    await $`paplay --volume=${paplayVolume} ${config.sounds.start}`.quiet().nothrow();

    const proc = Bun.spawn(
        [
            "arecord",
            "-f",
            config.arecord.format,
            "-c",
            config.arecord.channels.toString(),
            "-r",
            config.arecord.rate.toString(),
            "-d",
            config.maxDuration.toString(),
            config.paths.audioFile,
        ],
        {
            // Explicitly ignoring streams ensures arecord detaches completely
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
        },
    );

    await fs.writeFile(config.paths.pidFile, proc.pid.toString());
    await log(
        `Started recording (PID: ${proc.pid}). Max duration: ${config.maxDuration}s. Audio saving to ${config.paths.audioFile}`,
    );
    process.exit(0);
}

try {
    const file = Bun.file(config.paths.audioFile);
    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    const payload = {
        model: config.model,
        input_audio: {
            data: base64Audio,
            format: "wav",
        },
    };

    await log("Sending audio payload to OpenRouter...");
    const response = await fetch(
        "https://openrouter.ai/api/v1/audio/transcriptions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        await log(
            `ERROR: OpenRouter request failed. HTTP ${response.status} - ${errorText}`,
        );
        throw new Error(`HTTP ${response.status} - ${errorText}`);
    }

    const result: unknown = await response.json();
    await log(`Response received from OpenRouter. Success: true`);

    if (isTranscriptionResult(result)) {
        const textoLimpio = result.text.trim();
        await log(`Transcript result: "${textoLimpio}"`);

        const clipProc = Bun.spawn(
            ["xsel", "--clipboard", "--input"],
            { stdin: "pipe" },
        );
        clipProc.stdin.write(textoLimpio);
        clipProc.stdin.flush();
        clipProc.stdin.end(); // This sends the EOF immediately!
        await clipProc.exited; // Wait for it to close (should be instant now)

        await $`paplay --volume=${paplayVolume} ${config.sounds.end}`.quiet()
            .nothrow();

        await Bun.sleep(200);
        await $`xdotool key "ctrl+v"`.quiet().nothrow();
        await log("Transcript pasted via xdotool successfully.");

        await fs.unlink(config.paths.audioFile).catch(() => {});
        await fs.unlink(config.paths.pidFile).catch(() => {});
        process.exit(0);
    } else {
        await log(
            "ERROR: API returned a successful response but no 'text' field was found in the JSON.",
        );
        throw new Error("La API devolvio un JSON sin texto.");
    }
} catch (error) {
    await log(`FATAL ERROR: ${errorMessage(error)}`);
    process.exit(1);
}
