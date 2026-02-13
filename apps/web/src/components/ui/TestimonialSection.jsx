import React from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

/**
 * Testimonial section with overlaid text on portrait images.
 * Images can be placeholders for now.
 */
export function TestimonialSection({ title, subtitle, testimonials = [] }) {
  return (
    <section className="w-full py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12 text-center">
        {/* Header */}
        <motion.h2
          className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {title}
        </motion.h2>
        <motion.p
          className="mx-auto mt-4 max-w-2xl text-lg text-white/50"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        >
          {subtitle}
        </motion.p>

        {/* Grid — 4 columns on lg */}
        <motion.div
          className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
        >
          {testimonials.map((t) => (
            <motion.div
              key={t.id}
              className="group relative overflow-hidden rounded-2xl"
              variants={itemVariants}
            >
              {/* Image */}
              <div className="relative">
                {t.imageSrc ? (
                  <img
                    src={t.imageSrc}
                    alt={t.name}
                    className="h-[380px] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="h-[380px] w-full bg-white/[0.04] flex items-center justify-center">
                    <span className="text-white/20 text-sm">Photo placeholder</span>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 text-left text-white">
                <Quote className="mb-2 h-6 w-6 text-white/25" aria-hidden />
                <blockquote className="text-sm font-medium leading-relaxed line-clamp-4">
                  {t.quote}
                </blockquote>
                <p className="mt-3 text-xs font-semibold">
                  &mdash; {t.name}
                  {t.role && <span className="ml-1 text-white/40 font-normal">{t.role}</span>}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
