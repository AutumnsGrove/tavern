/**
 * Transport-agnostic message types. Adapters convert platform-specific
 * I/O into these standard shapes. The engine only sees these types.
 */

export interface InboundMsg {
  text: string;
  audio?: ArrayBuffer;
  chatId: string;
  adapterName: string;
  timestamp: Date;
  /** Inline keyboard callback data (when a fork button is tapped) */
  callbackData?: string;
}

export interface OutboundMsg {
  text: string;
  forks?: Fork[];
  traceText?: string;
  isError?: boolean;
}

export interface Fork {
  label: string;
  detail: string;
}

export interface CapSet {
  inlineKeyboard: boolean;
  messageEdit: boolean;
  streaming: boolean;
  voice: boolean;
  typing: boolean;
}
