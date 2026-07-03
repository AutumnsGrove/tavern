// Entry point — wire up all handlers and connect

import { initInputHandlers } from "./input.js";
import { initVoiceHandlers } from "./voice.js";
import { initPanelHandlers } from "./panel.js";
import { connect } from "./ws.js";

initInputHandlers();
initVoiceHandlers();
initPanelHandlers();
connect();
