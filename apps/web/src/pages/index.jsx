import Layout from "./Layout.jsx";

import VoiceProfile from "./VoiceProfile";

import RefineDraft from "./RefineDraft";

import Growth from "./Growth";

import Library from "./Library";

import Practice from "./Practice";
import AuthGate from '@/components/AuthGate';

import Pricing from "./Pricing";

import Profile from "./Profile";

import Draft from "./Draft";

import Settings from "./Settings";

import Speak from "./Speak";

import Auth from "./Auth";
import { useAuth } from '@/contexts/AuthContext';
import React from 'react';
import { Navigate } from 'react-router-dom';

import Home from "./Home";

import Landing from "./Landing";

import Privacy from "./Privacy";

import Terms from "./Terms";

import Contact from "./Contact";
import ResetPassword from './ResetPassword';

// Legacy Admin page (self-management) - keeping for backwards compatibility
import Admin from "./Admin";
// New Admin Dashboard pages
import { 
  AdminLayout, 
  AdminDashboard, 
  AdminUsers, 
  AdminSessions, 
  AdminDrafts, 
  AdminAuditLog 
} from "./admin/index";
import AdminGuard from '@/components/AdminGuard';

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

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
                <Route path="/pricing" element={<AuthGate><Pricing /></AuthGate>} />
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
    );
}

function AuthRoute() {
    const { user, session, isLoading } = useAuth();
    if (isLoading) return null;
    if (user || session) return <Navigate to="/home" replace />;
    return <Auth />;
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}