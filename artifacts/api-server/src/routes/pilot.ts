import { Router, type IRouter } from "express";
import { db, pilotApplicationsTable } from "@workspace/db";
import { sendPilotApplicationNotification } from "../lib/email";

const router: IRouter = Router();

const ORG_TYPES = ["healthcare", "school", "community", "faith", "social_work", "other"] as const;

// POST /api/pilot — submit a pilot application (public)
router.post("/pilot", async (req, res) => {
  const {
    fullName,
    role,
    email,
    phone,
    orgName,
    orgType,
    usageDescription,
    hearAboutUs,
  } = req.body as {
    fullName?: string;
    role?: string;
    email?: string;
    phone?: string;
    orgName?: string;
    orgType?: string;
    usageDescription?: string;
    hearAboutUs?: string;
  };

  const errors: string[] = [];

  const fullNameTrimmed = typeof fullName === "string" ? fullName.trim() : "";
  if (!fullNameTrimmed) errors.push("Full name is required.");

  const roleTrimmed = typeof role === "string" ? role.trim() : "";
  if (!roleTrimmed) errors.push("Role is required.");

  const emailTrimmed = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    errors.push("A valid email address is required.");
  }

  const orgNameTrimmed = typeof orgName === "string" ? orgName.trim() : "";
  if (!orgNameTrimmed) errors.push("Organisation name is required.");

  if (!orgType || !ORG_TYPES.includes(orgType as any)) {
    errors.push("Please select an organisation type.");
  }

  const usageTrimmed = typeof usageDescription === "string" ? usageDescription.trim() : "";
  if (!usageTrimmed) errors.push("Please describe how you plan to use Aunt Lucy.");

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  await db.insert(pilotApplicationsTable).values({
    fullName: fullNameTrimmed,
    role: roleTrimmed,
    email: emailTrimmed,
    phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    orgName: orgNameTrimmed,
    orgType: orgType as any,
    usageDescription: usageTrimmed,
    hearAboutUs:
      typeof hearAboutUs === "string" && hearAboutUs.trim()
        ? hearAboutUs.trim()
        : null,
  });

  // Fire-and-forget notification — don't block the response
  sendPilotApplicationNotification({
    fullName: fullNameTrimmed,
    role: roleTrimmed,
    email: emailTrimmed,
    phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    orgName: orgNameTrimmed,
    orgType: orgType as string,
    usageDescription: usageTrimmed,
    hearAboutUs:
      typeof hearAboutUs === "string" && hearAboutUs.trim()
        ? hearAboutUs.trim()
        : null,
  }).catch(() => {});

  res.status(201).json({ ok: true });
});

export default router;
