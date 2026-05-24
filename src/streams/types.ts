export type StreamStatus = "inactive" | "listening" | "live";
export type OutputProtocol = "srt" | "rtmp" | "ndi";
export type OutputMode = "relay" | "push";
export type CodecMode = "copy" | "transcode";

export interface Stream {
  id: string;
  name: string;
  streamKey: string;
  passphrase: string;
  listenPort: number;
  latencyMs: number;
  status: StreamStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StreamOutput {
  id: string;
  streamId: string;
  name: string;
  protocol: OutputProtocol;
  mode: OutputMode;
  url: string | null;
  relayPort: number | null;
  passphrase: string | null;
  ndiName: string | null;
  enabled: boolean;
  codecMode: CodecMode;
  createdAt: string;
}

export interface CreateStreamInput {
  name: string;
  passphrase: string;
  listenPort?: number;
  latencyMs?: number;
}

export interface UpdateStreamInput {
  name?: string;
  passphrase?: string;
  latencyMs?: number;
}

export interface CreateOutputInput {
  name: string;
  protocol: OutputProtocol;
  mode: OutputMode;
  url?: string;
  relayPort?: number;
  passphrase?: string;
  ndiName?: string;
  enabled?: boolean;
  codecMode?: CodecMode;
}

export interface UpdateOutputInput {
  name?: string;
  url?: string;
  passphrase?: string;
  ndiName?: string;
  enabled?: boolean;
  codecMode?: CodecMode;
}

export interface StreamWithOutputs extends Stream {
  outputs: StreamOutput[];
}
