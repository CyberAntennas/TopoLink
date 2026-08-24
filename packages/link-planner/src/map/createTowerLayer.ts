import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl';
import * as THREE from 'three';
import type { LinkPlannerWorkspace, Site } from '../domain/types';
import { firstFresnelRadiusMeters, maximumFreeSpaceRangeMeters } from '../engine/rfMath';
import { getCyberAntennaProduct, type CyberAntennaProduct } from '../products/cyberAntennasCatalog';
import { antennaBeamPattern, rfFrequencyColorHex } from './rfVisualization';
import type { BuildingLinkObstacle } from './buildingObstacles';
import { createOneMeterRoofGrid, type LongitudeLatitude } from './roofGrid';

export interface RoofGridSelection {
  longitude: number;
  latitude: number;
  baseElevationMeters: number;
  roofHeightMeters: number;
  footprint: LongitudeLatitude[];
}

export interface TowerLayerHandle {
  layer: CustomLayerInterface;
  updateWorkspace(workspace: LinkPlannerWorkspace): void;
  setVisible(visible: boolean): void;
  setLinksVisible(visible: boolean): void;
  setObstacles(obstacles: readonly BuildingLinkObstacle[]): void;
  setRoofGrid(selection?: RoofGridSelection): void;
}

function baseHeight(site: Site): number {
  return site.location.elevationMeters + (site.mounting?.surface === 'rooftop' ? site.mounting.buildingHeightMeters : 0);
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return mesh;
}

function radiationLobe(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  azimuthBeamwidthDegrees: number,
  elevationBeamwidthDegrees: number,
  color: number,
): THREE.Group {
  const azimuthRadius = Math.max(0.35, length * Math.tan(THREE.MathUtils.degToRad(azimuthBeamwidthDegrees / 2)));
  const elevationRadius = Math.max(0.35, length * Math.tan(THREE.MathUtils.degToRad(elevationBeamwidthDegrees / 2)));
  const group = new THREE.Group();
  const segments = 48;
  const vertices: number[] = [0, 0, 0, length, 0, 0];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    vertices.push(length, Math.cos(angle) * azimuthRadius, Math.sin(angle) * elevationRadius);
  }
  const indices: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const current = 2 + index;
    const next = 2 + ((index + 1) % segments);
    indices.push(0, current, next, 1, next, current);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.24,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lobe = new THREE.Mesh(geometry, material);
  const unitDirection = direction.clone().normalize();
  group.add(lobe);

  const outlineVertices: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const nextAngle = ((index + 1) / segments) * Math.PI * 2;
    outlineVertices.push(
      length, Math.cos(angle) * azimuthRadius, Math.sin(angle) * elevationRadius,
      length, Math.cos(nextAngle) * azimuthRadius, Math.sin(nextAngle) * elevationRadius,
    );
    if (index % 12 === 0) {
      outlineVertices.push(0, 0, 0, length, Math.cos(angle) * azimuthRadius, Math.sin(angle) * elevationRadius);
    }
  }
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outlineVertices, 3));
  const outline = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82, depthTest: true, depthWrite: false }));
  group.add(outline);
  group.position.copy(start);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), unitDirection);
  group.name = 'antenna-radiation-pattern';
  return group;
}

function rangeSegment(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  maximumRangeMeters: number,
  pathLengthMeters: number,
  color: number,
): THREE.Line {
  const visibleLength = Math.min(maximumRangeMeters, pathLengthMeters);
  const end = start.clone().addScaledVector(direction.clone().normalize(), visibleLength);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: 8,
    gapSize: 5,
    transparent: true,
    opacity: maximumRangeMeters >= pathLengthMeters ? 0.9 : 0.72,
    depthTest: true,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.name = 'calculated-radio-range';
  return line;
}

function productSkinTexture(image: HTMLImageElement): THREE.CanvasTexture {
  const maximumSourceSize = 1024;
  const sourceScale = Math.min(1, maximumSourceSize / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * sourceScale));
  const height = Math.max(1, Math.round(image.naturalHeight * sourceScale));
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is unavailable for product texture processing');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let readIndex = 0;
  let writeIndex = 0;

  const isBackground = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const red = pixels.data[offset]!;
    const green = pixels.data[offset + 1]!;
    const blue = pixels.data[offset + 2]!;
    return pixels.data[offset + 3]! < 8 || (red > 232 && green > 232 && blue > 232 && Math.max(red, green, blue) - Math.min(red, green, blue) < 24);
  };
  const enqueue = (pixelIndex: number) => {
    if (visited[pixelIndex] || !isBackground(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[writeIndex] = pixelIndex;
    writeIndex += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex]!;
    readIndex += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (visited[pixelIndex]) pixels.data[offset + 3] = 0;
    if (pixels.data[offset + 3]! < 8) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  context.putImageData(pixels, 0, 0);

  const output = document.createElement('canvas');
  output.width = 512;
  output.height = 512;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Canvas 2D context is unavailable for centered product texture');
  const cropWidth = Math.max(1, maxX - minX + 1);
  const cropHeight = Math.max(1, maxY - minY + 1);
  const scale = Math.min(430 / cropWidth, 430 / cropHeight);
  const drawWidth = cropWidth * scale;
  const drawHeight = cropHeight * scale;
  outputContext.drawImage(source, minX, minY, cropWidth, cropHeight, (512 - drawWidth) / 2, (512 - drawHeight) / 2, drawWidth, drawHeight);

  const texture = new THREE.CanvasTexture(output);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.center.set(0.5, 0.5);
  texture.anisotropy = 4;
  return texture;
}

function deviceBody(product: CyberAntennaProduct, texture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x34434a, metalness: 0.45, roughness: 0.42, depthTest: false, depthWrite: false });
  const housing = new THREE.MeshPhysicalMaterial({
    color: product.formFactor === 'accessory' ? 0x4a565c : 0xe8eceb,
    metalness: product.formFactor === 'dish' ? 0.5 : 0.12,
    roughness: 0.34,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    depthTest: false,
    depthWrite: false,
  });
  const decalMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthTest: false,
    depthWrite: false,
  });
  const width = product.formFactor === 'dish'
    ? product.diameterMeters ?? 1.2
    : product.formFactor === 'horn'
      ? product.id.startsWith('DOUBLE') ? 2.1 : 1.45
      : product.formFactor === 'accessory' ? 0.68 : 1.05;
  const depth = product.formFactor === 'horn' ? width * 0.72 : product.formFactor === 'dish' ? width * 0.24 : width * 0.42;
  const height = width * (product.formFactor === 'panel' ? 0.76 : 1);
  let body: THREE.Mesh;
  if (product.formFactor === 'horn') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.5, width * 0.32, depth, 12, 2, false), housing);
    body.rotation.z = -Math.PI / 2;
  } else if (product.formFactor === 'dish') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.48, width * 0.44, depth, 48, 2, false), housing);
    body.rotation.z = -Math.PI / 2;
  } else if (product.formFactor === 'accessory') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.42, width * 0.42, depth, 24), housing);
    body.rotation.z = -Math.PI / 2;
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(depth, width, height), housing);
  }
  body.position.x = 0.62 + depth / 2;
  body.name = 'closed-product-housing';
  group.add(body);

  const decalGeometry = new THREE.PlaneGeometry(width * 0.92, height * 0.92);
  const frontDecal = new THREE.Mesh(decalGeometry, decalMaterial);
  frontDecal.position.x = 0.62 + depth + 0.008;
  frontDecal.rotation.y = Math.PI / 2;
  frontDecal.name = 'centered-product-front-decal';
  group.add(frontDecal);

  const backDecal = new THREE.Mesh(decalGeometry.clone(), decalMaterial.clone());
  (backDecal.material as THREE.MeshBasicMaterial).map = texture;
  backDecal.position.x = 0.612;
  backDecal.rotation.y = -Math.PI / 2;
  backDecal.name = 'centered-product-back-decal';
  group.add(backDecal);

  const boom = cylinderBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.62, 0, 0), 0.055, dark);
  const upperBrace = cylinderBetween(new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0.58, 0, width * 0.28), 0.032, dark);
  const lowerBrace = cylinderBetween(new THREE.Vector3(0, 0, -0.22), new THREE.Vector3(0.58, 0, -width * 0.28), 0.032, dark);
  group.add(boom, upperBrace, lowerBrace);

  const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 10, 24), dark);
  clamp.name = 'tower-mast-clamp';
  group.add(clamp);
  return group;
}

function towerModel(site: Site, texture: THREE.Texture): THREE.Group {
  const tower = new THREE.Group();
  const height = Math.max(2, site.antennaHeightMeters);
  const sectionHeight = 3;
  const sections = Math.max(1, Math.ceil(height / sectionHeight));
  const steel = new THREE.MeshStandardMaterial({ color: 0xe8ecee, metalness: 0.82, roughness: 0.3, depthTest: false, depthWrite: false });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe04e3f, metalness: 0.5, roughness: 0.35, depthTest: false, depthWrite: false });
  const foundation = new THREE.MeshStandardMaterial({ color: 0x68777d, metalness: 0.2, roughness: 0.78, depthTest: false, depthWrite: false });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 0.35), foundation);
  pad.position.z = 0.175;
  tower.add(pad);

  const corners = (z: number) => {
    const ratio = 1 - z / height;
    const half = 0.35 + ratio * 0.9;
    return [
      new THREE.Vector3(-half, -half, z),
      new THREE.Vector3(half, -half, z),
      new THREE.Vector3(half, half, z),
      new THREE.Vector3(-half, half, z),
    ];
  };

  if (site.mounting?.surface === 'ground') {
    tower.add(cylinderBetween(
      new THREE.Vector3(0, 0, 0.35),
      new THREE.Vector3(0, 0, height),
      0.1,
      steel,
    ));
  } else {
    for (let section = 0; section < sections; section += 1) {
      const z0 = Math.min(height, section * sectionHeight);
      const z1 = Math.min(height, (section + 1) * sectionHeight);
      const lower = corners(z0);
      const upper = corners(z1);
      const material = section % 2 === 0 ? accent : steel;
      for (let index = 0; index < 4; index += 1) {
        const next = (index + 1) % 4;
        tower.add(cylinderBetween(lower[index]!, upper[index]!, 0.075, material));
        tower.add(cylinderBetween(lower[index]!, lower[next]!, 0.045, steel));
        tower.add(cylinderBetween(lower[index]!, upper[next]!, 0.035, steel));
      }
    }
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 12), steel);
  mast.rotation.x = Math.PI / 2;
  mast.position.z = height + 0.8;
  tower.add(mast);

  const product = getCyberAntennaProduct(site.device?.productId);
  const device = deviceBody(product, texture);
  device.position.z = height + 0.9;
  device.rotation.z = THREE.MathUtils.degToRad(-(site.device?.azimuthDegrees ?? 0));
  device.rotation.y = THREE.MathUtils.degToRad(site.device?.tiltDegrees ?? 0);
  tower.add(device);
  return tower;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

export function createTowerLayer(
  maplibre: typeof import('maplibre-gl'),
  initialWorkspace: LinkPlannerWorkspace,
): TowerLayerHandle {
  let map: MapLibreMap | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let renderCount = 0;
  let workspace = initialWorkspace;
  let visible = true;
  let linksVisible = true;
  let obstacles: readonly BuildingLinkObstacle[] = [];
  let roofGridSelection: RoofGridSelection | undefined;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const models = new THREE.Group();
  const towerEntries: Array<{ tower: THREE.Group; mapMatrix: THREE.Matrix4 }> = [];
  const textures = new Map<string, THREE.Texture>();
  scene.add(models);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x53646c, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 3.4);
  sun.position.set(-80, -120, 180);
  scene.add(sun);

  const rebuild = () => {
    for (const child of [...models.children]) {
      models.remove(child);
      disposeObject(child);
    }
    towerEntries.length = 0;
    if (map) map.getContainer().dataset.radiationPatterns = String(workspace.links.length * 2);
    const siteById = new Map(workspace.sites.map((site) => [site.id, site]));
    const entryBySiteId = new Map<string, { tower: THREE.Group; coordinate: import('maplibre-gl').MercatorCoordinate; scale: number }>();
    for (const site of workspace.sites) {
      const product = getCyberAntennaProduct(site.device?.productId);
      let texture = textures.get(product.imageUrl);
      if (!texture) {
        let loadedTexture: THREE.Texture;
        loadedTexture = new THREE.TextureLoader().load(product.imageUrl, (imageTexture) => {
          if (!map) return;
          try {
            const preparedTexture = productSkinTexture(imageTexture.image as HTMLImageElement);
            textures.set(product.imageUrl, preparedTexture);
            loadedTexture.dispose();
            rebuild();
          } catch (error) {
            map.getContainer().dataset.productTextureError = error instanceof Error ? error.message : 'Unable to process product texture';
            map.triggerRepaint();
          }
        });
        texture = loadedTexture;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        textures.set(product.imageUrl, texture);
      }
      const coordinate = maplibre.MercatorCoordinate.fromLngLat(
        [site.location.longitude, site.location.latitude],
        baseHeight(site),
      );
      const scale = coordinate.meterInMercatorCoordinateUnits();
      const tower = towerModel(site, texture);
      tower.userData.siteId = site.id;
      models.add(tower);
      towerEntries.push({
        tower,
        mapMatrix: new THREE.Matrix4()
          .makeTranslation(coordinate.x, coordinate.y, coordinate.z)
          .scale(new THREE.Vector3(scale, -scale, scale)),
      });
      entryBySiteId.set(site.id, { tower, coordinate, scale });
    }

    for (const link of workspace.links) {
      const a = siteById.get(link.siteAId);
      const b = siteById.get(link.siteBId);
      const aEntry = entryBySiteId.get(link.siteAId);
      if (!a || !b || !aEntry) continue;
      const aCoordinate = maplibre.MercatorCoordinate.fromLngLat(
        [a.location.longitude, a.location.latitude],
        baseHeight(a),
      );
      const bCoordinate = maplibre.MercatorCoordinate.fromLngLat(
        [b.location.longitude, b.location.latitude],
        baseHeight(b) + b.antennaHeightMeters + 0.9,
      );
      const start = new THREE.Vector3(0, 0, a.antennaHeightMeters + 0.9);
      const end = new THREE.Vector3(
        (bCoordinate.x - aCoordinate.x) / aEntry.scale,
        (bCoordinate.y - aCoordinate.y) / -aEntry.scale,
        (bCoordinate.z - aCoordinate.z) / aEntry.scale,
      );
      const path = end.clone().sub(start);
      if (path.length() < 0.1) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const linkGroup = new THREE.Group();
      linkGroup.name = 'rf-link-visual';
      linkGroup.visible = linksVisible;
      const frequencyColor = rfFrequencyColorHex(link.radio.frequencyMHz);
      linkGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: frequencyColor, linewidth: 2 })));

      const maximumRange = maximumFreeSpaceRangeMeters(link.radio);
      // Beamwidth is angular. Keep the 3D pattern local to the antenna so a
      // kilometre-scale RF range does not turn into an opaque city-scale mesh.
      const patternLength = Math.min(120, maximumRange, Math.max(45, path.length() * 0.1));
      const beamA = antennaBeamPattern(getCyberAntennaProduct(a.device?.productId), link.radio.frequencyMHz);
      const beamB = antennaBeamPattern(getCyberAntennaProduct(b.device?.productId), link.radio.frequencyMHz);
      linkGroup.add(radiationLobe(
        start,
        path,
        patternLength,
        beamA.azimuthDegrees,
        beamA.elevationDegrees,
        frequencyColor,
      ));
      linkGroup.add(radiationLobe(
        end,
        path.clone().multiplyScalar(-1),
        patternLength,
        beamB.azimuthDegrees,
        beamB.elevationDegrees,
        frequencyColor,
      ));
      linkGroup.add(rangeSegment(start, path, maximumRange, path.length(), frequencyColor));
      const fresnelRadius = firstFresnelRadiusMeters(
        link.radio.frequencyMHz,
        path.length() / 2,
        path.length() / 2,
      ) * workspace.settings.fresnelClearanceRatio;
      const fresnelMaterial = new THREE.MeshBasicMaterial({
        color: frequencyColor,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fresnelVolume = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 14), fresnelMaterial);
      fresnelVolume.name = 'fresnel-clearance-volume';
      fresnelVolume.position.copy(start).add(end).multiplyScalar(0.5);
      fresnelVolume.scale.set(path.length() / 2, fresnelRadius, fresnelRadius);
      fresnelVolume.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), path.clone().normalize());
      linkGroup.add(fresnelVolume);
      const horizontalPerpendicular = new THREE.Vector3(-path.y, path.x, 0).normalize();
      for (const obstacle of obstacles.filter((candidate) => candidate.linkId === link.id)) {
        const obstacleCoordinate = maplibre.MercatorCoordinate.fromLngLat(
          [obstacle.longitude, obstacle.latitude],
          obstacle.roofElevationMeters,
        );
        const obstaclePosition = new THREE.Vector3(
          (obstacleCoordinate.x - aCoordinate.x) / aEntry.scale,
          (obstacleCoordinate.y - aCoordinate.y) / -aEntry.scale,
          (obstacleCoordinate.z - aCoordinate.z) / aEntry.scale,
        );
        const fraction = THREE.MathUtils.clamp(obstacle.distanceFromSiteAMeters / path.length(), 0, 1);
        const pathPosition = start.clone().addScaledVector(path, fraction);
        const cutHalfWidth = Math.max(4, obstacle.requiredFresnelRadiusMeters);
        const cutGeometry = new THREE.BufferGeometry().setFromPoints([
          obstaclePosition,
          new THREE.Vector3(obstaclePosition.x, obstaclePosition.y, pathPosition.z),
          pathPosition.clone().addScaledVector(horizontalPerpendicular, -cutHalfWidth),
          pathPosition.clone().addScaledVector(horizontalPerpendicular, cutHalfWidth),
        ]);
        const cut = new THREE.LineSegments(cutGeometry, new THREE.LineBasicMaterial({
          color: obstacle.verticalClearanceMeters < 0 ? 0xef5b5b : 0xf3b34a,
          depthTest: false,
          depthWrite: false,
        }));
        cut.name = 'building-obstacle-cut';
        linkGroup.add(cut);
      }
      aEntry.tower.add(linkGroup);
    }
    if (roofGridSelection) {
      const grid = createOneMeterRoofGrid(roofGridSelection.footprint);
      if (grid) {
        const vertices: number[] = [];
        for (const segment of grid.segments) vertices.push(segment[0], segment[1], 0.12, segment[2], segment[3], 0.12);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const gridGroup = new THREE.Group();
        gridGroup.name = 'selected-roof-meter-grid';
        gridGroup.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
          color: 0xff6f66,
          transparent: true,
          opacity: 0.78,
          depthTest: false,
          depthWrite: false,
        })));
        models.add(gridGroup);
        const coordinate = maplibre.MercatorCoordinate.fromLngLat(
          grid.anchor,
          roofGridSelection.baseElevationMeters + roofGridSelection.roofHeightMeters,
        );
        const scale = coordinate.meterInMercatorCoordinateUnits();
        towerEntries.push({
          tower: gridGroup,
          mapMatrix: new THREE.Matrix4()
            .makeTranslation(coordinate.x, coordinate.y, coordinate.z)
            .scale(new THREE.Vector3(scale, -scale, scale)),
        });
      }
    }
    map?.triggerRepaint();
    if (map) map.getContainer().dataset.obstacleCuts = String(obstacles.length);
  };

  const layer: CustomLayerInterface = {
    id: 'topolink-three-devices',
    type: 'custom',
    renderingMode: '3d',
    onAdd(loadedMap, gl) {
      map = loadedMap;
      renderer = new THREE.WebGLRenderer({ canvas: loadedMap.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      loadedMap.getContainer().dataset.towerModels = String(workspace.sites.length);
      rebuild();
    },
    render(_gl, options: CustomRenderMethodInput) {
      if (!visible || !renderer) return;
      renderCount += 1;
      if (renderCount % 30 === 1) map?.getContainer().setAttribute('data-tower-renders', String(renderCount));
      renderer.resetState();
      const mapMatrix = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix);
      for (const entry of towerEntries) {
        towerEntries.forEach((candidate) => { candidate.tower.visible = candidate === entry; });
        camera.projectionMatrix.copy(mapMatrix).multiply(entry.mapMatrix);
        renderer.render(scene, camera);
      }
      towerEntries.forEach((entry) => { entry.tower.visible = true; });
      renderer.resetState();
    },
    onRemove() {
      for (const child of [...models.children]) disposeObject(child);
      textures.forEach((texture) => texture.dispose());
      renderer?.dispose();
      renderer = undefined;
      map = undefined;
    },
  };

  return {
    layer,
    updateWorkspace(nextWorkspace) {
      workspace = nextWorkspace;
      if (map) rebuild();
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      map?.triggerRepaint();
    },
    setLinksVisible(nextVisible) {
      linksVisible = nextVisible;
      models.traverse((object) => {
        if (object.name === 'rf-link-visual') object.visible = nextVisible;
      });
      map?.triggerRepaint();
    },
    setObstacles(nextObstacles) {
      obstacles = nextObstacles;
      if (map) rebuild();
    },
    setRoofGrid(selection) {
      roofGridSelection = selection;
      if (map) rebuild();
    },
  };
}
