export type LongitudeLatitude = [number, number];
export type RoofGridSegment = [number, number, number, number];

export interface RoofGridGeometry {
  anchor: LongitudeLatitude;
  segments: RoofGridSegment[];
}

function toLocalMeters(point: LongitudeLatitude, anchor: LongitudeLatitude): [number, number] {
  const latitudeRadians = anchor[1] * Math.PI / 180;
  return [
    (point[0] - anchor[0]) * 111_320 * Math.cos(latitudeRadians),
    (point[1] - anchor[1]) * 110_540,
  ];
}

function intersectionsAt(value: number, ring: [number, number][], vertical: boolean): number[] {
  const intersections: number[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index]!;
    const b = ring[index + 1]!;
    const axisA = vertical ? a[0] : a[1];
    const axisB = vertical ? b[0] : b[1];
    if ((axisA > value) === (axisB > value) || axisA === axisB) continue;
    const fraction = (value - axisA) / (axisB - axisA);
    intersections.push((vertical ? a[1] : a[0]) + ((vertical ? b[1] : b[0]) - (vertical ? a[1] : a[0])) * fraction);
  }
  return intersections.sort((a, b) => a - b);
}

export function createOneMeterRoofGrid(footprint: readonly LongitudeLatitude[]): RoofGridGeometry | undefined {
  if (footprint.length < 4) return undefined;
  const anchor = footprint[0]!;
  const ring = footprint.map((point) => toLocalMeters(point, anchor));
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  const segments: RoofGridSegment[] = [];
  for (let x = Math.ceil(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x += 1) {
    const intersections = intersectionsAt(x, ring, true);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      segments.push([x, intersections[index]!, x, intersections[index + 1]!]);
    }
  }
  for (let y = Math.ceil(Math.min(...ys)); y <= Math.floor(Math.max(...ys)); y += 1) {
    const intersections = intersectionsAt(y, ring, false);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      segments.push([intersections[index]!, y, intersections[index + 1]!, y]);
    }
  }
  return { anchor, segments: segments.slice(0, 2_000) };
}

export function snapToOneMeterRoofGrid(
  longitude: number,
  latitude: number,
  footprint: readonly LongitudeLatitude[],
): LongitudeLatitude {
  const anchor = footprint[0];
  if (!anchor) return [longitude, latitude];
  const [x, y] = toLocalMeters([longitude, latitude], anchor);
  const latitudeRadians = anchor[1] * Math.PI / 180;
  return [
    anchor[0] + Math.round(x) / (111_320 * Math.cos(latitudeRadians)),
    anchor[1] + Math.round(y) / 110_540,
  ];
}
