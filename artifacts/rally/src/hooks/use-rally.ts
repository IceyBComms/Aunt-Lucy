import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSupportPage, 
  useClaimSlot,
  getGetSupportPageQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ClaimSlotRequest, SlotResponse } from "@workspace/api-client-react";

// pages.ts answers 404 for three different reasons — no such slug, the page is
// CLOSED, or the page exists but isn't active yet — and the only thing that
// tells them apart is the message it sends back. Matching on that message is
// deliberate: the server alone decides whether a slug resolves to a real page,
// so a guessed or malformed slug never reaches either named branch. It gets the
// doesn't-exist message, which matches neither, and falls through to the
// generic text.
//
// ⚠️ THIS HAS NOW BEEN THE SAME BUG THREE TIMES. #028 was the "not live yet"
// case being thrown away; bug #090 was the CLOSED case being thrown away, and
// a closed page read "This page doesn't exist or has been removed" — both
// wrong and a statement about the page. So the third reason is not bolted on
// beside the second: the reasons are a TABLE, and adding a fourth means adding
// a row to it.
//
// Keep these strings in step with artifacts/api-server/src/routes/pages.ts.
// api-server's pageClosureDrift.test.ts fails if the closed one drifts.
const PAGE_404_REASONS = {
  "This support page isn't available yet.": "not_live_yet",
  "This support page has been closed.": "closed",
} as const;

export type SupportPage404Reason = (typeof PAGE_404_REASONS)[keyof typeof PAGE_404_REASONS];

/** Which of the server's named 404s is this, if any? */
export function supportPage404Reason(error: unknown): SupportPage404Reason | null {
  if (!(error instanceof ApiError) || error.status !== 404) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null) return null;
  const message = (data as { error?: unknown }).error;
  if (typeof message !== "string") return null;
  return PAGE_404_REASONS[message as keyof typeof PAGE_404_REASONS] ?? null;
}

export function useSupportPageFlow(slug: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // The page is fetched once, plainly. There is no second attempt carrying a
  // code, and no 401 to watch for: the PIN was dropped on 21 September 2026
  // (Kate's ruling, bug #129). The only thing that decides what a visitor sees
  // is what the server puts in the response.
  const query = useGetSupportPage(slug, {
    query: {
      queryKey: getGetSupportPageQueryKey(slug),
      enabled: !!slug,
      retry: false,
    }
  });

  const claimMutation = useClaimSlot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetSupportPageQueryKey(slug)
        });
      },
      onError: (error) => {
        const status = error instanceof ApiError ? error.status : undefined;
        if (status === 409) {
          toast({
            title: "Slot already taken",
            description: "Someone just claimed this slot — thank you for wanting to help! Check if there's another slot you can take.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Oops, something went wrong",
            description: "We couldn't claim that slot right now. Please try again.",
            variant: "destructive",
          });
        }
      }
    }
  });

  const claimSlot = useCallback(async (slotId: string, data: ClaimSlotRequest): Promise<SlotResponse | null> => {
    try {
      // Success is now confirmed by the in-dialog "You're confirmed!" screen
      // (with the calendar link), so the old success toast is gone — it was
      // redundant with the persistent confirmation. Error toasts still fire via
      // claimMutation.onError below.
      const result = await claimMutation.mutateAsync({ slotId, data });
      // Return the claim response (incl. calendarUrl) so the caller can show the
      // post-claim confirmation with an "Add to your calendar" link. null on failure.
      return result;
    } catch {
      return null;
    }
  }, [claimMutation]);

  const reason = query.isError ? supportPage404Reason(query.error) : null;

  return {
    ...query,
    // A real page that simply hasn't been switched on yet — told apart from a
    // genuine 404 so the visitor can be asked to hang on to their link rather
    // than be told the page doesn't exist.
    notLiveYet: reason === "not_live_yet",
    // A real page that has been closed. It is over, and the screen says only
    // that — never why (bug #090, ruling 6).
    closed: reason === "closed",
    claimSlot,
    isClaiming: claimMutation.isPending
  };
}
