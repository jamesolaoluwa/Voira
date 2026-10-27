import React, { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import AuthGate from '@/components/AuthGate';
import AdminGuard from '@/components/AdminGuard';

// Landing is the default/public entry point — keep it eager so the most common
// first paint doesn't wait on an extra lazy chunk round-trip.
import Landing from "./Landing";

// Everything else is code-split so a landing visitor never downloads the whole
// app (admin dashboard, recharts, etc.). Each page has a default export.
const Layout = lazy(() => import("./Layout.jsx"));
const VoiceProfile = lazy(() => import("./VoiceProfile"));
const RefineDraft = lazy(() => import("./RefineDraft"));
const Growth = lazy(() => import("./Growth"));
const Library = lazy(() => import("./Library"));
const Practice = lazy(() => import("./Practice"));
const Pricing = lazy(() => import("./Pricing"));
const Profile = lazy(() => import("./Profile"));
const Draft = lazy(() => import("./Draft"));
const Settings = lazy(() => import("./Settings"));
const Speak = lazy(() => import("./Speak"));
const Auth = lazy(() => import("./Auth"));
const Home = lazy(() => import("./Home"));
const Privacy = lazy(() => import("./Privacy"));
const Terms = lazy(() => import("./Terms"));
const Contact = lazy(() => import("./Contact"));
const ResetPassword = lazy(() => import('./ResetPassword'));

// Legacy Admin page (self-management) - keeping for backwards compatibility
const Admin = lazy(() => import("./Admin"));
// New Admin Dashboard pages
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./admin/AdminUsers"));
const AdminSessions = lazy(() => import("./admin/AdminSessions"));
const AdminDrafts = lazy(() => import("./admin/AdminDrafts"));
const AdminAuditLog = lazy(() => import("./admin/AdminAuditLog"));

const PAGES = {
    
    VoiceProfile: VoiceProfile,
    
    RefineDraft: RefineDraft,
    
    Growth: Growth,
    
    Library: Library,
    
    Practice: Practice,
    
    Pricing: Pricing,
    
    Profile: Profile,
    
    Draft: Draft,
    
    Settings: Settings,
    
    Speak: Speak,
    
    Auth: Auth,
    
    Home: Home,
    
    Landing: Landing,
    
    Privacy: Privacy,
    
    Terms: Terms,
    
    Contact: Contact,
    
    Admin: Admin,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    // default to Landing instead of the first PAGES key
    return pageName || 'Landing';
}

// If user is authenticated, go to Home; otherwise render Landing.
function LandingOrHome() {
    const { user, session, isLoading } = useAuth();
    if (isLoading) return null;
    if (session || user) {
        return <Navigate to="/home" replace />;
    }
    return <Landing />;
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <Suspense fallback={null}>
            <Routes>
                {/* Public routes - no Layout, no AuthGate */}
                <Route path="/" element={<LandingOrHome />} />
                <Route path="/landing" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/contact" element={<Contact />} />

                {/* Protected routes - wrapped with Layout which renders TopNav and AuthDebug; AuthGate prevents unauthenticated access */}
                <Route element={<Layout currentPageName={currentPage} />}>
                    <Route path="/home" element={<AuthGate><Home /></AuthGate>} />
                    <Route path="/voiceprofile" element={<AuthGate><VoiceProfile /></AuthGate>} />
                    <Route path="/growth" element={<AuthGate><Growth /></AuthGate>} />
                    <Route path="/library" element={<AuthGate><Library /></AuthGate>} />
                    <Route path="/practice" element={<AuthGate><Practice /></AuthGate>} />
                    <Route path="/profile" element={<AuthGate><Profile /></AuthGate>} />
                    <Route path="/settings" element={<AuthGate><Settings /></AuthGate>} />
                    <Route path="/speak" element={<AuthGate><Speak /></AuthGate>} />
                    <Route path="/refinedraft" element={<AuthGate><RefineDraft /></AuthGate>} />
                    <Route path="/draft" element={<AuthGate><Draft /></AuthGate>} />
                    <Route path="/pricing" element={<Pricing />} />
                    {/* Legacy admin self-management page */}
                    <Route path="/admin-self" element={<AdminGuard><Admin /></AdminGuard>} />
                </Route>

                {/* Admin Dashboard - separate layout, admin-only */}
                <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="sessions" element={<AdminSessions />} />
                    <Route path="drafts" element={<AdminDrafts />} />
                    <Route path="audit" element={<AdminAuditLog />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
