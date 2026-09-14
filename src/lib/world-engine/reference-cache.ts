import { db } from "../db/schema";
import type { WorkspaceScope } from "../types";
import { resolveScope } from "../workspace/scope";
import { createWorldReferenceV1 } from "./world-reference";
import { verifyPureWorldReleaseRecordV3 } from "./release-codec";

/** Explicit local reference import. Copies only a verified immutable release into
 * the consumer's world storage scope, so backup/deletion never depends on the
 * source author's mutable project. UID, semantic bytes and provenance are unchanged. */
export async function cacheWorldReferenceForProductV1(
  scopeInput: WorkspaceScope,
  releaseId: number,
): Promise<number> {
  const scope = await resolveScope({ scope: scopeInput });
  const reference = await createWorldReferenceV1(releaseId);
  const verified = await db.worldReleases.get(releaseId);
  if (!verified) throw new Error("来源世界版本已不存在");
  await verifyPureWorldReleaseRecordV3(verified);
  return db.transaction("rw", db.worldReleases, db.worldRevisions, async () => {
    const source = await db.worldReleases.get(releaseId);
    if (!source) throw new Error("来源世界版本已不存在");
    if (
      source.manifestJson !== verified.manifestJson ||
      source.contentHash !== verified.contentHash ||
      source.releaseUid !== verified.releaseUid
    )
      throw new Error("来源世界在选择期间变化");
    if (source.contentHash !== reference.releaseHash)
      throw new Error("来源世界版本已变化");
    const existing = (
      await db.worldReleases.where("worldId").equals(scope.worldId).toArray()
    ).find(
      (row) =>
        row.projectId === scope.projectId &&
        row.releaseUid === reference.releaseUid,
    );
    if (existing?.id) {
      if (
        existing.manifestJson !== source.manifestJson ||
        existing.contentHash !== source.contentHash
      )
        throw new Error("缓存世界版本损坏");
      return existing.id;
    }
    const now = Date.now();
    const revisionId = (await db.worldRevisions.add({
      projectId: scope.projectId,
      worldId: scope.worldId,
      parentRevisionId: null,
      revision: source.version,
      label: source.label,
      manifestJson: source.manifestJson,
      contentHash: source.contentHash,
      createdAt: now,
      updatedAt: now,
    })) as number;
    const { id: _sourceId, ...frozen } = source;
    return (await db.worldReleases.add({
      ...frozen,
      projectId: scope.projectId,
      worldId: scope.worldId,
      revisionId,
    })) as number;
  });
}

/** A local library picker; no mutable world content is exposed to the product. */
export async function listLocalWorldReferenceChoicesV1() {
  const releases = await db.worldReleases.toArray();
  const seen = new Set<string>();
  const choices: {
    id: number;
    label: string;
    worldCode: string;
    version: number;
    hash: string;
  }[] = [];
  for (const release of releases) {
    if (!release.id || seen.has(release.releaseUid)) continue;
    try {
      const ref = await createWorldReferenceV1(release.id);
      choices.push({
        id: release.id,
        label: release.label,
        worldCode: ref.worldCode,
        version: ref.releaseVersion,
        hash: ref.releaseHash,
      });
      seen.add(ref.releaseUid);
    } catch {
      /* Invalid releases cannot be selected; source world UI owns their diagnostics. */
    }
  }
  return choices.sort((a, b) => b.id - a.id);
}
