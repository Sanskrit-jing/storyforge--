import type {
  PromptWorkflow,
  PromptWorkflowGraph,
  PromptWorkflowGraphEdge,
  PromptWorkflowGraphNode,
  PromptWorkflowStep,
} from '../types/workflow'
import { validateWorkflowGraph } from './graph'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNode(value: unknown): PromptWorkflowGraphNode | null {
  if (!isRecord(value)) return null
  if (typeof value.stepId !== 'string') return null
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null
  return { stepId: value.stepId, x: value.x, y: value.y }
}

function parseEdge(value: unknown): PromptWorkflowGraphEdge | null {
  if (!isRecord(value)) return null
  if (
    typeof value.edgeId !== 'string' ||
    typeof value.sourceStepId !== 'string' ||
    typeof value.targetStepId !== 'string' ||
    typeof value.targetVariable !== 'string'
  ) return null
  return {
    edgeId: value.edgeId,
    sourceStepId: value.sourceStepId,
    targetStepId: value.targetStepId,
    targetVariable: value.targetVariable,
  }
}

function parseGraph(value: unknown): PromptWorkflowGraph | undefined {
  if (value == null) return undefined
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('工作流 graph 必须是 version=1 的节点图。')
  }
  const nodes = value.nodes.map(parseNode)
  const edges = value.edges.map(parseEdge)
  if (nodes.some(node => node == null) || edges.some(edge => edge == null)) {
    throw new Error('工作流 graph 包含非法节点或连线。')
  }
  const viewport = value.viewport
  let parsedViewport: PromptWorkflowGraph['viewport']
  if (viewport != null) {
    if (
      !isRecord(viewport) ||
      typeof viewport.x !== 'number' ||
      typeof viewport.y !== 'number' ||
      typeof viewport.zoom !== 'number' ||
      !Number.isFinite(viewport.x) ||
      !Number.isFinite(viewport.y) ||
      !Number.isFinite(viewport.zoom)
    ) {
      throw new Error('工作流 graph.viewport 无效。')
    }
    parsedViewport = { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
  }
  return {
    version: 1,
    nodes: nodes as PromptWorkflowGraphNode[],
    edges: edges as PromptWorkflowGraphEdge[],
    viewport: parsedViewport,
  }
}

export function parseImportedWorkflow(value: unknown, now = Date.now()): PromptWorkflow | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !Array.isArray(value.steps)) return null
  const steps = value.steps.filter(isRecord)
  if (
    steps.length !== value.steps.length ||
    steps.some(step =>
      typeof step.stepId !== 'string' ||
      typeof step.label !== 'string' ||
      typeof step.promptModuleKey !== 'string'
    )
  ) {
    throw new Error(`工作流「${value.name}」包含非法步骤。`)
  }
  const workflow: PromptWorkflow = {
    scope: 'user',
    name: value.name,
    description: typeof value.description === 'string' ? value.description : '',
    genres: Array.isArray(value.genres)
      ? value.genres.filter((genre): genre is string => typeof genre === 'string')
      : undefined,
    steps: steps as unknown as PromptWorkflowStep[],
    graph: parseGraph(value.graph),
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  }
  const issues = validateWorkflowGraph(workflow)
  if (issues.length) {
    throw new Error(`工作流「${workflow.name}」图无效：${issues.map(issue => issue.message).join('；')}`)
  }
  return workflow
}

/** 工作流导出包裹格式（v1）：带 format 标识，导入侧可区分旧版裸数组。 */
export interface PromptWorkflowsExportFile {
  format: 'storyforge-prompt-workflows'
  version: 1
  exportedAt: number
  workflows: PromptWorkflow[]
}

export const WORKFLOWS_EXPORT_FORMAT = 'storyforge-prompt-workflows'

/**
 * 解析导入的工作流集合：
 * - 新格式（本模块导出的包裹结构）取 workflows 节，版本不符直接报错；
 * - 旧格式（裸数组 / 单个工作流对象）原样兼容。
 */
export function parseImportedWorkflows(value: unknown, now = Date.now()): PromptWorkflow[] {
  let items: unknown = value
  if (isRecord(value) && value.format === WORKFLOWS_EXPORT_FORMAT) {
    if (value.version !== 1 || !Array.isArray(value.workflows)) {
      throw new Error('工作流备份文件版本不受支持或内容为空。')
    }
    items = value.workflows
  }
  const arr = Array.isArray(items) ? items : [items]
  return arr
    .map(item => parseImportedWorkflow(item, now))
    .filter((item): item is PromptWorkflow => item != null)
}

export function serializeWorkflows(workflows: PromptWorkflow[]): string {
  const file: PromptWorkflowsExportFile = {
    format: WORKFLOWS_EXPORT_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    workflows,
  }
  return JSON.stringify(file, null, 2)
}
