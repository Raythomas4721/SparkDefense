import { MAPS } from '../data/map';
import type { Vec2 } from '../types';

export interface PathData {
  points: readonly Vec2[];
  /** cumulative[i]：從起點到第 i 個節點的距離 */
  cumulative: readonly number[];
  length: number;
}

export function buildPath(points: readonly Vec2[]): PathData {
  if (points.length < 2) throw new Error('路線至少要有兩個節點');
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + distance(points[i - 1]!, points[i]!));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1]! };
}

const pathCache = new Map<string, PathData>();

export function getPath(mapId: string): PathData {
  let path = pathCache.get(mapId);
  if (!path) {
    const map = MAPS[mapId];
    if (!map) throw new Error(`找不到地圖：${mapId}`);
    path = buildPath(map.path);
    pathCache.set(mapId, path);
  }
  return path;
}

/** 找出距離 d 落在哪一段：回傳該段起點索引與段內比例 */
function locate(path: PathData, d: number): { i: number; t: number } {
  const clamped = Math.min(Math.max(d, 0), path.length);
  let i = 0;
  while (i < path.points.length - 2 && path.cumulative[i + 1]! < clamped) i++;
  const segLength = path.cumulative[i + 1]! - path.cumulative[i]!;
  const t = segLength === 0 ? 0 : (clamped - path.cumulative[i]!) / segLength;
  return { i, t };
}

/** 沿路線走 d 距離時的座標（超出範圍會夾在起點或終點） */
export function positionAt(path: PathData, d: number): Vec2 {
  const { i, t } = locate(path, d);
  const a = path.points[i]!;
  const b = path.points[i + 1]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 沿路線走 d 距離時的前進方向（單位向量） */
export function tangentAt(path: PathData, d: number): Vec2 {
  const { i } = locate(path, d);
  const a = path.points[i]!;
  const b = path.points[i + 1]!;
  const len = distance(a, b) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
