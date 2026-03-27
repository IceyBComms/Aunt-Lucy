import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSupportPage, 
  useClaimSlot,
  getGetSupportPageQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ClaimSlotRequest } from "@workspace/api-client-react/src/generated/api.schemas";

export function useSupportPageFlow(slug: string) {
  const [pin, setPin] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Determine if we should pause fetching because we know we need a PIN but don't have it
  const [needsPin, setNeedsPin] = useState(false);

  const query = useGetSupportPage(slug, { pin }, {
    query: {
      enabled: !!slug && (!needsPin || !!pin),
      retry: false,
    }
  });

  // Intercept 401 errors to trigger PIN flow
  if (query.isError) {
    const error = query.error as any;
    if (error?.status === 401 || error?.response?.status === 401 || error?.pinRequired) {
      if (!needsPin) setNeedsPin(true);
    }
  }

  const claimMutation = useClaimSlot({
    mutation: {
      onSuccess: (_, variables) => {
        // Invalidate the support page query to refresh the slots
        queryClient.invalidateQueries({
          queryKey: getGetSupportPageQueryKey(slug, { pin })
        });
      },
      onError: (error) => {
        const status = (error as any)?.status || (error as any)?.response?.status;
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
    // Setting pin will automatically trigger a refetch due to the query key/params changing
  }, []);

  const claimSlot = useCallback(async (slotId: string, data: ClaimSlotRequest, recipientName: string) => {
    try {
      await claimMutation.mutateAsync({ slotId, data });
      toast({
        title: "You've got this.",
        description: `${recipientName} will be so grateful.`,
        className: "bg-primary text-primary-foreground border-none rounded-2xl shadow-lg font-serif text-lg py-4",
      });
      return true;
    } catch (e) {
      return false; // Error handled by mutation onError
    }
  }, [claimMutation, toast]);

  return {
    ...query,
    needsPin: needsPin && !query.isSuccess,
    submitPin,
    claimSlot,
    isClaiming: claimMutation.isPending
  };
}
