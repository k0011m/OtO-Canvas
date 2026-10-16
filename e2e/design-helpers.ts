import type { Page } from "@playwright/test";

/** 新しい補助パネルを必要なときだけ開き、既存機能の検証を同じ操作入口へ合わせる。 */
export async function openEditorOptions(page: Page) {
  const toggle = page.getByRole("button", { name: "場面と編集の設定", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}
