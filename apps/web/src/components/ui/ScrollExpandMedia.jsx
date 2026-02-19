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
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [isMobileState, setIsMobileState] = useState(false);

  const sectionRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    setScrollProgress(0);
    setShowContent(false);
  }, [mediaType]);

  useEffect(() => {
    const updateProgressFromScroll = () => {
      if (!mediaRef.current) return;
      const rect = mediaRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;

      // Use the media center relative to viewport to drive progress.
      const mediaCenter = (rect.top + rect.bottom) / 2;
      const vh = viewportHeight;

      // We want:
      // - progress = 0 when media center is higher up (closing starts earlier)
      // - progress = 1 when media center is nearer the top
      // Higher closedY = closing starts earlier when scrolling up
      const closedY = vh * 0.75; // image center at or below this => fully closed (was 0.65)
      const openY = vh * 0.20;   // image center at or above this => fully open

      let target;
      if (mediaCenter >= closedY) {
        target = 0;
      } else if (mediaCenter <= openY) {
        target = 1;
      } else {
        target = (closedY - mediaCenter) / (closedY - openY);
      }

      // Smooth interpolation:
      // - opening (target > prev) is much slower for prolonged easing
      // - closing (target < prev) is faster and more responsive, so it finishes earlier
      setScrollProgress((prev) => {
        const speed = target < prev ? 0.55 : 0.12; // Faster closing (was 0.45)
        return prev + (target - prev) * speed;
      });
      setShowContent(target >= 0.9);
    };

    const handleWheel = (e) => {
      if (!sectionRef.current || !mediaRef.current) return;
      const sectionRect = sectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 1;

      // Check if we're in the section's viewport
      const inSection =
        sectionRect.top < vh * 1.5 && sectionRect.bottom > -vh * 0.5;

      if (!inSection) return; // Let normal scroll happen outside

      // Get current progress to decide if we should slow scroll
      const mediaRect = mediaRef.current.getBoundingClientRect();
      const mediaCenter = (mediaRect.top + mediaRect.bottom) / 2;
      const closedY = vh * 0.75; // Match the threshold in updateProgressFromScroll
      const openY = vh * 0.20;

      let currentTarget;
      if (mediaCenter >= closedY) {
        currentTarget = 0;
      } else if (mediaCenter <= openY) {
        currentTarget = 1;
      } else {
        currentTarget = (closedY - mediaCenter) / (closedY - openY);
      }

      // If fully expanded (progress ~= 1) or fully closed (progress ~= 0), allow normal scroll
      if (currentTarget >= 0.98 || currentTarget <= 0.02) {
        return; // Normal scroll
      }

      // Slow down scroll while animating (about 15% of normal speed for more prolonged easing)
      e.preventDefault();
      const scrollDelta = e.deltaY * 0.15;
      window.scrollBy(0, scrollDelta);

      // Update progress after scroll
      requestAnimationFrame(updateProgressFromScroll);
    };

    updateProgressFromScroll();
    window.addEventListener('scroll', updateProgressFromScroll);
    window.addEventListener('resize', updateProgressFromScroll);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('scroll', updateProgressFromScroll);
      window.removeEventListener('resize', updateProgressFromScroll);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobileState(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const mediaWidth = 300 + scrollProgress * (isMobileState ? 650 : 1250);
  const mediaHeight = 400 + scrollProgress * (isMobileState ? 200 : 400);
  const textTranslateX = scrollProgress * (isMobileState ? 180 : 150);

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
          <motion.div
            className="absolute inset-0 z-0 h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - scrollProgress }}
            transition={{ duration: 0.1 }}
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
                  alt="Background"
                  className="w-screen h-screen object-cover object-center"
                />
                <div className="absolute inset-0 bg-black/40" />
              </>
            ) : null}
          </motion.div>

          <div className="container mx-auto flex flex-col items-center justify-start relative z-10">
            <div className="flex flex-col items-center justify-center w-full h-[100dvh] relative">
              <div
                ref={mediaRef}
                className="absolute z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none rounded-2xl"
                style={{
                  width: `${mediaWidth}px`,
                  height: `${mediaHeight}px`,
                  maxWidth: '95vw',
                  maxHeight: '85vh',
                  boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.3)',
                }}
              >
                {mediaType === 'video' ? (
                  <div className="relative w-full h-full pointer-events-none">
                    <video
                      src={mediaSrc}
                      poster={posterSrc}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <div
                      className="absolute inset-0 z-10"
                      style={{ pointerEvents: 'none' }}
                    />

                    <motion.div
                      className="absolute inset-0 bg-black/30 rounded-xl"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full">
                    <img
                      src={mediaSrc}
                      alt={title || 'Media content'}
                      className="w-full h-full object-cover rounded-xl"
                    />

                    <motion.div
                      className="absolute inset-0 bg-black/50 rounded-xl"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.7 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                )}

                <div className="flex flex-col items-center text-center relative z-10 mt-4 transition-none">
                  {date && (
                    <p
                      className="text-2xl text-blue-200"
                      style={{ transform: `translateX(-${textTranslateX}vw)` }}
                    >
                      {date}
                    </p>
                  )}
                  {scrollToExpand && (
                    <p
                      className="text-blue-200 font-medium text-center"
                      style={{ transform: `translateX(${textTranslateX}vw)` }}
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
              >
                <motion.h2
                  className="text-4xl md:text-5xl lg:text-6xl font-bold text-blue-200 transition-none"
                  style={{
                    transform: `translateX(-${textTranslateX}vw) scale(${
                      1 + scrollProgress * 0.2
                    })`,
                  }}
                >
                  {firstWord}
                </motion.h2>
                <motion.h2
                  className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-blue-200 transition-none"
                  style={{
                    transform: `translateX(${textTranslateX}vw) scale(${
                      1 + scrollProgress * 0.2
                    })`,
                  }}
                >
                  {restOfTitle}
                </motion.h2>
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

