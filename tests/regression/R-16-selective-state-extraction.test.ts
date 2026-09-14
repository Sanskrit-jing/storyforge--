/**
 * R-16: state extraction must use selective state recall.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourcePath = resolve(process.cwd(), 'src/components/editor/ChapterEditor.tsx')

describe('R-16: selective state extraction wiring', () => {
  it('manual chapter organization uses selective state recall from the persisted chapter text', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const body = source.slice(
      source.indexOf('const handleRunChapterOrganization = async'),
      source.indexOf('const handleApplyChapterOrganization = async'),
    )

    expect(body).toContain('buildSelectiveStateContext(persisted.plain, extraStateIds).text')
    expect(body).not.toContain('const stateCtx = buildStateContext()')
  })

  it('auto post-generation organization uses selective recall and does not restore the state-only model bypass', () => {
    const editor = readFileSync(sourcePath, 'utf8')
    expect(editor).toContain('await runChapterPostAdoptionV1({')
    const body = readFileSync(resolve(process.cwd(), 'src/lib/prose/post-adoption-runner.ts'), 'utf8')

    expect(body).toContain('sourceKeys: [...sourceKeys]')
    expect(body).toContain('CHAPTER_POST_ADOPTION_STEP_SOURCE_KEYS_V1.organization')
    expect(body).toContain('stateReferenceText: task.chapterPlainText')
    expect(body).toContain("organizationAssembly.included[index] === 'stateCards'")
    expect(body).toContain('extraStateIds,')
    expect(body.match(/runChapterOrganization\(/g)).toHaveLength(1)
    expect(body).not.toContain('stateAI.start(')
    expect(body).not.toContain('buildStateExtractPrompt(')
    expect(body).not.toContain('const stateCtx = buildStateContext()')
  })
})
