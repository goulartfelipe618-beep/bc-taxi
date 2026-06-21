import { pool } from '../db.js';
import { useMemory } from '../stores/memoryMatchStore.js';

export interface DeviceGraphNode {
  userId: string;
  deviceIds: string[];
  linkTypes: string[];
  confidence: number;
}

export interface DeviceGraphSummary {
  userId: string;
  linkedUserCount: number;
  sharedDeviceCount: number;
  nodes: DeviceGraphNode[];
  riskFlags: string[];
}

const memoryDevices = new Map<string, Set<string>>();
const memoryLinks: Array<{ userA: string; userB: string; linkType: string; confidence: number }> = [];

export async function getDeviceGraph(userId: string): Promise<DeviceGraphSummary> {
  const riskFlags: string[] = [];
  const nodes: DeviceGraphNode[] = [];

  if (useMemory()) {
    const myDevices = [...memoryDevices.entries()]
      .filter(([, users]) => users.has(userId))
      .map(([deviceId]) => deviceId);

    const linkedUsers = new Map<string, { deviceIds: Set<string>; linkTypes: Set<string>; confidence: number }>();

    for (const link of memoryLinks) {
      if (link.userA !== userId && link.userB !== userId) continue;
      const otherId = link.userA === userId ? link.userB : link.userA;
      const entry = linkedUsers.get(otherId) ?? { deviceIds: new Set(), linkTypes: new Set(), confidence: 0 };
      entry.linkTypes.add(link.linkType);
      entry.confidence = Math.max(entry.confidence, link.confidence);
      linkedUsers.set(otherId, entry);
    }

    for (const deviceId of myDevices) {
      const users = memoryDevices.get(deviceId) ?? new Set();
      for (const otherUserId of users) {
        if (otherUserId === userId) continue;
        const entry = linkedUsers.get(otherUserId) ?? { deviceIds: new Set(), linkTypes: new Set(), confidence: 0.85 };
        entry.deviceIds.add(deviceId);
        entry.linkTypes.add('shared_device');
        linkedUsers.set(otherUserId, entry);
      }
    }

    for (const [linkedUserId, data] of linkedUsers) {
      nodes.push({
        userId: linkedUserId,
        deviceIds: [...data.deviceIds],
        linkTypes: [...data.linkTypes],
        confidence: data.confidence,
      });
    }

    if (nodes.length >= 2) riskFlags.push('MULTI_ACCOUNT_CLUSTER');
    if (myDevices.length >= 4) riskFlags.push('DEVICE_CHURN');

    return {
      userId,
      linkedUserCount: nodes.length,
      sharedDeviceCount: myDevices.length,
      nodes,
      riskFlags,
    };
  }

  const { rows: deviceRows } = await pool.query(
    `SELECT device_id FROM device_fingerprints WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 20`,
    [userId],
  );
  const myDevices = deviceRows.map((r) => r.device_id as string);

  const { rows: linkRows } = await pool.query(
    `SELECT user_id_a, user_id_b, link_type, confidence
     FROM account_links WHERE user_id_a = $1 OR user_id_b = $1`,
    [userId],
  );

  const linkedUsers = new Map<string, { deviceIds: Set<string>; linkTypes: Set<string>; confidence: number }>();

  for (const row of linkRows) {
    const otherId = (row.user_id_a as string) === userId ? (row.user_id_b as string) : (row.user_id_a as string);
    const entry = linkedUsers.get(otherId) ?? { deviceIds: new Set(), linkTypes: new Set(), confidence: 0 };
    entry.linkTypes.add(row.link_type as string);
    entry.confidence = Math.max(entry.confidence, Number(row.confidence));
    linkedUsers.set(otherId, entry);
  }

  if (myDevices.length > 0) {
    const { rows: sharedRows } = await pool.query(
      `SELECT device_id, user_id FROM device_fingerprints
       WHERE device_id = ANY($1::text[]) AND user_id <> $2`,
      [myDevices, userId],
    );
    for (const row of sharedRows) {
      const otherId = row.user_id as string;
      const entry = linkedUsers.get(otherId) ?? { deviceIds: new Set(), linkTypes: new Set(), confidence: 0.85 };
      entry.deviceIds.add(row.device_id as string);
      entry.linkTypes.add('shared_device');
      linkedUsers.set(otherId, entry);
    }
  }

  for (const [linkedUserId, data] of linkedUsers) {
    nodes.push({
      userId: linkedUserId,
      deviceIds: [...data.deviceIds],
      linkTypes: [...data.linkTypes],
      confidence: data.confidence,
    });
  }

  if (nodes.length >= 2) riskFlags.push('MULTI_ACCOUNT_CLUSTER');
  if (myDevices.length >= 4) riskFlags.push('DEVICE_CHURN');

  return {
    userId,
    linkedUserCount: nodes.length,
    sharedDeviceCount: myDevices.length,
    nodes,
    riskFlags,
  };
}

export function __testSeedDeviceGraph(userA: string, userB: string, deviceId: string) {
  const users = memoryDevices.get(deviceId) ?? new Set();
  users.add(userA);
  users.add(userB);
  memoryDevices.set(deviceId, users);
  memoryLinks.push({ userA, userB, linkType: 'shared_device', confidence: 0.85 });
}

export function __testResetDeviceGraphMemory() {
  memoryDevices.clear();
  memoryLinks.length = 0;
}
