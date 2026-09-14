import {expect,test} from '@playwright/test'
import {publishCurrentWorldRelease} from './helpers/world-release'
const pages=['worlds','basics','nature','society','characters','history','story','multiverse','map','versions','outlet','sharing','community','settings']
test('world pages remain browsable without creating data',async({page})=>{
 for(const id of pages){await page.goto('./world/'+id);await expect(page.getByTestId('world-engine-page')).toBeVisible();await expect(page.getByText('示例内容 · 未接入',{exact:true})).toHaveCount(0)}
 const counts=await page.evaluate(async()=>{const imp=new Function('p','return import(p)');const {db}=await imp('/storyforge/src/lib/db/schema.ts');return [await db.worlds.count(),await db.works.count(),await db.worldNodes.count()]})
 expect(counts).toEqual([0,0,0])
})
test('world content saves, frozen outlet stays fixed, historical share imports independent copy',async({page})=>{
 test.setTimeout(120000)
 await page.goto('./world/worlds');await page.getByRole('button',{name:'新建世界',exact:true}).click();await page.getByLabel('新世界名称').fill('青绿世界');await page.getByRole('button',{name:'创建世界',exact:true}).click()
 await expect(page).toHaveURL(/world\/basics\?project=\d+/)
 const project=new URL(page.url()).searchParams.get('project')!
 await page.goto(`./world/nature?project=${project}`)
 await expect(page.locator('[data-workspace-ready="world"]')).toBeVisible()
 // Existing field editor commits on blur; navigate through the new shell afterwards.
 await page.getByText('世界的物理层级——星球 / 大陆 / 行政区划 / 平行空间等',{exact:true}).last().click().catch(()=>{})
 const editor=page.locator('textarea').first()
 await expect(editor).toBeVisible();await editor.fill('唯一旧版证据：双月照耀青绿群岛');await editor.blur()
 await page.getByRole('navigation',{name:'世界页面导航'}).getByRole('button',{name:'版本与封存',exact:true}).click()
 await publishCurrentWorldRelease(page,'青绿 v1')
 await page.getByRole('navigation',{name:'世界页面导航'}).getByRole('button',{name:'数据出口',exact:true}).click()
 await page.getByLabel('搜索世界资源').fill('唯一旧版证据');await page.getByRole('button',{name:'搜索',exact:true}).click()
 await page.locator('.we-resource-list button').first().click();await expect(page.locator('.we-evidence').first()).toContainText('唯一旧版证据')
 await page.screenshot({path:'/tmp/world-integrated-outlet.png'})
 await page.goto(`./world/nature?project=${project}`);await page.getByText('唯一旧版证据：双月照耀青绿群岛',{exact:true}).click();await page.locator('textarea').first().fill('新草稿：三月与大陆');await page.locator('textarea').first().blur()
 await page.getByRole('navigation',{name:'世界页面导航'}).getByRole('button',{name:'版本与封存',exact:true}).click();await publishCurrentWorldRelease(page,'青绿 v2')
 await page.goto(`./world/outlet?project=${project}`);await page.getByLabel('出口世界版本').selectOption({label:'v1 · 青绿 v1'});await page.getByLabel('搜索世界资源').fill('唯一旧版证据');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.locator('.we-resource-list button').first().click();await expect(page.locator('.we-evidence').first()).toContainText('唯一旧版证据')
 await page.goto(`./world/sharing?project=${project}`);await page.getByLabel('分享世界版本').selectOption({label:'v1 · 青绿 v1'});await page.getByLabel('作者署名').fill('测试作者');const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载世界分享包',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toMatch(/-v1.json$/)
 await page.getByLabel('选择世界分享包',{exact:true}).setInputFiles((await file.path())!);await expect(page.getByTestId('world-package-preview')).toContainText('分享包预检通过');await page.getByRole('button',{name:'确认导入纯语义世界'}).click();await expect(page).toHaveURL(/world\/basics\?project=/);expect(new URL(page.url()).searchParams.get('project')).not.toBe(project)
 await page.reload();await expect(page.locator('[data-workspace-ready="world"]')).toBeVisible()
})
test('map manual regeneration persists through refresh and legacy deep link keeps new shell',async({page})=>{
 test.setTimeout(120000)
 await page.goto('./world/worlds');await page.getByRole('button',{name:'新建世界',exact:true}).click();await page.getByLabel('新世界名称').fill('地图世界');await page.getByRole('button',{name:'创建世界',exact:true}).click();await expect(page).toHaveURL(/world\/basics\?project=/)
 const project=Number(new URL(page.url()).searchParams.get('project'))
 await page.goto(`./workspace/${project}?module=world-map`);await expect(page).toHaveURL(/world\/map/);await expect(page.getByRole('button',{name:'AI 生成地图',exact:true})).toBeVisible()
 const node=await page.evaluate(async projectId=>{const imp=new Function('p','return import(p)');const {resolveScopeLike}=await imp('/storyforge/src/lib/workspace/scope.ts');const scope=await resolveScopeLike(projectId);const {useWorldNodeStore}=await imp('/storyforge/src/stores/world-node.ts');await useWorldNodeStore.getState().ensureRootWorld(scope,null);await useWorldNodeStore.getState().loadNodes(scope,null);const id=useWorldNodeStore.getState().activeWorldId;await useWorldNodeStore.getState().updateNode(id,{mapConfigJSON:JSON.stringify({width:800,height:500,pointCount:500,seed:'map-fixed',mapName:'核查地图',landRatio:.6,stateCount:2,heightmapTemplate:'continents',namingStyle:'chinese'})});return id},project)
 const canvas=()=>page.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())
 await expect(page.getByRole('button',{name:'重新生成',exact:true})).toBeVisible();const before=await canvas();await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect.poll(canvas).not.toBe(before)
 const seed=await page.evaluate(async id=>{const imp=new Function('p','return import(p)');const {db}=await imp('/storyforge/src/lib/db/schema.ts');return JSON.parse((await db.worldNodes.get(id)).mapConfigJSON).seed},node);expect(seed).not.toBe('map-fixed')
 const after=await canvas();await page.reload();await expect(page.getByRole('button',{name:'重新生成',exact:true})).toBeVisible();await expect.poll(canvas).toBe(after);await page.screenshot({path:'/tmp/world-integrated-map.png'})
})
test('world registered editors render inside the shell with world scope',async({page})=>{
 test.setTimeout(180000)
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('./world/worlds');await page.getByRole('button',{name:'新建世界',exact:true}).click();await page.getByLabel('新世界名称').fill('编辑器核查世界');await page.getByRole('button',{name:'创建世界',exact:true}).click();await expect(page).toHaveURL(/world\/basics\?project=/)
 const project=new URL(page.url()).searchParams.get('project')!
 const {WORLD_PAGES}=await import('../../src/components/world-engine/navigation')
 for(const definition of WORLD_PAGES){for(const [module] of definition.modules??[]){
  await page.goto(`./world/${definition.id}?project=${project}&module=${module}`)
  if(definition.id==='multiverse'){
   await page.getByRole('button',{name:'启用多世界',exact:true}).click()
   await page.getByRole('dialog').getByRole('button',{name:'继续',exact:true}).click()
   const backup=page.waitForEvent('download')
   await page.getByRole('dialog').getByRole('button',{name:'立即备份',exact:true}).click();await backup
  }
  await expect(page.locator('[data-workspace-ready="world"]')).toBeVisible({timeout:15000})
  await expect(page.getByRole('navigation',{name:'世界页面导航'})).toBeVisible()
  if((definition.modules?.length??0)>1)await expect(page.getByRole('navigation',{name:'世界内容导航'}).locator('[aria-current="page"]')).toHaveCount(1)
 }}
 expect(errors).toEqual([])
})
