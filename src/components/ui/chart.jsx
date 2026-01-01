"use client";
import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Themes mapping used when generating per-chart CSS variables
const THEMES = {
  light: "",
  dark: ".dark",
};

const ChartContext = React.createContext(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

// ChartContainer: wrapper around Recharts' ResponsiveContainer that injects per-chart CSS safely
const ChartContainer = React.forwardRef(({ id, className, children, config = {}, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "Chart";

// ChartStyle: safely injects a <style> tag into document.head containing CSS variables for the chart
const ChartStyle = ({ id, config = {} }) => {
  const colorConfig = React.useMemo(() => Object.entries(config || {}).filter(([, cfg]) => cfg && (cfg.theme || cfg.color)), [config]);

  React.useEffect(() => {
    if (!colorConfig.length) return;

    const parts = Object.entries(THEMES).map(([theme, prefix]) => {
      const body = colorConfig
        .map(([key, itemConfig]) => {
          const color = itemConfig.theme?.[theme] || itemConfig.color;
          return color ? `  --color-${key}: ${color};` : null;
        })
        .filter(Boolean)
        .join('\n');

      return `${prefix} [data-chart=${id}] {\n${body}\n}`;
    });

    const styleContent = parts.join('\n');
    const el = document.createElement('style');
    el.setAttribute('data-chart-style', id);
    el.textContent = styleContent;
    document.head.appendChild(el);

    return () => {
      try { document.head.removeChild(el); } catch (e) {}
    };
  }, [id, JSON.stringify(colorConfig)]);

  return null;
};

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef((
  {
    active,
    payload,
    className,
    indicator = "dot",
    hideLabel = false,
    hideIndicator = false,
    label,
    labelFormatter,
    labelClassName,
    formatter,
    color,
    nameKey,
    labelKey,
  },
  ref
) => {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey || item.dataKey || item.name || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value = !labelKey && typeof label === "string" ? config[label]?.label || label : itemConfig?.label;

    if (labelFormatter) return labelFormatter(value);
    return value;
  }, [hideLabel, payload, label, labelFormatter, labelKey, config]);

  if (!active || !payload?.length) return null;

  const [item] = payload;

  return (
    <div ref={ref} className={cn("rounded-md border bg-popover p-2 shadow-lg", className)}>
      {!hideLabel && (
        <div className={cn("font-medium", labelClassName)}>
          {tooltipLabel}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!hideIndicator && (
          indicator === "dot" ? (
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color || item.color }}
            />
          ) : (
            <div
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color || item.color }}
            />
          )
        )}

        {item?.value != null && (
          <span className="font-mono font-medium tabular-nums text-foreground">
            {typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value)}
          </span>
        )}

        {formatter && <span className="text-muted-foreground">{formatter(item.value)}</span>}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = "ChartTooltip";

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef((
  { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
  ref
) => {
  const { config } = useChart();

  if (!payload?.length) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div
            key={String(item.value) + String(item.dataKey)}
            className={cn("flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground")}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig?.label}
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = "ChartLegend";

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(config, payload, key) {
  if (typeof payload !== "object" || payload === null) return undefined;

  const payloadPayload = "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : undefined;

  let configLabelKey = key;

  if (key in payload && typeof payload[key] === "string") {
    configLabelKey = payload[key];
  } else if (payloadPayload && key in payloadPayload && typeof payloadPayload[key] === "string") {
    configLabelKey = payloadPayload[key];
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
                className="h-2 w-2 shrink-0 rounded-[2px]"
