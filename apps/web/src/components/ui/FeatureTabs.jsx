import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const SMOOTH = [0.22, 1, 0.36, 1];

/**
 * Tabbed feature showcase — adapted from Feature108 for Voira.
 * Each tab shows a content card with description and image placeholder.
 */
export function FeatureTabs({
  badge,
  heading,
  description,
  tabs = [],
  className,
}) {
  return (
    <section className={cn('py-20 sm:py-28 lg:py-32', className)}>
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-4 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: SMOOTH }}
        >
          {badge && (
            <Badge variant="outline" className="rounded-full">
              {badge}
            </Badge>
          )}
          <h2 className="max-w-3xl font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.5] whitespace-pre-line">
            {heading}
          </h2>
          {description && (
            <p className="max-w-2xl text-lg text-muted-foreground">{description}</p>
          )}
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue={tabs[0]?.value} className="mt-10">
          <TabsList className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6 md:gap-10">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors duration-200 data-[state=active]:bg-accent/10 data-[state=active]:text-accent cursor-pointer"
              >
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mx-auto mt-8 max-w-screen-xl">
            {tabs.map((tab) => (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="grid place-items-center gap-12 lg:grid-cols-2 lg:gap-10"
              >
                {/* Text side */}
                <div className="flex flex-col gap-5">
                  {tab.content.badge && (
                    <Badge variant="outline" className="w-fit rounded-full bg-background">
                      {tab.content.badge}
                    </Badge>
                  )}
                  <h3 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
                    {tab.content.title}
                  </h3>
                  <p className="text-muted-foreground lg:text-lg leading-relaxed">
                    {tab.content.description}
                  </p>
                  {tab.content.buttonText && tab.content.buttonHref && (
                    <a href={tab.content.buttonHref} className="no-underline">
                      <Button className="mt-2 w-fit gap-2 bg-accent text-white hover:bg-accent/90" size="lg">
                        {tab.content.buttonText}
                      </Button>
                    </a>
                  )}
                </div>
                {/* Image side — same dimensions for all tabs (max-w-md, 4/3) */}
                <div className="relative w-full max-w-md mx-auto overflow-hidden rounded-xl border border-border bg-muted/30" style={{ aspectRatio: '4/3' }}>
                  {tab.content.imageSrc ? (
                    <img
                      src={tab.content.imageSrc}
                      alt={tab.content.imageAlt || ''}
                      width={448}
                      height={336}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {tab.content.icon || <span className="text-muted-foreground/30 text-sm">Media placeholder</span>}
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  );
}
