// =====================================================
// 取引トランザクションの同時実行(複製バグ)検証
// 1つの出品に対し2人が同時購入 → 片方だけ成功、
// goldとアイテムの総量が保存されることを確認する。
// 使い方: DATABASE_URL を設定して `node tests/trade-concurrency.js`
// (このスクリプトは検証用にテストデータを作成し、最後に後始末します)
// =====================================================
const { prisma } = require("../src/db");

async function buyOnce(listingId, buyerId) {
  // index.js の /api/market/buy と同じロジック(HTTPを介さず直接実行)
  try {
    const r = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT id, "sellerId", "itemId", qty, price, status
        FROM "MarketListing" WHERE id = ${listingId} FOR UPDATE`;
      const l = rows[0];
      if (!l || l.status !== "open") throw new Error("UNAVAILABLE");
      const buyer = await tx.player.findUnique({ where: { id: buyerId } });
      if (buyer.gold < l.price) throw new Error("INSUFFICIENT_GOLD");
      await tx.player.update({ where: { id: buyerId }, data: { gold: { decrement: l.price } } });
      await tx.player.update({ where: { id: l.sellerId }, data: { gold: { increment: l.price } } });
      const ex = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId: buyerId, itemId: l.itemId } } });
      if (ex) await tx.playerItem.update({ where: { id: ex.id }, data: { qty: ex.qty + l.qty } });
      else await tx.playerItem.create({ data: { playerId: buyerId, itemId: l.itemId, qty: l.qty } });
      await tx.marketListing.update({ where: { id: listingId }, data: { status: "sold", buyerId, soldAt: new Date() } });
      return "OK";
    });
    return r;
  } catch (e) {
    return "FAIL:" + e.message;
  }
}

async function main() {
  // マスタにitemが必要(seed済み前提。無ければ最初の1件を使う)
  const item = await prisma.itemMaster.findFirst();
  if (!item) throw new Error("itemMaster が空です。先に npm run seed を実行してください。");

  // テスト用ユーザー/プレイヤーを作成
  const mk = async (loginId, gold, withItem) => {
    const u = await prisma.user.create({ data: { loginId, passwordHash: "x" } });
    const pl = await prisma.player.create({ data: { userId: u.id, name: loginId, gold } });
    if (withItem) await prisma.playerItem.create({ data: { playerId: pl.id, itemId: item.itemId, qty: 1 } });
    return pl;
  };
  const tag = "t" + Date.now();
  const seller = await mk(tag + "_seller", 0, true);
  const buyerA = await mk(tag + "_A", 1000, false);
  const buyerB = await mk(tag + "_B", 1000, false);

  // 出品(在庫1, 価格100)= エスクロー
  const price = 100;
  const listing = await prisma.$transaction(async (tx) => {
    await tx.playerItem.delete({ where: { playerId_itemId: { playerId: seller.id, itemId: item.itemId } } });
    return tx.marketListing.create({ data: { sellerId: seller.id, itemId: item.itemId, qty: 1, price, status: "open" } });
  });

  // 2人が同時購入
  const [rA, rB] = await Promise.all([buyOnce(listing.id, buyerA.id), buyOnce(listing.id, buyerB.id)]);

  // 結果集計
  const after = async (id) => (await prisma.player.findUnique({ where: { id } })).gold;
  const inv = async (id) => {
    const r = await prisma.playerItem.findUnique({ where: { playerId_itemId: { playerId: id, itemId: item.itemId } } });
    return r ? r.qty : 0;
  };
  const sellerGold = await after(seller.id);
  const aGold = await after(buyerA.id), bGold = await after(buyerB.id);
  const aItem = await inv(buyerA.id), bItem = await inv(buyerB.id);
  const succeeded = [rA, rB].filter((x) => x === "OK").length;

  console.log("=== 結果 ===");
  console.log("buyerA:", rA, "/ buyerB:", rB);
  console.log("成功した購入数:", succeeded, "(期待: 1)");
  console.log("売り手gold:", sellerGold, "(期待: " + price + ")");
  console.log("買い手gold A/B:", aGold, bGold, "(片方だけ -" + price + ")");
  console.log("買い手item A/B:", aItem, bItem, "(片方だけ 1)");
  const itemTotal = aItem + bItem; // 売り手は出品で手放し済み
  console.log("アイテム総量(買い手側):", itemTotal, "(期待: 1 = 複製なし)");
  const ok = succeeded === 1 && sellerGold === price && itemTotal === 1 && (aGold + bGold === 2000 - price);
  console.log(ok ? "\n✅ 複製なし・整合性OK" : "\n❌ 不整合あり");

  // 後始末(テストデータ削除)
  await prisma.marketListing.deleteMany({ where: { id: listing.id } });
  await prisma.playerItem.deleteMany({ where: { playerId: { in: [seller.id, buyerA.id, buyerB.id] } } });
  for (const pl of [seller, buyerA, buyerB]) {
    await prisma.player.delete({ where: { id: pl.id } });
    await prisma.user.delete({ where: { id: pl.userId } });
  }
  console.log("(テストデータ後始末 完了)");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
