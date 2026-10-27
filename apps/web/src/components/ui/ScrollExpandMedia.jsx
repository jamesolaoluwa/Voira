import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export function ScrollExpandMedia({
  mediaType = 'video',
  mediaSrc,
  posterSrc,
  bgImageSrc,
  bgColor,
  title,
  date,
  scrollToExpand,
  textBlend,
  children,
  className = '',
}) {
  const [showContent, setShowContent] = useState(false);

  const sectionRef = useRef(null);
  const mediaRef = useRef(null);
  const videoRef = useRef(null);
  const posterRef = useRef(null);
  const bgRef = useRef(null);
  const overlayRef = useRef(null);
  const dateRef = useRef(null);
  const hintRef = useRef(null);
  const titleFirstRef = useRef(null);
  const titleRestRef = useRef(null);
  const wasExpandedRef = useRef(false);
  const scrollProgressRef = useRef(0);
  const isMobileRef = useRef(false);
  const nearViewportRef = useRef(false);
  const showContentRef = useRef(false);
  const rafRef = useRef(null);
  const scheduledRef = useRef(false);
  const mediaTypeRef = useRef(mediaType);
  mediaTypeRef.current = mediaType;

  useEffect(() => {
    scrollProgressRef.current = 0;
    showContentRef.current = false;
    setShowContent(false);
    applyVisuals(0);
  }, [mediaType]);

  const computeTarget = (mediaEl) => {
    const rect = mediaEl.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const mediaCenter = (rect.top + rect.bottom) / 2;
    const closedY = vh * 0.88;
    const openY = vh * 0.20;

    if (mediaCenter >= closedY) return 0;
    if (mediaCenter <= openY) return 1;
    return (closedY - mediaCenter) / (closedY - openY);
  };

  const applyVisuals = (scrollProgress) => {
    const isMobile = isMobileRef.current;
    const mediaWidth = (isMobile ? 400 : 500) + scrollProgress * (isMobile ? 550 : 1050);
    const mediaHeight = 400 + scrollProgress * (isMobile ? 200 : 400);
    const textProgress = Math.pow(scrollProgress, 4.0);
    const textTranslateX = textProgress * (isMobile ? 180 : 370);
    const titleScale = 1 + scrollProgress * 0.2;

    if (mediaRef.current) {
      mediaRef.current.style.width = `${mediaWidth}px`;
      mediaRef.current.style.height = `${mediaHeight}px`;
    }
    if (bgRef.current) {
      bgRef.current.style.opacity = String(1 - scrollProgress);
    }
    if (dateRef.current) {
      dateRef.current.style.transform = `translateX(-${textTranslateX}vw)`;
    }
    if (hintRef.current) {
      hintRef.current.style.transform = `translateX(${textTranslateX}vw)`;
    }
    if (titleFirstRef.current) {
      titleFirstRef.current.style.transform = `translateX(-${textTranslateX}vw) scale(${titleScale})`;
    }
    if (titleRestRef.current) {
      titleRestRef.current.style.transform = `translateX(${textTranslateX}vw) scale(${titleScale})`;
    }
    if (posterRef.current) {
      posterRef.current.style.opacity = scrollProgress < 0.3 ? '1' : '0';
      posterRef.current.style.zIndex = scrollProgress < 0.3 ? '2' : '0';
    }
    if (videoRef.current) {
      videoRef.current.style.opacity = scrollProgress >= 0.3 ? '1' : '0';
      videoRef.current.style.zIndex = scrollProgress >= 0.3 ? '1' : '0';
    }
    if (overlayRef.current) {
      const overlayOpacity = mediaTypeRef.current === 'video'
        ? 0.5 - scrollProgress * 0.3
        : 0.7 - scrollProgress * 0.3;
      overlayRef.current.style.opacity = String(overlayOpacity);
    }

    if (mediaTypeRef.current === 'video' && videoRef.current) {
      const isExpanded = scrollProgress >= 0.3;
      if (isExpanded && !wasExpandedRef.current) {
        try {
          videoRef.current.currentTime = 0;
        } catch {
          /* ignore */
        }
        videoRef.current.play().catch(() => {});
        wasExpandedRef.current = true;
      } else if (!isExpanded && wasExpandedRef.current) {
        videoRef.current.pause();
        try {
          videoRef.current.currentTime = 0;
        } catch {
          /* ignore */
        }
        wasExpandedRef.current = false;
      }
    }
  };

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;

    const scheduleUpdate = () => {
      if (!nearViewportRef.current || scheduledRef.current) return;
      scheduledRef.current = true;
      rafRef.current = requestAnimationFrame(() => {
        scheduledRef.current = false;
        if (!mediaRef.current) return;
        const target = computeTarget(mediaRef.current);
        const prev = scrollProgressRef.current;
        const speed = target < prev ? 0.55 : 0.12;
        const next = prev + (target - prev) * speed;
        scrollProgressRef.current = next;
        applyVisuals(next);

        const shouldShow = target >= 0.9;
        if (shouldShow !== showContentRef.current) {
          showContentRef.current = shouldShow;
          setShowContent(shouldShow);
        }
      });
    };

    const handleWheel = (e) => {
      if (!sectionRef.current || !mediaRef.current) return;
      const sectionRect = sectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const inSection =
        sectionRect.top < vh * 1.5 && sectionRect.bottom > -vh * 0.5;
      if (!inSection) return;

      const mediaRect = mediaRef.current.getBoundingClientRect();
      const mediaCenter = (mediaRect.top + mediaRect.bottom) / 2;
      const closedY = vh * 0.88;
      const openY = vh * 0.20;

      let currentTarget;
      if (mediaCenter >= closedY) {
        currentTarget = 0;
      } else if (mediaCenter <= openY) {
        currentTarget = 1;
      } else {
        currentTarget = (closedY - mediaCenter) / (closedY - openY);
      }

      if (currentTarget >= 0.98 || currentTarget <= 0.02) {
        return;
      }

      e.preventDefault();
      window.scrollBy(0, e.deltaY * 0.15);
      scheduleUpdate();
    };

    const handleResize = () => {
      isMobileRef.current = window.innerWidth < 768;
      scheduleUpdate();
    };

    const enable = () => {
      if (nearViewportRef.current) {
        scheduleUpdate();
        return;
      }
      nearViewportRef.current = true;
      window.addEventListener('scroll', scheduleUpdate, { passive: true });
      window.addEventListener('resize', handleResize);
      window.addEventListener('wheel', handleWheel, { passive: false });
      scheduleUpdate();
    };

    const disable = () => {
      nearViewportRef.current = false;
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel);
    };

    const section = sectionRef.current;
    if (!section) return undefined;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) enable();
        else disable();
      },
      { rootMargin: '80% 0px' }
    );
    io.observe(section);

    return () => {
      io.disconnect();
      disable();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const firstWord = title ? title.split(' ')[0] : '';
  const restOfTitle = title ? title.split(' ').slice(1).join(' ') : '';

  return (
    <div
      ref={sectionRef}
      className={
        'transition-colors duration-700 ease-in-out overflow-x-hidden ' +
        className
      }
    >
      <section className="relative flex flex-col items-center justify-start min-h-[100dvh]">
        <div className="relative w-full flex flex-col items-center min-h-[100dvh]">
          <div
            ref={bgRef}
            className="absolute inset-0 z-0 h-full"
            style={{ opacity: 1 }}
          >
            {bgColor ? (
              <div
                className="absolute inset-0 w-full h-full"
                style={{ backgroundColor: bgColor }}
              />
            ) : bgImageSrc ? (
              <>
                <img
                  src={bgImageSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-screen h-screen object-cover object-center"
                />
                <div className="absolute inset-0 bg-black/40" />
              </>
            ) : null}
          </div>

          <div className="container mx-auto flex flex-col items-center justify-start relative z-10">
            <div className="flex flex-col items-center justify-center w-full h-[100dvh] relative">
              <div
                ref={mediaRef}
                className="absolute z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none rounded-2xl"
                style={{
                  width: isMobileRef.current ? '400px' : '500px',
                  height: '400px',
                  maxWidth: '95vw',
                  maxHeight: '85vh',
                  boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.3)',
                }}
              >
                {mediaType === 'video' ? (
                  <div className="relative w-full h-full pointer-events-none">
                    {posterSrc && (
                      <img
                        ref={posterRef}
                        src={posterSrc}
                        alt={title || 'Media content'}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-300"
                        style={{ opacity: 1, zIndex: 2 }}
                      />
                    )}

                    <video
                      ref={videoRef}
                      src={mediaSrc}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-300"
                      style={{ opacity: 0, zIndex: 0 }}
                    />

                    <div
                      className="absolute inset-0 z-10"
                      style={{ pointerEvents: 'none' }}
                    />

                    <div
                      ref={overlayRef}
                      className="absolute inset-0 bg-black/30 rounded-xl"
                      style={{ opacity: 0.5 }}
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full">
                    <img
                      src={mediaSrc}
                      alt={title || 'Media content'}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover rounded-xl"
                    />

                    <div
                      ref={overlayRef}
                      className="absolute inset-0 bg-black/50 rounded-xl"
                      style={{ opacity: 0.7 }}
                    />
                  </div>
                )}

                <div className="flex flex-col items-center text-center relative z-10 mt-4 transition-none">
                  {date && (
                    <p
                      ref={dateRef}
                      className="text-2xl text-blue-200"
                    >
                      {date}
                    </p>
                  )}
                  {scrollToExpand && (
                    <p
                      ref={hintRef}
                      className="text-blue-200 font-medium text-center"
                    >
                      {scrollToExpand}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`flex items-center justify-center text-center gap-4 w-full relative z-10 transition-none flex-col ${
                  textBlend ? 'mix-blend-difference' : 'mix-blend-normal'
                }`}
                style={{ transform: 'translateY(2rem)' }}
              >
                <h2
                  ref={titleFirstRef}
                  className="text-4xl md:text-5xl lg:text-6xl font-bold text-blue-200 transition-none"
                >
                  {firstWord}
                </h2>
                <h2
                  ref={titleRestRef}
                  className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-blue-200 transition-none"
                >
                  {restOfTitle}
                </h2>
              </div>
            </div>

            <motion.section
              className="flex flex-col w-full px-8 py-12 md:px-16 md:py-16 lg:px-20 lg:py-24 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ duration: 0.7 }}
            >
              {children}
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
}
