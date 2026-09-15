import { db } from "../db/schema";
import {
  assertRecordInScope,
  resolveScope,
  scopeTransactionTables,
  stampNewRecord,
} from "../workspace/scope";
import type {
  WorkspaceScope,
  ProductRuntimePackageV1,
  FrozenRuntimeMediaAssetV2,
  ProductMediaKind,
} from "../types";
import { parseProductRuntimePackageV1 } from "../product-production/runtime-package";
import { putMediaBlobObject } from "../product-production/media-blob-store";
import { readAvgDraftV1 } from "./draft-service";

/** Authors may retain unfinished graph edits; full package validation gates production. */
export async function saveAvgEditorV1(
  scope: WorkspaceScope,
  revision: number,
  previewHash: string,
  pkg: ProductRuntimePackageV1,
) {
  if (pkg.productType !== "avg" || !/^[a-f0-9]{64}$/.test(previewHash))
    throw new Error("AVG 编辑来源无效");
  const editorJson = JSON.stringify(pkg);
  if (editorJson.length > 2_000_000)
    throw new Error("编辑草稿过大，请拆分制作规模");
  return db.transaction(
    "rw",
    scopeTransactionTables(db.avgAuthoringDrafts),
    async () => {
      const row = await readAvgDraftV1(scope);
      if (row.revision !== revision)
        throw new Error("编辑草稿已在其他页面修改，请刷新后继续");
      const next = {
        ...row,
        editorJson,
        editorPreviewHash: previewHash,
        revision: revision + 1,
        updatedAt: Date.now(),
      };
      await db.avgAuthoringDrafts.put(next);
      return next;
    },
  );
}
export async function importAvgMediaV1(input: {
  scope: WorkspaceScope;
  data: ArrayBuffer;
  mimeType: string;
  name: string;
  kind: ProductMediaKind;
  license: string;
  altText: string;
  characterTag: string;
}) {
  const scope = await resolveScope({ scope: input.scope });
  const work = await db.works.get(scope.workId);
  if (
    !work ||
    !(await assertRecordInScope(scope, "works", work, { owner: "work" }))
  )
    throw new Error("作品不存在");
  if (!input.license.trim() || !input.name.trim())
    throw new Error("请填写素材名称与授权说明");
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
    ].includes(input.mimeType)
  )
    throw new Error("请上传 PNG/JPEG/WebP 或 MP3/WAV/OGG/M4A");
  if (!input.data.byteLength || input.data.byteLength > 32 * 1024 * 1024)
    throw new Error("单个素材需为 1 字节～32 MB");
  const isAudio = ["bgm", "ambience", "sfx", "voice"].includes(input.kind);
  if (isAudio !== input.mimeType.startsWith("audio/"))
    throw new Error("素材类型与文件不符");
  if (input.kind.startsWith("character-") && !input.characterTag.trim())
    throw new Error("角色素材必须绑定角色标识");
  const blob = await putMediaBlobObject({
    scope,
    data: input.data,
    mimeType: input.mimeType,
  });
  const asset: FrozenRuntimeMediaAssetV2 = {
    assetKey: `avg.asset.${crypto.randomUUID()}`,
    version: 1,
    kind: input.kind,
    name: input.name.trim(),
    mimeType: input.mimeType,
    byteSize: blob.byteSize,
    width: null,
    height: null,
    durationMs: null,
    contentHash: blob.contentHash,
    blobContentHash: blob.contentHash,
    source: "author-upload",
    license: input.license.trim(),
    altText: input.altText.trim() || input.name.trim(),
    characterTag: input.characterTag.trim(),
    sceneTag: "",
  };
  await db.avgDraftMedia.add(
    stampNewRecord(
      scope,
      "avgDraftMedia",
      {
        ...scope,
        blobObjectId: blob.id!,
        assetJson: JSON.stringify(asset),
        createdAt: Date.now(),
      },
      { owner: "work" },
    ),
  );
  return asset;
}
export function validateAvgEditorV1(pkg: ProductRuntimePackageV1) {
  return parseProductRuntimePackageV1(pkg);
}

/** Only an AVG-owned upload reference can authorize previewing a draft-only blob. */
export async function readAvgDraftMediaV1(scope:WorkspaceScope,asset:FrozenRuntimeMediaAssetV2){
 const rows=await db.avgDraftMedia.where('workId').equals(scope.workId).toArray()
 const row=rows.find(row=>{const saved=JSON.parse(row.assetJson) as FrozenRuntimeMediaAssetV2;return saved.assetKey===asset.assetKey&&saved.blobContentHash===asset.blobContentHash})
 if(!row||!await assertRecordInScope(scope,'avgDraftMedia',row,{owner:'work'}))throw new Error('素材引用不属于当前 AVG')
 const {readMediaBlobObjectData}=await import('../product-production/media-blob-store')
 return readMediaBlobObjectData({scope,blobObjectId:row.blobObjectId,expected:{contentHash:asset.blobContentHash,byteSize:asset.byteSize,mimeType:asset.mimeType}})
}
