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
    submitPin,
    claimSlot,
    isClaiming: claimMutation.isPending
  };
}
