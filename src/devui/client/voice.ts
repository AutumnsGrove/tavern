// Voice recording

import { voiceBtn, state } from "./dom.js";
import { addPlayerMessage } from "./messages.js";

export function initVoiceHandlers(): void {
  voiceBtn.addEventListener("mousedown", startRecording);
  voiceBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
  voiceBtn.addEventListener("mouseup", stopRecording);
  voiceBtn.addEventListener("mouseleave", stopRecording);
  voiceBtn.addEventListener("touchend", stopRecording);
}

async function startRecording(): Promise<void> {
  if (state.isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    state.mediaRecorder = new MediaRecorder(stream, { mimeType });
    state.audioChunks = [];

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (state.audioChunks.length === 0) return;
      const blob = new Blob(state.audioChunks, { type: "audio/webm" });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      addPlayerMessage("🎤 [Voice memo]");
      if (state.ws) {
        state.ws.send(JSON.stringify({ type: "voice", audio: btoa(binary) }));
      }
    };

    state.mediaRecorder.start();
    state.isRecording = true;
    voiceBtn.classList.add("recording");
  } catch (err) {
    console.error("Mic access denied:", err);
  }
}

function stopRecording(): void {
  if (!state.isRecording || !state.mediaRecorder) return;
  state.isRecording = false;
  voiceBtn.classList.remove("recording");
  state.mediaRecorder.stop();
}
