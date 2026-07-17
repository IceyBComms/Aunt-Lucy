import {
  db,
  supportPagesTable,
  slotsTable,
  giftsTable,
  giftSigningsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedPage(slug: string, seeder: () => Promise<void>): Promise<void> {
  const existing = await db.query.supportPagesTable.findFirst({
    where: eq(supportPagesTable.slug, slug),
  });
  if (existing) {
    console.log(`Page /${slug} already exists, skipping.`);
    return;
  }
  await seeder();
}

async function seedGift(
  redemptionToken: string,
  seeder: () => Promise<void>,
): Promise<void> {
  const existing = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, redemptionToken),
  });
  if (existing) {
    console.log(`Gift /gift/${redemptionToken} already exists, skipping.`);
    return;
  }
  await seeder();
}

async function seed() {
  console.log("Seeding database...");

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const day = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return fmt(d);
  };

  await seedPage("test-page", async () => {
    const [page] = await db
      .insert(supportPagesTable)
      .values({
        slug: "test-page",
        recipientName: "Sarah",
        situationDescription:
          "Sarah is recovering at home after surgery and could use some help with meals and the kids.",
        location: "Fitzroy, Melbourne",
        status: "active",
        privacy: "open",
      })
      .returning();

    await db.insert(slotsTable).values([
      {
        pageId: page.id,
        slotType: "meal",
        slotDate: day(0),
        slotTime: "18:00",
        notes: "Vegetarian household — no meat please.",
        isClaimed: true,
        claimedByName: "Jess",
        claimedByContact: "jess@example.com",
        claimedNote: "I'll bring a big pot of soup!",
      },
      {
        pageId: page.id,
        slotType: "meal",
        slotDate: day(1),
        slotTime: "18:00",
        notes: "Vegetarian household — no meat please.",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "school_pickup",
        slotDate: day(1),
        slotTime: "15:30",
        notes: "St Kilda Primary, Gate B. Kids are Mia (8) and Tom (6).",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "meal",
        slotDate: day(2),
        slotTime: "18:00",
        notes: "Vegetarian household — no meat please.",
        isClaimed: true,
        claimedByName: "Marcus",
        claimedByContact: "marcus@example.com",
      },
      {
        pageId: page.id,
        slotType: "errand",
        slotDate: day(2),
        slotTime: null,
        notes: "Pharmacy pickup — prescription will be ready from Wednesday morning.",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "dog_walking",
        slotDate: day(3),
        slotTime: "08:00",
        notes: "Buddy the golden retriever — very friendly, 30-minute walk is fine.",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "shopping",
        slotDate: day(3),
        slotTime: null,
        notes: "Weekly groceries — a list will be shared the night before.",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "visit",
        slotDate: day(4),
        slotTime: "14:00",
        notes: "Just company for an hour — Sarah loves a cup of tea and a chat.",
        isClaimed: false,
      },
      {
        pageId: page.id,
        slotType: "meal",
        slotDate: day(5),
        slotTime: "18:00",
        notes: "Vegetarian household — no meat please.",
        isClaimed: false,
      },
    ]);

    console.log(`Seeded /s/test-page (ID: ${page.id})`);
  });

  await seedPage("pin-test-page", async () => {
    const [pinPage] = await db
      .insert(supportPagesTable)
      .values({
        slug: "pin-test-page",
        recipientName: "Alex",
        situationDescription: "Alex is going through a difficult time and has requested some privacy.",
        location: "Richmond, Melbourne",
        status: "active",
        privacy: "pin_protected",
        pin: await bcrypt.hash("1234", 10),
      })
      .returning();

    await db.insert(slotsTable).values([
      {
        pageId: pinPage.id,
        slotType: "meal",
        slotDate: day(1),
        slotTime: "18:00",
        notes: "No allergies.",
        isClaimed: false,
      },
      {
        pageId: pinPage.id,
        slotType: "errand",
        slotDate: day(2),
        slotTime: null,
        notes: "Post office and pharmacy.",
        isClaimed: false,
      },
    ]);

    console.log(`Seeded /s/pin-test-page (PIN: 1234, ID: ${pinPage.id})`);
  });

  await seedGift("demo-gift-sarah", async () => {
    const [gift] = await db
      .insert(giftsTable)
      .values({
        redemptionToken: "demo-gift-sarah",
        purchaserName: "Brightpath Studio",
        purchaserEmail: "people@brightpath.example",
        recipientName: "Sarah",
        occasion: "new_baby",
        giftedByNote:
          "The whole team at Brightpath Studio put this together, just for you.",
        amountCents: 7900,
        currency: "AUD",
        status: "delivered",
        deliveredAt: new Date(),
      })
      .returning();

    await db.insert(giftSigningsTable).values([
      {
        giftId: gift.id,
        signerName: "Priya",
        message:
          "So thrilled for you! Can't wait to meet the little one. I'm on standby for as many lasagnes as you can eat.",
      },
      {
        giftId: gift.id,
        signerName: "Tom",
        message:
          "Enjoy every cuddle. The studio won't be the same without your very particular coffee order. See you when you're ready. x",
      },
      {
        giftId: gift.id,
        signerName: "Meg",
        message:
          "Sending you so much love. I've done the newborn thing twice — ring me at 3am, I'll be up too. Genuinely, anytime.",
      },
    ]);

    console.log(`Seeded /gift/demo-gift-sarah (ID: ${gift.id})`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
