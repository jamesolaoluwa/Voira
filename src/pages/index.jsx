import Layout from "./Layout.jsx";

import VoiceProfile from "./VoiceProfile";

import RefineDraft from "./RefineDraft";

import Growth from "./Growth";

import Library from "./Library";

import Practice from "./Practice";

import Pricing from "./Pricing";

import Profile from "./Profile";

import Draft from "./Draft";

import Settings from "./Settings";

import Speak from "./Speak";

import Auth from "./Auth";

import Home from "./Home";

import Landing from "./Landing";

import Privacy from "./Privacy";

import Terms from "./Terms";

import Contact from "./Contact";

import Admin from "./Admin";

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
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<VoiceProfile />} />
                
                
                <Route path="/VoiceProfile" element={<VoiceProfile />} />
                
                <Route path="/RefineDraft" element={<RefineDraft />} />
                
                <Route path="/Growth" element={<Growth />} />
                
                <Route path="/Library" element={<Library />} />
                
                <Route path="/Practice" element={<Practice />} />
                
                <Route path="/Pricing" element={<Pricing />} />
                
                <Route path="/Profile" element={<Profile />} />
                
                <Route path="/Draft" element={<Draft />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/Speak" element={<Speak />} />
                
                <Route path="/Auth" element={<Auth />} />
                
                <Route path="/Home" element={<Home />} />
                
                <Route path="/Landing" element={<Landing />} />
                
                <Route path="/Privacy" element={<Privacy />} />
                
                <Route path="/Terms" element={<Terms />} />
                
                <Route path="/Contact" element={<Contact />} />
                
                <Route path="/Admin" element={<Admin />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}