import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Ghost } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  useEffect(() => { console.error("404:", location.pathname); }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong relative max-w-md rounded-3xl p-10 text-center animate-scale-in">
        <Ghost className="mx-auto mb-4 h-14 w-14 text-secondary animate-float" />
        <div className="font-mono text-xs tracking-widest text-secondary">ERROR_404</div>
        <h1 className="mt-2 font-display text-4xl font-bold neon-text-primary">Lost in the void</h1>
        <p className="mt-2 text-sm text-muted-foreground">This zone doesn&apos;t exist on the map.</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-gradient-primary px-6 py-2.5 font-display font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.03]">
          Return to base
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
