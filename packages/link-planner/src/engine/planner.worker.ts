/// <reference lib="webworker" />

import {
  analyzeTerrainProfile,
  calculateLinkBudget,
  firstFresnelRadiusMeters,
  haversineDistanceMeters,
  type TerrainProfileResult,
} from './rfMath';
import type { PlannerWorkerRequest, PlannerWorkerResponse } from './protocol';

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<PlannerWorkerRequest>) => {
  const request = event.data;
  let response: PlannerWorkerResponse;

  try {
    const value = (() => {
      switch (request.type) {
        case 'distance':
          return haversineDistanceMeters(request.pointA, request.pointB);
        case 'fresnel':
          return firstFresnelRadiusMeters(
            request.frequencyMHz,
            request.distanceFromAMeters,
            request.distanceFromBMeters,
          );
        case 'link-budget':
          return calculateLinkBudget(request.radio, request.distanceMeters);
        case 'terrain-profile':
          return analyzeTerrainProfile(request.input);
      }
    })();
    response = { id: request.id, ok: true, value };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown calculation failure',
    };
  }

  const transfer = response.ok && typeof response.value === 'object' && 'clearanceMeters' in response.value
    ? Object.values(response.value as TerrainProfileResult)
        .filter((value): value is Float32Array => value instanceof Float32Array)
        .map((value) => value.buffer)
    : [];
  workerScope.postMessage(response, transfer);
});
