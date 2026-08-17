import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

await page.getByRole("button", { name: "Type" }).click();
await page.getByPlaceholder("Edit, then send").waitFor({ state: "visible", timeout: 5000 });
await page.getByPlaceholder("Edit, then send").fill("Remember that I like short briefings.");
await page.getByLabel("Send").click();

const deadline = Date.now() + 35000;
let status = "";
while (Date.now() < deadline) {
  status = ((await page.locator("main").innerText()) || "").slice(0, 400);
  if (/speaking|idle|done|remember|brief|error|model/i.test(status) && !/thinking/i.test(status))
    break;
  if (/thinking/i.test(status)) {
    await page.waitForTimeout(800);
    continue;
  }
  await page.waitForTimeout(400);
}

await page.screenshot({ path: "/workspace/screenshots/moya-reply.png" });
await page.getByLabel("Transcript").click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/moya-history-after.png" });

await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: "/workspace/screenshots/moya-mobile.png" });

console.log(JSON.stringify({ errors, status }, null, 2));
await browser.close();
