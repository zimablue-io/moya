import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.mouse.move(200, 200);
await page.waitForTimeout(250);
await page.screenshot({ path: "/workspace/screenshots/moya-gaze-tl.png" });
await page.mouse.move(1100, 620);
await page.waitForTimeout(250);
await page.screenshot({ path: "/workspace/screenshots/moya-gaze-br.png" });
await page.getByRole("button", { name: "Type" }).click();
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/moya-type-open.png" });
const text = await page.locator("main").innerText();
console.log(
  JSON.stringify({
    text: text.slice(0, 280),
    composer: await page.getByPlaceholder("Edit, then send").isVisible(),
  }),
);
await browser.close();
