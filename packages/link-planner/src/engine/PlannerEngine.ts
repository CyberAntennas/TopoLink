import InlinePlannerWorker from './planner.worker?worker&inline';
import type { GeoPoint, RadioConfiguration } from '../domain/types';
import type { PlannerWorkerRequest, PlannerWorkerResponse } from './protocol';
import {
  analyzeTerrainProfile,
  calculateLinkBudget,
  firstFresnelRadiusMeters,
  haversineDistanceMeters,
  type LinkBudgetResult,
  type TerrainProfileInput,
  type TerrainProfileResult,
} from './rfMath';

type PlannerWorkerRequestWithoutId = PlannerWorkerRequest extends infer Request
  ? Request extends PlannerWorkerRequest
    ? Omit<Request, 'id'>
    : never
  : never;

export interface PlannerEngine {
  distanceMeters(pointA: GeoPoint, pointB: GeoPoint): Promise<number>;
  fresnelRadiusMeters(frequencyMHz: number, distanceFromAMeters: number, distanceFromBMeters: number): Promise<number>;
  linkBudget(radio: RadioConfiguration, distanceMeters: number): Promise<LinkBudgetResult>;
  terrainProfile(input: TerrainProfileInput): Promise<TerrainProfileResult>;
  destroy(): void;
}

export function createPlannerEngine(): PlannerEngine {
  if (typeof Worker === 'undefined') {
    return {
      distanceMeters: async (pointA, pointB) => haversineDistanceMeters(pointA, pointB),
      fresnelRadiusMeters: async (frequencyMHz, distanceFromAMeters, distanceFromBMeters) =>
        firstFresnelRadiusMeters(frequencyMHz, distanceFromAMeters, distanceFromBMeters),
      linkBudget: async (radio, distanceMeters) => calculateLinkBudget(radio, distanceMeters),
      terrainProfile: async (input) => analyzeTerrainProfile(input),
      destroy() {},
    };
  }
  const worker = new InlinePlannerWorker();
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let nextRequestId = 1;

  worker.addEventListener('message', (event: MessageEvent<PlannerWorkerResponse>) => {
    const callback = pending.get(event.data.id);
    if (!callback) return;
    pending.delete(event.data.id);
    if (event.data.ok) callback.resolve(event.data.value);
    else callback.reject(new Error(event.data.error));
  });

  const request = <Result>(payload: PlannerWorkerRequestWithoutId, transfer: Transferable[] = []): Promise<Result> => {
    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ ...payload, id }, transfer);
    });
  };

  return {
    distanceMeters: (pointA, pointB) => request<number>({ type: 'distance', pointA, pointB }),
    fresnelRadiusMeters: (frequencyMHz, distanceFromAMeters, distanceFromBMeters) =>
      request<number>({ type: 'fresnel', frequencyMHz, distanceFromAMeters, distanceFromBMeters }),
    linkBudget: (radio, distanceMeters) =>
      request<LinkBudgetResult>({ type: 'link-budget', radio, distanceMeters }),
    terrainProfile(input) {
      const transferableInput: TerrainProfileInput = {
        ...input,
        distancesMeters: new Float32Array(input.distancesMeters),
        elevationsMeters: new Float32Array(input.elevationsMeters),
      };
      return request<TerrainProfileResult>(
        { type: 'terrain-profile', input: transferableInput },
        [transferableInput.distancesMeters.buffer, transferableInput.elevationsMeters.buffer],
      );
    },
    destroy() {
      worker.terminate();
      for (const callback of pending.values()) {
        callback.reject(new Error('Planner engine was destroyed'));
      }
      pending.clear();
    },
  };
}
