import { useState, useCallback, useEffect } from "react";
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
// closed, or the page exists but isn't active yet — and the only thing that
// tells them apart is the message it sends back. Matching on that message is
// deliberate: the server alone decides whether a slug resolves to a real page,
// so a guessed or malformed slug never reaches the "not live yet" branch. It
// gets the doesn't-exist message, which doesn't match, and falls through to the
// generic text. Keep this string in step with
// artifacts/api-server/src/routes/pages.ts.
const NOT_LIVE_YET_ERROR = "This support page isn't available yet.";

function isNotLiveYetError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { error?: unknown }).error === NOT_LIVE_YET_ERROR
  );
}

export function useSupportPageFlow(slug: string) {
  const [pin, setPin] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [needsPin, setNeedsPin] = useState(false);

  const query = useGetSupportPage(slug, { pin }, {
    query: {
      queryKey: getGetSupportPageQueryKey(slug, { pin }),
      enabled: !!slug && (!needsPin || !!pin),
      retry: false,
    }
  });

  // Move PIN detection into an effect to avoid setState during render
  useEffect(() => {
    if (query.isError) {
      const error = query.error;
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 401) {
        setNeedsPin(true);
      }
    }
  }, [query.isError, query.error]);

  const claimMutation = useClaimSlot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetSupportPageQueryKey(slug, { pin })
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

  const submitPin = useCallback((newPin: string) => {
    setPin(newPin);
  }, []);

  const claimSlot = useCallback(async (slotId: string, data: ClaimSlotRequest): Promise<SlotResponse | null> => {
    try {
      // Success is now confirmed by the in-dialog "You're confirmed!" screen
      // (with the calendar link), so the old success toast is gone — it was
      // redundant with the persistent confirmation. Error toasts still fire via
      // claimMutation.onError below.
      const result = await claimMutation.mutateAsync({ slotId, data: { ...data, pin: pin ?? undefined } });
      // Return the claim response (incl. calendarUrl) so the caller can show the
      // post-claim confirmation with an "Add to your calendar" link. null on failure.
      return result;
    } catch {
      return null;
    }
  }, [claimMutation, pin]);

  return {
    ...query,
    needsPin: needsPin && !query.isSuccess,
    // A real page that simply hasn't been switched on yet — told apart from a
    // genuine 404 so the visitor can be asked to hang on to their link rather
    // than be told the page doesn't exist.
    notLiveYet: query.isError && isNotLiveYetError(query.error),
    submitPin,
    claimSlot,
    isClaiming: claimMutation.isPending
  };
}
