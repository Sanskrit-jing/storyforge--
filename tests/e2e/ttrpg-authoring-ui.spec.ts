import { test, expect } from "@playwright/test";
import { seedCurrentTtrpgProduct } from "./helpers/current-products";
test("跑团新 UI：无世界配置、跨页保存与刷新、来源出口及审查方案", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("./ttrpg/vision");
  await expect(page.getByTestId("ttrpg-author-page")).toBeVisible();
  await page.getByLabel("战役名称", { exact: true }).fill("新 UI 调查战役");
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .getByRole("button", { name: "规则与村规", exact: true })
    .click();
  await expect(page).toHaveURL(/project=/);
  await page.reload();
  await expect(page.getByLabel("战役名称", { exact: true })).toHaveValue(
    "新 UI 调查战役",
  );
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .getByRole("button", { name: "确认制作方案", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "开始制作，需要一个世界引擎" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const load = new Function("p", "return import(p)");
    await (
      await load("/storyforge/src/lib/world-engine/mist-harbor-preset.ts")
    ).createMistHarborWorld();
  });
  await page
    .getByRole("navigation", { name: "跑团页面导航", exact: true })
    .getByRole("button", { name: "世界引擎", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择此版本", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "保存出口范围", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存出口范围", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "出口范围已保存" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .count()
    .then(async (count) => {
      if (!count)
        await page
          .getByRole("navigation", { name: "跑团页面导航", exact: true })
          .getByRole("button", { name: "制作台", exact: true })
          .click();
    });
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .getByRole("button", { name: "确认制作方案", exact: true })
    .click();
  await page
    .getByTestId("ttrpg-production-wizard")
    .getByRole("checkbox")
    .check();
  await page
    .getByRole("button", { name: "生成或更新审查方案", exact: true })
    .click();
  await expect(
    page.getByTestId("ttrpg-campaign-proposal-selector"),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "确认采用当前提案混合", exact: false }).uncheck();
  await page
    .getByRole("checkbox", { name: "确认采用当前提案混合", exact: false })
    .check();
  await page.getByRole("button", { name: "保存提案选择", exact: true }).click();
  await expect(
    page.getByText("提案已保存，开始制作仍需明确授权。"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "确认采用当前提案混合", exact: false }),
  ).toBeChecked();
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .getByRole("button", { name: "制作流程", exact: true })
    .click();
  await expect(page.getByTestId("product-production-studio")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建 Production", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const load = new Function("p", "return import(p)");
      const { db } = await load("/storyforge/src/lib/db/schema.ts");
      return db.productBuilds.count();
    }),
  ).toBe(0);
});
test("跑团新 UI 读取现有 Build 和团局，内容分类在内侧导航", async ({
  page,
}) => {
  const seed = await seedCurrentTtrpgProduct(page, {
    title: "已制作战役",
    gmMode: "human",
    playerController: "human",
  });
  await page.goto(
    `./ttrpg/scenes?project=${seed.projectId}&production=${seed.productionId}`,
  );
  await expect(page.getByTestId("ttrpg-author-page")).toBeVisible();
  await expect(page.locator(".ttrpg-object").first()).toBeVisible();
  const main = page.getByRole("navigation", {
    name: "跑团页面导航",
    exact: true,
  });
  await expect(
    main.getByRole("button", { name: "战役与场景", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "跑团内容导航", exact: true })
      .getByRole("button", { name: "战役与场景", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goto(
    `./ttrpg/play?project=${seed.projectId}&session=${seed.sessionId}`,
  );
  await expect(page.getByTestId("ttrpg-runtime-panel")).toBeVisible();
  await page
    .getByRole("navigation", { name: "跑团内容导航", exact: true })
    .getByRole("button", { name: "团局与续团", exact: true })
    .click();
  await expect(page.getByTestId("formal-ttrpg-campaign-guide")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "内容目录", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "跑团内容导航", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
