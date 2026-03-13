import { debug, warn } from '#parlante/utils/system/logger';
import { buildNodeConfig } from '#parlante/structures/kazagumo';

export type MixLayer = {
  id: string;
  track: { encoded: string };
  volume: number;
};

type MixLayerResponse = {
  id: string;
  track: { encoded: string };
  volume: number;
};

type MixErrorResponse = {
  message?: string;
};

function buildMixUrl(sessionId: string, guildId: string): { url: string; auth: string } {
  const cfg = buildNodeConfig();
  const protocol = cfg.secure ? 'https' : 'http';
  const baseUrl = `${protocol}://${cfg.url}`;
  return {
    url: `${baseUrl}/v4/sessions/${sessionId}/players/${guildId}/mix`,
    auth: cfg.auth,
  };
}

export async function addMixLayer(
  sessionId: string,
  guildId: string,
  encodedTrack: string,
  volume: number,
): Promise<MixLayer | null> {
  const { url, auth } = buildMixUrl(sessionId, guildId);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ track: { encoded: encodedTrack }, volume }),
    });

    if (response.ok) {
      const data = (await response.json()) as MixLayerResponse;
      debug(`[${guildId}] Mix layer added: ${data.id}`);
      return { id: data.id, track: data.track, volume: data.volume };
    }

    const errorBody = (await response.json().catch(() => ({}))) as MixErrorResponse;
    warn(`[${guildId}] Mix layer POST failed (${response.status}): ${errorBody.message ?? ''}`);
    return null;
  } catch (err) {
    warn(`[${guildId}] Mix layer POST request failed`, err);
    return null;
  }
}

export async function listMixLayers(sessionId: string, guildId: string): Promise<MixLayer[]> {
  const { url, auth } = buildMixUrl(sessionId, guildId);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth },
    });

    if (response.ok) {
      return (await response.json()) as MixLayer[];
    }

    debug(`[${guildId}] Mix layer GET failed (${response.status})`);
    return [];
  } catch (err) {
    debug(`[${guildId}] Mix layer GET request failed`, err);
    return [];
  }
}

export async function deleteMixLayer(
  sessionId: string,
  guildId: string,
  mixId: string,
): Promise<boolean> {
  const { url, auth } = buildMixUrl(sessionId, guildId);

  try {
    const response = await fetch(`${url}/${mixId}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });

    if (response.ok) {
      debug(`[${guildId}] Mix layer deleted: ${mixId}`);
      return true;
    }

    debug(`[${guildId}] Mix layer DELETE failed (${response.status}) for ${mixId}`);
    return false;
  } catch (err) {
    debug(`[${guildId}] Mix layer DELETE request failed for ${mixId}`, err);
    return false;
  }
}

export async function deleteAllMixLayers(sessionId: string, guildId: string): Promise<void> {
  const layers = await listMixLayers(sessionId, guildId);
  if (layers.length === 0) return;

  debug(`[${guildId}] Cleaning up ${layers.length} mix layer(s)`);
  await Promise.allSettled(layers.map((layer) => deleteMixLayer(sessionId, guildId, layer.id)));
}
