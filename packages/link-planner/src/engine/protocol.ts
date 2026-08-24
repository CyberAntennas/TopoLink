import type { GeoPoint, RadioConfiguration } from '../domain/types';
import type { LinkBudgetResult, TerrainProfileInput, TerrainProfileResult } from './rfMath';

export interface DistanceRequest {
  id: number;
  type: 'distance';
  pointA: GeoPoint;
  pointB: GeoPoint;
}

export interface FresnelRequest {
  id: number;
  type: 'fresnel';
  frequencyMHz: number;
  distanceFromAMeters: number;
  distanceFromBMeters: number;
}

export interface LinkBudgetRequest {
  id: number;
  type: 'link-budget';
  radio: RadioConfiguration;
  distanceMeters: number;
}

export interface TerrainProfileRequest {
  id: number;
  type: 'terrain-profile';
  input: TerrainProfileInput;
}

export type PlannerWorkerRequest = DistanceRequest | FresnelRequest | LinkBudgetRequest | TerrainProfileRequest;

export interface PlannerWorkerSuccess {
  id: number;
  ok: true;
  value: number | LinkBudgetResult | TerrainProfileResult;
}

export interface PlannerWorkerFailure {
  id: number;
  ok: false;
  error: string;
}

export type PlannerWorkerResponse = PlannerWorkerSuccess | PlannerWorkerFailure;
