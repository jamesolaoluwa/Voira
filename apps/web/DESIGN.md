# Design

Visual system for Voira's web app (`apps/web`). Tokens live in `src/index.css`; Tailwind maps them in `tailwind.config.js` (`darkMode: ["class"]`). The app has a light and a dark theme; the landing page force-enables dark and layers a scoped cinematic treatment on top.

## Color

Colors are stored as HSL channel triplets in CSS variables and consumed via `hsl(var(--token))`.

### App theme (global)

- Brand accent: cyan `hsl(185 100% 50%)` dark / `hsl(185 100% 42%)` light -> `--accent` / `--primary`.
  (Previously violet `#5B5CF6`; replaced to avoid AI-palette gradients while keeping a clear brand color.)
- Light: `--background: 0 0% 100%`, `--foreground: 0 0% 9%`, `--muted-foreground: 0 0% 45%`, `--border: 0 0% 90%`.
- Dark: `--background: 0 0% 0%` (pure black), `--foreground: 240 6% 96%` (off-white), `--muted-foreground: 0 0% 60%`, translucent borders/surfaces (`0 0% 100% / 0.08`, `/ 0.03`).
- Full shadcn token set present: card, popover, primary, secondary, muted, accent, destructive, input, ring, surface, chart-1..5, sidebar-*.

### Landing scope (cinematic, brand register)

Applied only within the landing wrapper, not the global `.dark` tokens:

- Deep navy background: `--background: 201 100% 13%` (interim; may revert to pure black later).
- Foreground white `0 0% 100%`, muted-foreground `240 4% 66%`.
- Border/input `0 0% 18%`.
- A fullscreen looping background video carries most visual depth; text sits over it with a scrim for contrast (WCAG AA).

## Typography

- Global heading font: `Inter Tight` (`--font-heading`, weights 400/500/600/700).
- Global body font: `Inter` (`--font-body`, weights 400/500/600). Loaded via Google Fonts in `index.html` with preload + `display=swap`.
- Landing display font (scoped): `Instrument Serif` for hero H1 and logo wordmark, paired with Inter body on a serif+sans contrast axis. This is a deliberate departure from the global sans to give the marketing surface a cinematic, editorial feel.
- Type-scale utilities in `index.css`: `.text-display`, `.text-headline`, `.text-title`, `.text-body`, `.text-body-lg`, `.text-muted`.
- Hero display: large clamp (cap ~6rem/96px), tight tracking (floor -0.04em), `text-wrap: balance` on headings.

## Components

- Base UI: shadcn/ui (`new-york` style, `cssVariables: true`) in `src/components/ui/` (~70 components). Radix primitives underneath.
- Custom/Voira: `Orb` (WebGL/OGL animated orb), `VoiceVisualizer`, `TextLoop`, `ScrollExpandMedia`, `TestimonialSection`, `FeatureTabs`, `ArcGalleryHero`, `EtherealShadow`, `GradientButton`, `GradientText`, `LiquidButton`, `ButtonColorful`, `WavyBackground`.
- Landing additions: glassmorphic nav bar and `.liquid-glass` CTA buttons (gradient-border via masked `::before`). Glass is used sparingly and purposefully, not as a default surface.
- Placement note: the `Orb` moves from the landing hero to the Auth page's left panel; the landing hero uses the video background instead.

## Layout

- React SPA (Vite 6 + react-router-dom v7). `BrowserRouter` with declarative routes in `src/pages/index.jsx`.
- Container width: `max-w-7xl mx-auto` with generous horizontal padding (`px-6`/`px-8`).
- Landing is a vertical scroll of full-bleed sections; hero is vertically centered, minimalist, no decorative blobs or eyebrow kickers.
- Radius scale from `--radius: 0.5rem` (lg/md/sm derived).

## Motion

- Easing token: `--ease-smooth: cubic-bezier(0.22, 1, 0.36, 1)` (ease-out; no bounce/elastic).
- Durations: `--duration-fast 0.3s`, `--duration-normal 0.45s`, `--duration-slow 0.6s`.
- Libraries: Framer Motion (scroll parallax, staggered reveals), plus CSS keyframes.
- Landing hero: `fade-rise` keyframe (opacity + translateY) with staggered delays on H1 / subtext / CTA; looping muted background video.
- Reduced motion: every animation must provide a `prefers-reduced-motion: reduce` alternative (crossfade/instant; pause video).
