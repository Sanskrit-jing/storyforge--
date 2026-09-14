import { db } from '../db/schema'
import { readOwnedRows } from '../workspace/scope'
import type { Chapter, DetailedOutline, OutlineNode, WorkspaceScope } from '../types'
import { walkOutlineChaptersInCanonicalOrder } from '../outline/canonical-outline-walk'
import { buildBestChapterByOutlineMap } from '../chapters/selectors'
import { htmlToPlainText, countWords } from '../utils/html'

/** Read actual saved production state; candidate/run completion is never book completion. */
export async function readLongformProgressV1(scope: WorkspaceScope, worldGroupId: number | null) {
  const work = await db.works.get(scope.workId)
  if (!work || work.projectId !== scope.projectId || work.worldId !== scope.worldId) throw new Error('当前作品归属已变化。')
  const [nodes, chapters, details, characters, stories, worlds] = await Promise.all([
    readOwnedRows<OutlineNode>(scope, 'outlineNodes', { owner: 'work' }),
    readOwnedRows<Chapter>(scope, 'chapters', { owner: 'work' }),
    readOwnedRows<DetailedOutline>(scope, 'detailedOutlines', { owner: 'work' }),
    readOwnedRows<{ name: string; homeWorldGroupId?: number | null; isCrossWorld?: boolean }>(scope, 'characters', { owner: 'world' }),
    readOwnedRows<{ logline?: string; concept?: string; centralConflict?: string }>(scope, 'storyCores', { owner: 'work' }),
    readOwnedRows<{ worldOrigin?: string; worldStructure?: string; worldGroupId?: number | null }>(scope, 'worldviews', { owner: 'world' }),
  ])
  const canonical = walkOutlineChaptersInCanonicalOrder(nodes).chapters
  const all = canonical.filter(item => (item.worldGroupId ?? null) === worldGroupId)
  const byOutline = buildBestChapterByOutlineMap(chapters)
  const detailIds = new Set(details.filter(row => row.scenes?.length).map(row => row.outlineNodeId))
  const rows = all.map(item => {
    const chapter = byOutline.get(item.outlineNode.id!)
    const words = countWords(htmlToPlainText(chapter?.content ?? ''))
    return { outlineNodeId: item.outlineNode.id!, chapterId: chapter?.id, title: item.outlineNode.title, ordinal: canonical.indexOf(item) + 1, hasSummary: !!item.outlineNode.summary.trim(), hasDetails: detailIds.has(item.outlineNode.id!), written: words > 0, words }
  })
  const characterCount = characters.filter(row => row.isCrossWorld || (row.homeWorldGroupId ?? null) === worldGroupId).length
  const storyReady = stories.some(row => row.logline?.trim() || row.concept?.trim() || row.centralConflict?.trim())
  const worldReady = worlds.some(row => (row.worldGroupId ?? null) === worldGroupId && (row.worldOrigin?.trim() || row.worldStructure?.trim()))
  const volumes = nodes.filter(row => row.type === 'volume' && (row.worldGroupId ?? null) === worldGroupId)
  const missing = rows.find(row => !row.written)
  const nextRequest = !storyReady ? '结合我们的会谈，先讨论并确定故事核心的一句话故事。'
    : !worldReady ? '结合已确认的故事，规划世界起源设定。'
      : !characterCount ? '根据已确认的世界与故事，设计第一位主角。'
        : !volumes.length ? '根据已确认的故事和角色，规划全书卷纲。'
          : !rows.length ? '把现有卷纲展开为章节大纲。'
            : missing ? !missing.hasDetails ? `为第${missing.ordinal}章《${missing.title}》生成场景细纲。` : `为第${missing.ordinal}章《${missing.title}》生成正文。`
              : '现有章纲均已有正文。请与我核对全书目标和结局是否完成，再讨论修订与导出；先不要新增或覆盖内容。'
  return { work, rows, characterCount, worldReady, storyReady, volumes: volumes.length, written: rows.filter(row => row.written).length, detailed: rows.filter(row => row.hasDetails).length, words: rows.reduce((sum, row) => sum + row.words, 0), nextRequest }
}
