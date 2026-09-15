import { db } from '../db/schema'
import { mediaBlobDataUrlV1, readVerifiedMediaBlobV1 } from '../media/blob-store'
import { readComicReleaseManifestV1 } from './release'
import type { ComicPage, ComicPanel, WorkspaceScope } from '../types'
import type { ComicBookRenderV1 } from './renderers'
/** Render only the verified immutable manifest and its pinned blobs, never draft rows. */
export async function readComicReleaseBookV1(scope: WorkspaceScope, releaseId: number) {
  const manifest = await readComicReleaseManifestV1(scope, releaseId)
  const pins = await db.creationReleaseAssets.where('releaseId').equals(releaseId).toArray()
  const urls: Record<string,string> = {}
  for (const asset of manifest.assets) {
    const pin = pins.find(p => p.assetKey === asset.stableKey)
    if (!pin || pin.projectId !== scope.projectId || pin.worldId !== scope.worldId || pin.workId !== scope.workId || pin.contentHash !== asset.contentHash) throw new Error('发布版本的图片引用缺失或不匹配')
    const blob = await readVerifiedMediaBlobV1({scope,blobObjectId:pin.blobObjectId})
    if (blob.contentHash !== asset.contentHash) throw new Error('发布版本的图片校验失败')
    urls[String(asset.stableKey)] = await mediaBlobDataUrlV1({scope,blobObjectId:pin.blobObjectId})
  }
  const book: ComicBookRenderV1 = {title:manifest.work.title,targetSpec:manifest.adaptation.targetSpec,pages:manifest.pages.map((p,index) => {
    const {panels,...page} = p
    return {page:{...page,id:index+1} as ComicPage,panels:(panels as Array<Record<string,unknown>>).map((panel,i)=>({...panel,id:i+1,pageId:index+1,sourceUnitIds:[]} as unknown as ComicPanel)),assetDataUrls:urls}
  })}
  return {manifest,book,mode:manifest.tier==='visual'?'formal' as const:'storyboard' as const}
}
