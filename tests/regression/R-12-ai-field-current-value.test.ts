/**
 * R-12: single-field AI generation must include current field value.
 *
 * Regression target:
 *   Field-level AI generation used only user hints and surrounding context,
 *   so when the user had already typed half a field, AI generation could
 *   ignore it and start over.
 */
import { describe, it, expect } from 'vitest'
import { buildStoryGeneratePrompt } from '../../src/lib/ai/adapters/story-adapter'
import { buildWorldviewPrompt } from '../../src/lib/ai/adapters/worldview-adapter'

describe('R-12: AI field current value injection', () => {
  it('story.generate renders current field value and mode guidance', () => {
    const messages = buildStoryGeneratePrompt(
      '核心冲突',
      '镜城纪事',
      'fantasy',
      '【世界观】镜城按港口城邦运行。',
      '加强主角个人代价',
      undefined,
      '主角想废除镜税，但父亲正是镜税账房。',
      'expand',
    )

    const prompt = messages.map(m => m.content).join('\n\n')
    expect(prompt).toContain('主角想废除镜税')
    expect(prompt).toContain('本次生成模式】扩写')
    expect(prompt).toContain('加强主角个人代价')
  })

  it('worldview.dimension rewrite mode ignores current field value', () => {
    const messages = buildWorldviewPrompt(
      '政治制度',
      '镜城纪事',
      'fantasy',
      '【世界历史线】镜城刚刚开埠。',
      '让制度更有矛盾',
      undefined,
      '镜城由市舶司、商会、镜税署三方共治。',
      'rewrite',
    )

    const prompt = messages.map(m => m.content).join('\n\n')
    expect(prompt).not.toContain('镜城由市舶司、商会、镜税署三方共治')
    expect(prompt).toContain('本次生成模式】重写')
    expect(prompt).toContain('忽略当前字段已有内容')
    expect(prompt).toContain('让制度更有矛盾')
  })

  it('worldview origin and power generation include field boundary guards', () => {
    const originPrompt = buildWorldviewPrompt(
      'origin',
      '镜城纪事',
      'fantasy',
      '【力量体系】镜术分九阶。',
      '',
      undefined,
      '镜城由陨星镜海诞生。',
      'expand',
    ).map(m => m.content).join('\n\n')

    expect(originPrompt).toContain('本次只生成“世界来源”')
    expect(originPrompt).toContain('不要展开力量等级')
    expect(originPrompt).toContain('力量体系”只能作为约束条件')

    const powerPrompt = buildWorldviewPrompt(
      'power',
      '镜城纪事',
      'fantasy',
      '【世界来源】镜城由陨星镜海诞生。',
      '',
      undefined,
      '镜术来自镜海潮汐。',
      'expand',
    ).map(m => m.content).join('\n\n')

    expect(powerPrompt).toContain('本次只生成“力量体系”')
    expect(powerPrompt).toContain('不要改写世界来源')
    expect(powerPrompt).toContain('给出兼容方案')
  })
})
