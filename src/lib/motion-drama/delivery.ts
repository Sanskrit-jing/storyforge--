import JSZip from 'jszip'
import { db } from '../db/schema'
import { readMediaBlobObjectData } from '../product-production/media-blob-store'
import type { WorkspaceScope } from '../types'
import { readMotionDramaReleaseManifestV1 } from './release'

/** Export only the frozen release and its pinned bytes, never current draft assets. */
export async function exportMotionMaterialBundle(scope: WorkspaceScope, releaseId: number): Promise<Blob> {
  const manifest = await readMotionDramaReleaseManifestV1(scope, releaseId)
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  const assets = await db.creationReleaseAssets.where('releaseId').equals(releaseId).toArray()
  const index: Array<{key:string;file:string;hash:string}> = []
  for (const asset of assets) {
    if (asset.projectId !== scope.projectId || asset.workId !== scope.workId) throw new Error('交付素材归属不匹配')
    const blob = await db.mediaBlobObjects.get(asset.blobObjectId)
    if (!blob || blob.workId !== scope.workId || blob.contentHash !== asset.contentHash) throw new Error('冻结素材缺失或版本不匹配')
    const data = await readMediaBlobObjectData({scope,blobObjectId:asset.blobObjectId,expected:{contentHash:asset.contentHash,byteSize:blob.byteSize,mimeType:blob.mimeType}})
    const extension: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','audio/wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg','audio/mp4':'m4a'}
    const file=`references/${asset.contentHash}.${extension[blob.mimeType]??'bin'}`
    zip.file(file,data);index.push({key:asset.assetKey,file,hash:asset.contentHash})
  }
  zip.file('references.json',JSON.stringify(index,null,2))
  for(const pack of manifest.promptPacks){
    const label=`EP${pack.episodeNumber}-${pack.provider}`
    zip.file(`${label}/pack.json`,JSON.stringify(pack,null,2))
    const shots=pack.shots as Array<{shotKey:string;providerPrompt:string}>
    zip.file(`${label}/提示词.txt`,shots.map(shot=>`${shot.shotKey}\n${shot.providerPrompt}`).join('\n\n'))
  }
  zip.file('使用说明.txt',`漫剧素材 · 前期交付包\n此包不包含视频成片。\n按各集 pack.json 的逐镜输入槽位核对 references.json 与参考素材，然后复制提示词至 Seedance 或所选工具。\n${manifest.tier==='prompt-only'?'本包仅为提示词准备阶段；未包含实际参考媒资，不代表可直接投喂。':'本包包含已冻结的参考素材。'}\n请在外部工具中核对实际版本与支持能力。`)
  return zip.generateAsync({type:'blob'})
}
