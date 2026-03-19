import React, { useEffect, useState } from 'react';

// Simple arc gallery used in the final CTA section
export function ArcGalleryHero({
  images,
  // arc angle in degrees (wider arc = larger spread)
  startAngle = 10,
  endAngle = 190,
  // radius controls how tall the arc is
  radiusLg = 420,
  radiusMd = 340,
  radiusSm = 260,
  // card size per breakpoint
  cardSizeLg = 120,
  cardSizeMd = 100,
  cardSizeSm = 80,
  className = '',
}) {
  const [dimensions, setDimensions] = useState({
    radius: radiusLg,
    cardSize: cardSizeLg,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setDimensions({ radius: radiusSm, cardSize: cardSizeSm });
      } else if (width < 1024) {
        setDimensions({ radius: radiusMd, cardSize: cardSizeMd });
      } else {
        setDimensions({ radius: radiusLg, cardSize: cardSizeLg });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [radiusLg, radiusMd, radiusSm, cardSizeLg, cardSizeMd, cardSizeSm]);

  const count = Math.max(images.length, 2);
  const step = (endAngle - startAngle) / (count - 1);

  return (
    <div
      className={
        'relative overflow-hidden flex items-start justify-center ' +
        className
      }
    >
      <div
        className="relative mx-auto"
        style={{
          width: '100%',
          maxWidth: 1200,
          // taller so the center card sits higher
          height: dimensions.radius * 1.2,
        }}
      >
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2">
          {images.map((src, i) => {
            const angle = startAngle + step * i;
            const angleRad = (angle * Math.PI) / 180;

            const x = Math.cos(angleRad) * dimensions.radius;
            const y = Math.sin(angleRad) * dimensions.radius;

            return (
              <div
                key={i}
                className="absolute arc-animate-fade-in-up opacity-0"
                style={{
                  width: dimensions.cardSize,
                  height: dimensions.cardSize,
                  left: `calc(50% + ${x}px)`,
                  bottom: `${y}px`,
                  transform: 'translate(-50%, 50%)',
                  animationDelay: `${i * 80}ms`,
                  animationFillMode: 'forwards',
                  zIndex: count - i,
                }}
              >
                <div
                  className="rounded-2xl shadow-xl overflow-hidden ring-1 ring-white/10 bg-white/5 backdrop-blur-sm transition-transform hover:scale-105 w-full h-full"
                  style={{ transform: `rotate(${angle / 4}deg)` }}
                >
                  <img
                    src={src}
                    alt={`Scene ${i + 1}`}
                    className="block w-full h-full object-cover"
                    draggable={false}
                    onError={(e) => {
                      e.currentTarget.src =
                        'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&q=80';
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

