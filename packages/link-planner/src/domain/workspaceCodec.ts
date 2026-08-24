import type { LinkPlannerWorkspace } from './types';
import { validateWorkspace } from './validation';

const JSON_BASE64_PREFIX = 'topolink-json-v1:';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export interface WorkspaceCodec {
  encode(workspace: LinkPlannerWorkspace): string;
  decode(serialized: string): LinkPlannerWorkspace;
}

/** Development codec; production persistence will replace this with Protobuf. */
export const jsonBase64WorkspaceCodec: WorkspaceCodec = {
  encode(workspace) {
    const validated = validateWorkspace(workspace);
    const bytes = new TextEncoder().encode(JSON.stringify(validated));
    return `${JSON_BASE64_PREFIX}${bytesToBase64(bytes)}`;
  },
  decode(serialized) {
    if (!serialized.startsWith(JSON_BASE64_PREFIX)) {
      throw new Error(`Unsupported workspace encoding; expected ${JSON_BASE64_PREFIX}`);
    }
    const payload = serialized.slice(JSON_BASE64_PREFIX.length);
    const decoded = new TextDecoder().decode(base64ToBytes(payload));
    return validateWorkspace(JSON.parse(decoded) as unknown);
  },
};

