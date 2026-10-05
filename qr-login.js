// qr-login.js
// 一次性扫码登录：用天翼云盘 App 扫码授权，在 .token/ 下生成长期有效的 token。
// 之后每天的自动签到直接用 token 登录，不走密码登录，也就不再受“设备锁”影响。
require("dotenv").config();
const fs = require("fs");
const { CloudClient, FileTokenStore } = require("cloud189-sdk");
const QRCode = require("qrcode");
const accounts = require("./accounts");
const { mask } = require("./src/utils");

const tokenDir = ".token";
const SINGLE_QR_MS = 150000; // 每个二维码最多等 2.5 分钟
const MAX_ROUNDS = 4; // 最多换 4 个二维码

function qrLoginOnce(userName, round) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok, msg) => {
      if (!done) {
        done = true;
        resolve({ ok, msg });
      }
    };
    const cloudClient = new CloudClient({
      token: new FileTokenStore(`${tokenDir}/${userName}.json`),
      onQRCodeReady: async (qrUrl) => {
        console.log(`\n===== 第 ${round} 个登录二维码（2分半内有效） =====`);
        console.log("如果二维码显示异常，直接复制下面链接用浏览器打开：");
        console.log(qrUrl);
        try {
          console.log(await QRCode.toString(qrUrl, { type: "terminal", small: true }));
        } catch (e) {
          console.log("(字符二维码生成失败，用上面的链接)");
        }
        console.log("📱 天翼云盘 App → 扫一扫 → 扫描上方二维码；只有一部手机就截屏，去相册长按二维码识别");
      },
      qrLoginOptions: { pollInterval: 3000, timeout: SINGLE_QR_MS },
    });
    cloudClient.getUserSizeInfo().then(
      () => finish(true, "ok"),
      (e) => finish(false, (e && e.message) || String(e))
    );
    // 保险：如果 SDK 内部吞掉异常导致一直不返回，这里强制结束本轮
    setTimeout(() => finish(false, "等待超时"), SINGLE_QR_MS + 20000);
  });
}

async function main() {
  if (!accounts.length) {
    console.log("❌ 没读到账号：确认 TY_ACCOUNTS Secret 已配置（和每日签到用同一个）");
    process.exit(1);
  }
  for (const { userName } of accounts) {
    const shown = mask(String(userName), 3, 7);
    console.log(`\n########## 账号 ${shown} 开始扫码 ##########`);
    let ok = false;
    for (let round = 1; round <= MAX_ROUNDS && !ok; round++) {
      const r = await qrLoginOnce(userName, round);
      ok = r.ok;
      console.log(ok ? "✅ 扫码登录成功，token 已保存" : `⏳ 本轮没扫上（${r.msg}），换个新二维码…`);
    }
    if (!ok) console.log(`❌ 账号 ${shown} 这次没完成，稍后重跑这个流程再试`);
  }
  const files = fs.existsSync(tokenDir)
    ? fs.readdirSync(tokenDir).filter((f) => f.endsWith(".json"))
    : [];
  console.log("\n.token/ 目录：", files.length ? files.join(", ") : "(空)");
  if (!files.length) {
    console.log("❌ token 没生成");
    process.exit(1);
  }
  console.log("🎉 完成！以后每天 10:35 的自动签到会直接用 token 登录，不用再扫码。");
}

main().catch((e) => {
  console.log("❌", (e && e.message) || e);
  process.exit(1);
});
