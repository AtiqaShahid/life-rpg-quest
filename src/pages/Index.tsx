// The root route is handled directly in App.tsx → <Landing />.
// This file is kept as a safe fallback.
import { Navigate } from "react-router-dom";
const Index = () => <Navigate to="/" replace />;
export default Index;
