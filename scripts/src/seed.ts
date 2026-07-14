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

  const GIFT_TOKEN = "test-gift-token";
  const existingGift = await db.query.giftsTable.findFirst({
    where: eq(giftsTable.redemptionToken, GIFT_TOKEN),
  });
  if (existingGift) {
    console.log(`Gift /${GIFT_TOKEN} already exists, skipping.`);
  } else {
    const [gift] = await db
      .insert(giftsTable)
      .values({
        redemptionToken: GIFT_TOKEN,
        purchaserName: "Brightpath Studio",
        purchaserEmail: "people@brightpath.example",
        recipientName: "Sarah",
        recipientEmail: "sarah@example.com",
        occasion: "new_baby",
        giftedByNote: [
          "Sarah — before you head off, we wanted to say something properly.",
          "These next few months are going to be big, beautiful and, let's be honest, a little bit chaotic. We couldn't be happier for you and Dan.",
          "So we've sorted something practical. Whenever you're ready, this becomes your own private page where we can drop off meals, run the odd errand, or just lend a hand around the house — no asking required, no fuss.",
          "Go and soak up every newborn cuddle. We've got your back over here.",
        ].join("\n\n"),
        amountCents: 7900,
        currency: "AUD",
        status: "delivered",
        deliveredAt: today,
      })
      .returning();

    const notes = [
      { signerName: "Priya", message: "So thrilled for you! Can't wait to meet the little one. I'm on standby for as many lasagnes as you can eat." },
      { signerName: "Tom", message: "Enjoy every cuddle. The studio won't be the same without your very particular coffee order. See you when you're ready. x" },
      { signerName: "Meg", message: "Sending you so much love. I've done the newborn thing twice — ring me at 3am, I'll be up too. Genuinely, anytime." },
      { signerName: "Hannah", message: "Congratulations Sarah! Put your feet up and let us do the running around. School runs, shopping, whatever — just say." },
      { signerName: "Dev", message: "The best is yet to come. So happy for you and Dan. We'll keep your desk plant alive, promise." },
      { signerName: "James", message: "Wishing you rest, cuddles and the occasional full night's sleep. We're all cheering you on from Fitzroy." },
    ];

    await db.insert(giftSigningsTable).values(
      notes.map((note, i) => ({
        giftId: gift.id,
        signerName: note.signerName,
        message: note.message,
        // Space the timestamps so they return in a stable, intended order.
        createdAt: new Date(today.getTime() + i * 1000),
      })),
    );

    console.log(`Seeded /gift/${GIFT_TOKEN} (ID: ${gift.id}, ${notes.length} signings)`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
