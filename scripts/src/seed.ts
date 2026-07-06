import { db, supportPagesTable, slotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

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

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
