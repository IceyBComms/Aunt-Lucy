import { useEffect } from "react";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // For the purpose of this prototype focusing on Flow 3, 
    // we redirect the root to the test page immediately.
    setLocation("/s/test-page");
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
        <Heart className="w-8 h-8 text-primary fill-primary/20" />
      </div>
      <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Rally</h1>
      <p className="text-muted-foreground">Taking you to a support page...</p>
    </div>
  );
}
