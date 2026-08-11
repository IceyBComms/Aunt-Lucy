import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Employers from "@/pages/Employers";
import SupportPage from "@/pages/SupportPage";
import OrganiseSignIn from "@/pages/OrganiseSignIn";
import OrganiseCheckEmail from "@/pages/OrganiseCheckEmail";
import OrganiseVerify from "@/pages/OrganiseVerify";
import OrganiseCreatePage from "@/pages/OrganiseCreatePage";
import OrganiseAddSlots from "@/pages/OrganiseAddSlots";
import OrganisePublish from "@/pages/OrganisePublish";
import OrganiseDashboard from "@/pages/OrganiseDashboard";
import InviteClaim from "@/pages/InviteClaim";
import ReleaseSlot from "@/pages/ReleaseSlot";
import Manage from "@/pages/Manage";
import GiftExperience from "@/pages/GiftExperience";
import GiftSigning from "@/pages/GiftSigning";
import CardReview from "@/pages/CardReview";
import BuyChooseTier from "@/pages/BuyChooseTier";
import BuyDetails from "@/pages/BuyDetails";
import HardestTimes from "@/pages/HardestTimes";
import PilotApply from "@/pages/PilotApply";
import OrganisePilotApplications from "@/pages/OrganisePilotApplications";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import { useUmami } from "@/lib/umami";

const queryClient = new QueryClient();

// Reset scroll to the top whenever the route changes. Without this, wouter
// keeps the previous page's scroll position, so following a link low on one
// page (e.g. the "Start free" line at the bottom of the homepage) lands the
// user mid-page on the next one. Plain scroll-to-top on every navigation.
function ScrollToTop() {
  const [pathname] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/employers" component={Employers} />

      {/* The free self-serve crisis path (Item 14) — reached from the
          homepage's quiet line. No purchase, ever. */}
      <Route path="/hardest-times" component={HardestTimes} />

      <Route path="/s/:slug" component={SupportPage} />

      {/* Organiser flow */}
      <Route path="/organise" component={OrganiseSignIn} />
      <Route path="/organise/check-email" component={OrganiseCheckEmail} />
      <Route path="/organise/verify" component={OrganiseVerify} />
      <Route path="/organise/create" component={OrganiseCreatePage} />
      <Route path="/organise/create/:pageId/slots" component={OrganiseAddSlots} />
      <Route path="/organise/create/:pageId/publish" component={OrganisePublish} />
      <Route path="/organise/dashboard" component={OrganiseDashboard} />

      {/* Trusted helper invite claim */}
      <Route path="/invite/:token" component={InviteClaim} />

      {/* Helper releases a slot they can no longer make (cancel_token from the
          claim-confirmation email). No account — the token is the key. */}
      <Route path="/release/:token" component={ReleaseSlot} />

      {/* Recipient management — add people, send the Aunt Lucy invites */}
      <Route path="/manage/:token" component={Manage} />

      {/* Buying a gift. Deliberately not under /gift — that prefix belongs to
          the recipient's experience, and /gift/:giftId would swallow it. */}
      <Route path="/buy" component={BuyChooseTier} />
      <Route path="/buy/:tierId" component={BuyDetails} />

      {/* Workplace team card — colleagues sign (public signing_token), the
          organiser reviews + seals (private organiser_token). Both keyed by a
          token distinct from the recipient's redemption token. */}
      <Route path="/sign/:signingToken" component={GiftSigning} />
      <Route path="/card/:organiserToken" component={CardReview} />

      {/* Gift experience — the recipient's keepsake (redemption_token) */}
      <Route path="/gift/:giftId" component={GiftExperience} />

      {/* Pilot application */}
      <Route path="/pilot" component={PilotApply} />
      <Route path="/organise/pilot-applications" component={OrganisePilotApplications} />

      {/* Privacy policy */}
      <Route path="/privacy" component={PrivacyPolicy} />

      {/* Terms of Service (includes the Refund & Cancellation Policy at #refund) */}
      <Route path="/terms" component={TermsOfService} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useUmami();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTop />
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
