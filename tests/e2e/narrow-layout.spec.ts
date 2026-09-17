/**
 * 窄屏 / 平板布局巡检（反馈 1 / 3 / 5）
 *
 * 判据：工作区主内容区（main 内 overflow-y-auto 的滚动容器）在给定视口下
 * 不应该出现横向溢出（scrollWidth > clientWidth），否则就是用户反馈的
 * 「屏幕小显示不全，横屏也只能看见一小部分」。
 *
 * 刻意不改任何业务数据：只在独立浏览器 profile 里新建一个空项目逐模块巡检。
 */
import { expect, test, type Page } from '@playwright/test'

interface ModuleTarget {
  /** 所属折叠分支的标签；顶层叶子为 null */
  branch: string | null
  leaf: string
}

/** 与 NAV_TREE（src/components/layout/sidebar-tree.ts）逐项对齐 */
const MODULES: ModuleTarget[] = [
  { branch: null, leaf: '项目概况' },
  { branch: null, leaf: '灵感反推' },
  { branch: null, leaf: '项目参考' },
  { branch: null, leaf: '世界总览' },
  { branch: '世界观', leaf: '真实与幻想' },
  { branch: '世界观', leaf: '世界起源' },
  { branch: '世界观', leaf: '自然环境' },
  { branch: '世界观', leaf: '人文环境' },
  { branch: '世界观', leaf: '历史年表' },
  { branch: '世界观', leaf: '世界地图' },
  { branch: null, leaf: '故事设计' },
  { branch: '角色设计', leaf: '角色生成' },
  { branch: '角色设计', leaf: '主要角色' },
  { branch: '角色设计', leaf: '次要角色' },
  { branch: '角色设计', leaf: 'NPC' },
  { branch: '角色设计', leaf: '路人' },
  { branch: '角色设计', leaf: '关系网' },
  { branch: null, leaf: '创作规则' },
  { branch: null, leaf: '大纲' },
  { branch: null, leaf: '角色驱动' },
  { branch: null, leaf: '资料与检索库' },
  { branch: null, leaf: '节点模式' },
  { branch: null, leaf: '故事线' },
  { branch: null, leaf: '章节' },
  { branch: null, leaf: '伏笔' },
  { branch: null, leaf: '文风学习' },
  { branch: null, leaf: '重要地点' },
  { branch: null, leaf: '状态表' },
  { branch: null, leaf: '物品栏' },
  { branch: null, leaf: '事实库' },
  { branch: null, leaf: '故事年表' },
  { branch: null, leaf: '修炼进度' },
  { branch: null, leaf: '场景考证' },
  { branch: null, leaf: '互动运行时' },
  { branch: null, leaf: '提示词库' },
  { branch: null, leaf: '版本历史' },
  { branch: null, leaf: '文档解析' },
  { branch: null, leaf: '数据管理' },
  { branch: null, leaf: '消耗统计' },
  { branch: null, leaf: '设置' },
]

/** 允许横向滚动的模块（有意的宽内容，例如看板/画布）。留空 = 全部必须自适应。 */
const ALLOW_HORIZONTAL_SCROLL = new Set<string>([
  '节点模式',
  '互动运行时',
  '世界地图',
])

const VIEWPORTS = [
  { name: '手机竖屏 390×844', width: 390, height: 844 },
  { name: '手机横屏 844×390', width: 844, height: 390 },
  { name: '平板横屏 1280×800', width: 1280, height: 800 },
]

interface OverflowReport {
  /** 主内容滚动容器横向溢出像素 */
  wrapperOverflow: number
  /** 主内容容器内被裁到视口右侧之外的元素 */
  clipped: string[]
  /** 需要横向滚动才能看全的内部容器 */
  scrollers: string[]
}

async function measureOverflow(page: Page): Promise<OverflowReport> {
  return await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return { wrapperOverflow: -1, clipped: ['main 缺失'], scrollers: [] }
    const wrapper = Array.from(main.children).find(
      el => getComputedStyle(el).overflowY === 'auto',
    ) as HTMLElement | undefined
    if (!wrapper) return { wrapperOverflow: -1, clipped: ['主内容容器缺失'], scrollers: [] }

    const mainRight = main.getBoundingClientRect().right

    const describe = (el: Element) => {
      const cls = typeof el.className === 'string'
        ? el.className.split(/\s+/).slice(0, 5).join(' ')
        : ''
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)
      return `<${el.tagName.toLowerCase()} class="${cls}"> ${text}`
    }

    const isScroller = (el: Element) => {
      const overflowX = getComputedStyle(el).overflowX
      return overflowX === 'auto' || overflowX === 'scroll'
    }

    /** 祖先链里是否有「真正在横向滚动」的容器（wrapper 本身不算） */
    const insideInnerScroller = (el: Element) => {
      let parent = el.parentElement
      while (parent && parent !== wrapper) {
        if (isScroller(parent) && parent.scrollWidth > parent.clientWidth + 2) return true
        parent = parent.parentElement
      }
      return false
    }

    const clipped: string[] = []
    const scrollers: string[] = []
    for (const el of Array.from(wrapper.querySelectorAll('*'))) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (isScroller(el) && el.scrollWidth > el.clientWidth + 2) {
        scrollers.push(`${describe(el)} [${el.scrollWidth}>${el.clientWidth}]`)
        continue
      }
      if (rect.right > mainRight + 2 && !insideInnerScroller(el)) {
        clipped.push(`${describe(el)} [right=${Math.round(rect.right)}/${Math.round(mainRight)}]`)
      }
    }
    return {
      wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
      clipped: clipped.slice(0, 5),
      scrollers: scrollers.slice(0, 5),
    }
  })
}

async function openCleanHome(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('storyforge_guide_completed', 'e2e-narrow')
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /开始.*第一部.*小说/ })).toBeVisible()
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: '+ 新建项目', exact: true }).click()
  await page.getByPlaceholder('如：《剑出山门》').fill(name)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page).toHaveURL(/\/workspace\/\d+$/)
}

/**
 * 外层侧栏的 <aside>。
 * first() 是必需的：「互动运行时」等面板内部自带 <aside>/<nav>，
 * 直接用 `aside` 会触发 strict mode violation；外层侧栏在 DOM 中排在最前。
 */
function sidebarAside(page: Page) {
  return page.locator('aside').first()
}

/** 侧栏的滚动容器。 */
function sidebarNav(page: Page) {
  return sidebarAside(page).locator('nav').first()
}

/** 抽屉是否已滑入：读外壳容器的 translateX，比读子元素位置更可靠。 */
function drawerOpen(page: Page) {
  return sidebarAside(page).evaluate(el => {
    const wrapper = el.parentElement
    if (!wrapper) return false
    const transform = getComputedStyle(wrapper).transform
    if (!transform || transform === 'none') return true
    const offsetX = new DOMMatrixReadOnly(transform).m41
    return offsetX > -1
  })
}

/** 调试用：打印抽屉的实际几何信息 */
async function drawerDebug(page: Page) {
  return await sidebarAside(page).evaluate(el => {
    const wrapper = el.parentElement
    const nav = el.querySelector('nav')
    const w = wrapper?.getBoundingClientRect()
    const n = nav?.getBoundingClientRect()
    return `innerWidth=${window.innerWidth} wrapper=[${Math.round(w?.left ?? 0)},${Math.round(w?.right ?? 0)}] ` +
      `nav=[${Math.round(n?.left ?? 0)},${Math.round(n?.right ?? 0)}] transform=${getComputedStyle(wrapper!).transform}`
  })
}

/**
 * 开关窄屏抽屉。宽屏（≥768px，与 Tailwind md 对齐）侧栏常驻，无需操作。
 * 注意：抽屉打开时会盖住主面板上的「打开导航」按钮，所以必须先判断状态再决定是否点击。
 */
async function setDrawer(page: Page, open: boolean) {
  if (await page.evaluate(() => window.innerWidth >= 768)) return
  if (await drawerOpen(page) === open) return
  if (open) {
    const navToggle = page.getByRole('button', { name: '打开导航' })
    await expect(navToggle).toBeVisible()
    await navToggle.click()
  } else {
    // 收起走抽屉右侧的遮罩，而不是那个被抽屉挡住的开关
    const size = page.viewportSize()
    if (size) await page.mouse.click(size.width - 8, Math.round(size.height / 2))
  }
  await expect.poll(() => drawerOpen(page)).toBe(open)
  console.log(`     [drawer] open=${open} → ${await drawerDebug(page)}`)
}

/**
 * 打开模块。返回 false 表示该模块在当前工程形态下不存在于侧栏
 * （例如「世界总览」只在开启多世界时才出现，见 WorkspacePage 的 hiddenModules）。
 */
async function openModule(page: Page, target: ModuleTarget): Promise<boolean> {
  await setDrawer(page, true)
  if (await page.evaluate(() => window.innerWidth < 768)) {
    console.log(`     [${target.leaf}] ${await drawerDebug(page)}`)
  }
  const nav = sidebarNav(page)

  const leaf = nav.getByText(target.leaf, { exact: true }).locator('xpath=ancestor::button[1]')
  if (target.branch) {
    const branch = nav.getByText(target.branch, { exact: true }).locator('xpath=ancestor::button[1]')
    if (await branch.count() === 0) {
      await setDrawer(page, false)
      return false
    }
    await branch.click()
    if (await leaf.count() === 0) await branch.click()
  }
  if (await leaf.count() === 0) {
    await setDrawer(page, false)
    return false
  }
  await leaf.scrollIntoViewIfNeeded()
  await leaf.click()

  // 懒加载面板（地图 / 关系网）等 fallback 退出
  const fallback = page.getByText('面板加载中…')
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.waitFor({ state: 'hidden' }).catch(() => {})
  }
  // first()：像「互动运行时」这样的面板内部还有自己的 <main>
  await expect(page.locator('main').first()).toBeVisible()
  return true
}

// 单个动作超时必须显式给：默认只受「测试总超时」约束，元素不可点时会一直重试，
// 表现为测试卡死而不是报错。
test.use({ actionTimeout: 15_000 })

for (const viewport of VIEWPORTS) {
  test(`窄屏/平板布局巡检 · ${viewport.name}`, async ({ page }) => {
    test.setTimeout(15 * 60_000)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openCleanHome(page)
    await createProject(page, `布局巡检 ${viewport.width}`)

    const failures: string[] = []
    const skipped: string[] = []
    const started = Date.now()
    for (const target of MODULES) {
      const tick = Date.now()
      if (!await openModule(page, target)) {
        console.log(`   · ${target.leaf} → 当前工程形态下不可见，跳过`)
        skipped.push(target.leaf)
        continue
      }
      const report = await measureOverflow(page)
      console.log(`   · ${target.leaf} → 横向溢出 ${report.wrapperOverflow}px（${Date.now() - tick}ms）`)
      const horizontalScrollAllowed = ALLOW_HORIZONTAL_SCROLL.has(target.leaf)
      if (report.wrapperOverflow > 2 && !horizontalScrollAllowed) {
        failures.push(
          `[${target.leaf}] 主内容横向溢出 ${report.wrapperOverflow}px；` +
          `被裁元素：${report.clipped.join(' / ') || '无'}；` +
          `内部横滚容器：${report.scrollers.join(' / ') || '无'}`,
        )
      }
    }
    if (skipped.length) console.log(`   (当前工程形态下不可见，已跳过：${skipped.join('、')})`)
    console.log(`   巡检 ${MODULES.length} 个模块共 ${Math.round((Date.now() - started) / 1000)}s`)
    expect(failures, failures.join('\n')).toEqual([])
  })
}
