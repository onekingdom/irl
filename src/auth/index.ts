import { nanoid } from "nanoid";
import { config } from "../config";
import { getUsedInputPorts, getUsedRelayPorts } from "../db";

export function generateStreamKey(): string {
  return nanoid(16);
}

export function validatePassphrase(passphrase: string): { valid: boolean; error?: string } {
  if (passphrase.length < 10) {
    return { valid: false, error: "Passphrase must be at least 10 characters (SRT requirement)" };
  }
  if (passphrase.length > 79) {
    return { valid: false, error: "Passphrase must be at most 79 characters (SRT requirement)" };
  }
  return { valid: true };
}

export function allocateInputPort(requestedPort?: number): { port: number; error?: string } {
  const usedPorts = new Set(getUsedInputPorts());

  if (requestedPort !== undefined) {
    if (requestedPort < config.srtInputPortStart || requestedPort > config.srtInputPortEnd) {
      return { port: 0, error: `Port must be between ${config.srtInputPortStart} and ${config.srtInputPortEnd}` };
    }
    if (usedPorts.has(requestedPort)) {
      return { port: 0, error: `Port ${requestedPort} is already in use` };
    }
    return { port: requestedPort };
  }

  for (let port = config.srtInputPortStart; port <= config.srtInputPortEnd; port++) {
    if (!usedPorts.has(port)) {
      return { port };
    }
  }

  return { port: 0, error: "No available input ports in the configured range" };
}

export function allocateRelayPort(requestedPort?: number): { port: number; error?: string } {
  const usedPorts = new Set(getUsedRelayPorts());

  if (requestedPort !== undefined) {
    if (requestedPort < config.srtRelayPortStart || requestedPort > config.srtRelayPortEnd) {
      return { port: 0, error: `Relay port must be between ${config.srtRelayPortStart} and ${config.srtRelayPortEnd}` };
    }
    if (usedPorts.has(requestedPort)) {
      return { port: 0, error: `Relay port ${requestedPort} is already in use` };
    }
    return { port: requestedPort };
  }

  for (let port = config.srtRelayPortStart; port <= config.srtRelayPortEnd; port++) {
    if (!usedPorts.has(port)) {
      return { port };
    }
  }

  return { port: 0, error: "No available relay ports in the configured range" };
}
