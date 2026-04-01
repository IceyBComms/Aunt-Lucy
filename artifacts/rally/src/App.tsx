import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import SupportPage from "@/pages/SupportPage";
import OrganiseSignIn from "@/pages/OrganiseSignIn";
import OrganiseCheckEmail from "@/pages/OrganiseCheckEmail";
import OrganiseVerify from "@/pages/OrganiseVerify";
import OrganiseCreatePage from "@/pages/OrganiseCreatePage";
import OrganiseAddSlots from "@/pages/OrganiseAddSlots";
import OrganisePublish from "@/pages/OrganisePublish";
import OrganiseDashboard from "@/pages/OrganiseDashboard";
import InviteClaim from "@/pages/InviteClaim";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
