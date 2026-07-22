import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SlotResponse } from "@workspace/api-client-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog-framer";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { format, parseISO } from "date-fns";
import { ClipboardList } from "lucide-react";

const claimSchema = z.object({
  firstName: z.string().min(2, "Please enter your first name"),
  contact: z.string().min(5, "Please provide an email or phone number"),
  note: z.string().optional(),
  // Opt-in, defaults false (see defaultValues) — hidden by default, per the
  // brief. When false, only the recipient sees the name; other helpers see the
  // ambient count instead.
  showName: z.boolean().optional(),
});

type ClaimFormData = z.infer<typeof claimSchema>;

interface ClaimDialogProps {
  slot: SlotResponse | null;
  recipientName: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClaimFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function ClaimDialog({ slot, recipientName, isOpen, onClose, onSubmit, isSubmitting }: ClaimDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClaimFormData>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      firstName: "",
      contact: "",
      note: "",
      showName: false,
    },
  });

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => reset(), 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, reset]);

  if (!slot) return null;

  // Undated slots are flexible offers, so the sentence below drops the date
  // rather than naming one — "taking the Whenever suits slot" is not English.
  const formattedDate = slot.slotDate
    ? format(parseISO(slot.slotDate), "EEEE, MMMM d")
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>You're amazing.</DialogTitle>
        <DialogDescription className="mt-2 text-base">
          {formattedDate ? (
            <>
              Just a few details so we know who's taking the{" "}
              <strong className="text-foreground font-medium">{formattedDate}</strong>{" "}
              slot.
            </>
          ) : (
            <>Just a few details so we know who's taking this one.</>
          )}
        </DialogDescription>
      </DialogHeader>

      {slot.notes && (
        <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 -mt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/70 flex items-center gap-1.5 mb-2">
            <ClipboardList className="w-3.5 h-3.5" />
            Task instructions
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {slot.notes}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className="text-foreground/80 pl-1">
            First name
          </Label>
          <Input
            id="firstName"
            placeholder="Jane"
            {...register("firstName")}
            className={errors.firstName ? "border-destructive focus-visible:ring-destructive/20" : ""}
          />
          {errors.firstName && (
            <p className="text-sm text-destructive pl-1">{errors.firstName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact" className="text-foreground/80 pl-1">
            Email or phone
          </Label>
          <Input
            id="contact"
            placeholder="jane@example.com"
            {...register("contact")}
            className={errors.contact ? "border-destructive focus-visible:ring-destructive/20" : ""}
          />
          {errors.contact && (
            <p className="text-sm text-destructive pl-1">{errors.contact.message}</p>
          )}
          <p className="text-xs text-muted-foreground pl-1">
            Only shared with {recipientName} — never shown publicly.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note" className="text-foreground/80 pl-1">
            Message for {recipientName}{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="note"
            placeholder="e.g. I can drop things off around 5:30pm — just let me know if you need anything specific."
            {...register("note")}
          />
          <p className="text-xs text-muted-foreground pl-1">
            Anything useful for {recipientName} to know — timing, questions, a kind word.
          </p>
        </div>

        {/* Name visibility (Item 7). PLACEHOLDER copy — Kate to approve.
            Hidden by default: unchecked means only {recipientName} sees the name;
            other helpers see an ambient "N people helping" count instead. */}
        <label className="flex items-start gap-3 rounded-2xl bg-secondary/40 border border-secondary-border p-4 cursor-pointer">
          <input
            type="checkbox"
            {...register("showName")}
            className="mt-0.5 h-4 w-4 accent-primary flex-none"
          />
          <span className="text-sm text-foreground/80 leading-relaxed">
            <span className="font-medium text-foreground">Show my name to everyone helping</span>
            <br />
            Otherwise it stays just between you and {recipientName}.
          </span>
        </label>

        <div className="pt-4">
          <Button
            type="submit"
            className="w-full font-serif text-lg"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Claiming..." : "I've got this"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
