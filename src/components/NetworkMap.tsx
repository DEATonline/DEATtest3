import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import worldAtlas from 'world-atlas/countries-110m.json';
import {
  Airport,
  DEFAULT_ROUTE_COLOR,
  HIGHLIGHT_ROUTE_COLOR,
  RouteSector,
  SandboxTool,
} from '../types/network';
import {
  buildProjectedFlightPaths,
  calculateGreatCircleNm,
  formatCityName,
  getUnorderedPairKey,
  inferContinentFromCoords,
} from '../utils/networkUtils';

export interface NetworkMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  flyToAirport: (airport: Airport) => void;
}

export interface PickedCoordinates {
  lat: number;
  lon: number;
  continent: string;
}

export interface IndexedRouteItem {
  route: RouteSector;
  sourceIndex: number;
}

interface NetworkMapProps {
  visibleAirports: Airport[];
  airportByIcao: Map<string, Airport>;
  filteredRoutes: IndexedRouteItem[];
  liveOverlayRoutes: RouteSector[];
  liveAirportByIcao: Map<string, Airport>;
  showLiveRoutesOverlay: boolean;
  showSandboxRoutes: boolean;
  showAirportCounts: boolean;
  airportCounts: Map<string, number>;
  liveAirportCounts: Map<string, number>;
  sandboxMode: boolean;
  sandboxTool: SandboxTool;
  sandboxPendingOrigin: string | null;
  sandboxDrawColor: string;
  addedAirportIcaos: Set<string>;
  modifiedAirportIcaos: Set<string>;
  selectedAirportIcao: string | null;
  selectedRouteKey: string | null;
  darkMode: boolean;
  pinPickerActive: boolean;
  onSelectAirport: (airport: Airport) => void;
  onSelectRoute: (route: RouteSector, sourceIndex: number, routeKey: string) => void;
  onBackgroundClick: () => void;
  onPickCoordinates: (coords: PickedCoordinates) => void;
  onCancelPinPicker: () => void;
}

interface LandPathItem {
  id: string | number;
  d: string;
}

interface ProjectedRouteItem {
  key: string;
  route: RouteSector;
  sourceIndex: number;
  paths: string[];
  color: string;
  originCity: string;
  destCity: string;
  distanceNm: number;
}

interface ProjectedLiveOverlayItem {
  key: string;
  paths: string[];
  color: string;
}

interface ProjectedAirportItem {
  airport: Airport;
  x: number;
  y: number;
  count: number;
  liveCount: number;
}

function clampRing(ring: Position[]): Position[] | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  return ring.map(([lon, lat]) => [
    Math.max(-179.95, Math.min(179.95, lon)),
    Math.max(-84, Math.min(84, lat)),
  ]);
}

function buildWorldFeatures(): FeatureCollection<Geometry> {
  const topology = worldAtlas as unknown as Topology<{ countries: GeometryCollection }>;
  const raw = feature(topology, topology.objects.countries) as FeatureCollection<Geometry>;

  return {
    ...raw,
    features: raw.features.map((feat) => {
      const geom = feat.geometry;
      if (!geom) return feat;
      if (geom.type === 'Polygon') {
        return {
          ...feat,
          geometry: {
            ...geom,
            coordinates: geom.coordinates.map(clampRing).filter((r): r is Position[] => Boolean(r)),
          },
        };
      }
      if (geom.type === 'MultiPolygon') {
        return {
          ...feat,
          geometry: {
            ...geom,
            coordinates: geom.coordinates
              .map((poly) => poly.map(clampRing).filter((r): r is Position[] => Boolean(r)))
              .filter((poly) => poly.length > 0),
          },
        };
      }
      return feat;
    }),
  };
}

const WORLD_GEOJSON = buildWorldFeatures();

function boxesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
  pad: number,
): boolean {
  return !(
    a.right + pad < b.left ||
    a.left - pad > b.right ||
    a.bottom + pad < b.top ||
    a.top - pad > b.bottom
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* ============================================================================
 * Memoized SVG sub-layers: isolate static landmasses, live overlay, base routes,
 * and hit-areas so hovering or moving the mouse NEVER re-reconciles hundreds of
 * SVG polygons/paths (prevents Chromium SVG tile drops & background flicker).
 * ============================================================================ */

const LandLayer = React.memo(function LandLayer({
  landPaths,
  landFill,
  landStroke,
  strokeWidth,
}: {
  landPaths: LandPathItem[];
  landFill: string;
  landStroke: string;
  strokeWidth: string;
}) {
  return (
    <g className="land-group">
      {landPaths.map((land) => (
        <path
          key={land.id}
          className="land-path"
          d={land.d}
          fill={landFill}
          stroke={landStroke}
          strokeWidth={strokeWidth}
        />
      ))}
    </g>
  );
});

const LiveOverlayLayer = React.memo(function LiveOverlayLayer({
  items,
  stroke,
  strokeWidth,
  dashArray,
  opacity,
}: {
  items: ProjectedLiveOverlayItem[];
  stroke: string;
  strokeWidth: string;
  dashArray: string;
  opacity: number;
}) {
  if (!items.length) return null;
  return (
    <g className="live-overlay-group pointer-events-none" opacity={opacity}>
      {items.map((item) =>
        item.paths.map((dStr, segIdx) => (
          <path
            key={`${item.key}-${segIdx}`}
            d={dStr}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
        )),
      )}
    </g>
  );
});

const BaseRoutesLayer = React.memo(function BaseRoutesLayer({
  projectedRoutes,
  baseStrokeWidth,
}: {
  projectedRoutes: ProjectedRouteItem[];
  baseStrokeWidth: string;
}) {
  return (
    <>
      {projectedRoutes.map((item) =>
        item.paths.map((dStr, segIdx) => (
          <path
            key={`${item.key}-${segIdx}`}
            className="route-visible-path"
            d={dStr}
            stroke={item.color}
            strokeWidth={baseStrokeWidth}
          />
        )),
      )}
    </>
  );
});

const RouteHitAreasLayer = React.memo(function RouteHitAreasLayer({
  projectedRoutes,
  hitWidth,
  disabled,
  onHoverEnter,
  onHoverMove,
  onHoverLeave,
  onSelect,
}: {
  projectedRoutes: ProjectedRouteItem[];
  hitWidth: string;
  disabled: boolean;
  onHoverEnter: (item: ProjectedRouteItem, e: React.MouseEvent<SVGPathElement>) => void;
  onHoverMove: (e: React.MouseEvent<SVGPathElement>) => void;
  onHoverLeave: () => void;
  onSelect: (item: ProjectedRouteItem, e: React.MouseEvent<SVGPathElement>) => void;
}) {
  if (disabled) return null;
  return (
    <g className="route-hit-group">
      {projectedRoutes.map((item) =>
        item.paths.map((dStr, segIdx) => (
          <path
            key={`hit-${item.key}-${segIdx}`}
            className="route-hit-area"
            d={dStr}
            strokeWidth={hitWidth}
            onMouseEnter={(e) => onHoverEnter(item, e)}
            onMouseMove={onHoverMove}
            onMouseLeave={onHoverLeave}
            onClick={(e) => onSelect(item, e)}
          />
        )),
      )}
    </g>
  );
});

export const NetworkMap = forwardRef<NetworkMapHandle, NetworkMapProps>(function NetworkMap(
  {
    visibleAirports,
    airportByIcao,
    filteredRoutes,
    liveOverlayRoutes,
    liveAirportByIcao,
    showLiveRoutesOverlay,
    showSandboxRoutes,
    showAirportCounts,
    airportCounts,
    liveAirportCounts,
    sandboxMode,
    sandboxTool,
    sandboxPendingOrigin,
    sandboxDrawColor,
    addedAirportIcaos,
    modifiedAirportIcaos,
    selectedAirportIcao,
    selectedRouteKey,
    darkMode,
    pinPickerActive,
    onSelectAirport,
    onSelectRoute,
    onBackgroundClick,
    onPickCoordinates,
    onCancelPinPicker,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const drawPreviewLineRef = useRef<SVGLineElement | null>(null);
  const tooltipPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverLeaveRafRef = useRef<number | null>(null);
  const pickerRafRef = useRef<number | null>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));

  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform>(() => d3.zoomIdentity);
  const [hoveredAirportIcao, setHoveredAirportIcao] = useState<string | null>(null);
  const [hoveredRouteItem, setHoveredRouteItem] = useState<ProjectedRouteItem | null>(null);
  const [pickerCursorCoords, setPickerCursorCoords] = useState<PickedCoordinates | null>(null);

  const isCoordinatePickMode = pinPickerActive || (sandboxMode && sandboxTool === 'add-airport');

  const computeTooltipTransform = useCallback(
    (clientX: number, clientY: number) => {
      const pad = 16;
      const estW = 248;
      const estH = 98;
      const left = Math.min(
        Math.max(pad, clientX + 14),
        Math.max(pad, dimensions.width - estW - pad),
      );
      const top = Math.min(
        Math.max(72, clientY - estH - 12),
        Math.max(72, dimensions.height - estH - pad),
      );
      return `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    },
    [dimensions.width, dimensions.height],
  );

  // Position floating route tooltip directly on the DOM without triggering React re-renders
  const updateTooltipDomPosition = useCallback(
    (clientX: number, clientY: number) => {
      tooltipPosRef.current = { x: clientX, y: clientY };
      const el = tooltipElRef.current;
      if (!el) return;
      el.style.transform = computeTooltipTransform(clientX, clientY);
    },
    [computeTooltipTransform],
  );

  // Cleanup any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (hoverLeaveRafRef.current !== null) {
        window.cancelAnimationFrame(hoverLeaveRafRef.current);
      }
      if (pickerRafRef.current !== null) {
        window.cancelAnimationFrame(pickerRafRef.current);
      }
    };
  }, []);

  // Debounced resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: number | undefined;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(updateSize, 80);
    });
    observer.observe(el);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Memoized Natural Earth projection
  const projection = useMemo(() => {
    const { width, height } = dimensions;
    return d3
      .geoNaturalEarth1()
      .scale(Math.min(width / 5.2, height / 2.6))
      .translate([width / 2, height / 1.88]);
  }, [dimensions]);

  // Memoized land paths
  const landPaths = useMemo<LandPathItem[]>(() => {
    const pathGen = d3.geoPath().projection(projection);
    return WORLD_GEOJSON.features
      .map((feat, idx) => ({
        id: feat.id ?? idx,
        d: pathGen(feat) || '',
      }))
      .filter((item) => item.d.length > 0);
  }, [projection]);

  // Memoized live baseline ghost overlay (Edit Mode overlay for current live routes)
  const projectedLiveOverlay = useMemo<ProjectedLiveOverlayItem[]>(() => {
    if (!sandboxMode || !showLiveRoutesOverlay) return [];

    const pairGroups = new Map<string, number[]>();
    liveOverlayRoutes.forEach((r, idx) => {
      const pairKey = getUnorderedPairKey(r.origin, r.dest);
      const list = pairGroups.get(pairKey) || [];
      list.push(idx);
      pairGroups.set(pairKey, list);
    });

    const items: ProjectedLiveOverlayItem[] = [];
    liveOverlayRoutes.forEach((r, idx) => {
      const src = liveAirportByIcao.get(r.origin);
      const dst = liveAirportByIcao.get(r.dest);
      if (!src || !dst) return;

      const pairKey = getUnorderedPairKey(r.origin, r.dest);
      const group = pairGroups.get(pairKey) || [idx];
      const slot = group.indexOf(idx);
      const total = group.length;
      const paths = buildProjectedFlightPaths(src, dst, projection, slot, total, 56);
      if (!paths.length) return;

      items.push({
        key: `live-ghost:${r.origin}->${r.dest}#${idx}`,
        paths,
        color: r.color || DEFAULT_ROUTE_COLOR,
      });
    });

    return items;
  }, [sandboxMode, showLiveRoutesOverlay, liveOverlayRoutes, liveAirportByIcao, projection]);

  // Memoized active route geometries (live or Edit Mode) with parallel separation
  const projectedRoutes = useMemo<ProjectedRouteItem[]>(() => {
    if (sandboxMode && !showSandboxRoutes) return [];

    const pairGroups = new Map<string, number[]>();
    filteredRoutes.forEach(({ route }, idx) => {
      const pairKey = getUnorderedPairKey(route.origin, route.dest);
      const list = pairGroups.get(pairKey) || [];
      list.push(idx);
      pairGroups.set(pairKey, list);
    });

    const items: ProjectedRouteItem[] = [];
    filteredRoutes.forEach(({ route, sourceIndex }, idx) => {
      const src = airportByIcao.get(route.origin);
      const dst = airportByIcao.get(route.dest);
      if (!src || !dst) return;

      const pairKey = getUnorderedPairKey(route.origin, route.dest);
      const group = pairGroups.get(pairKey) || [idx];
      const slot = group.indexOf(idx);
      const total = group.length;

      const paths = buildProjectedFlightPaths(src, dst, projection, slot, total, 64);
      if (!paths.length) return;

      const key = `${route.origin}->${route.dest}#${sourceIndex}`;

      items.push({
        key,
        route,
        sourceIndex,
        paths,
        color: route.color || DEFAULT_ROUTE_COLOR,
        originCity: formatCityName(src.city),
        destCity: formatCityName(dst.city),
        distanceNm: calculateGreatCircleNm(src, dst),
      });
    });

    return items;
  }, [filteredRoutes, airportByIcao, projection, sandboxMode, showSandboxRoutes]);

  // Memoized projected airports
  const projectedAirports = useMemo<ProjectedAirportItem[]>(() => {
    const list: ProjectedAirportItem[] = [];
    for (const airport of visibleAirports) {
      const pt = projection([airport.lon, airport.lat]);
      if (!pt || Number.isNaN(pt[0]) || Number.isNaN(pt[1])) continue;
      list.push({
        airport,
        x: pt[0],
        y: pt[1],
        count: airportCounts.get(airport.icao) || 0,
        liveCount: liveAirportCounts.get(airport.icao) || 0,
      });
    }
    return list;
  }, [visibleAirports, projection, airportCounts, liveAirportCounts]);

  const pendingOriginProjected = useMemo(() => {
    if (!sandboxMode || !sandboxPendingOrigin) return null;
    const ap = airportByIcao.get(sandboxPendingOrigin);
    if (!ap) return null;
    const pt = projection([ap.lon, ap.lat]);
    return pt && !Number.isNaN(pt[0]) && !Number.isNaN(pt[1]) ? pt : null;
  }, [sandboxMode, sandboxPendingOrigin, airportByIcao, projection]);

  // Set up D3 zoom behavior once on SVG mount
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    let rafId: number | null = null;
    let latestTransform = d3.zoomIdentity;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        latestTransform = event.transform;
        if (rafId === null) {
          rafId = window.requestAnimationFrame(() => {
            rafId = null;
            setZoomTransform(latestTransform);
          });
        }
      });

    zoomBehaviorRef.current = zoom;
    const selection = d3.select(svgEl);
    selection.call(zoom);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      selection.on('.zoom', null);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const svgEl = svgRef.current;
        const zoom = zoomBehaviorRef.current;
        if (!svgEl || !zoom) return;
        const dur = prefersReducedMotion() ? 0 : 220;
        d3.select(svgEl).transition().duration(dur).call(zoom.scaleBy, 1.5);
      },
      zoomOut: () => {
        const svgEl = svgRef.current;
        const zoom = zoomBehaviorRef.current;
        if (!svgEl || !zoom) return;
        const dur = prefersReducedMotion() ? 0 : 220;
        d3.select(svgEl).transition().duration(dur).call(zoom.scaleBy, 1 / 1.5);
      },
      resetZoom: () => {
        const svgEl = svgRef.current;
        const zoom = zoomBehaviorRef.current;
        if (!svgEl || !zoom) return;
        const dur = prefersReducedMotion() ? 0 : 280;
        d3.select(svgEl).transition().duration(dur).call(zoom.transform, d3.zoomIdentity);
      },
      flyToAirport: (airport: Airport) => {
        const svgEl = svgRef.current;
        const zoom = zoomBehaviorRef.current;
        if (!svgEl || !zoom) return;
        const pt = projection([airport.lon, airport.lat]);
        if (!pt) return;
        const targetScale = Math.max(3.2, Math.min(5.2, zoomTransform.k < 3 ? 3.8 : zoomTransform.k));
        const tx = dimensions.width / 2 - pt[0] * targetScale;
        const ty = dimensions.height / 2 - pt[1] * targetScale;
        const target = d3.zoomIdentity.translate(tx, ty).scale(targetScale);
        const dur = prefersReducedMotion() ? 0 : 520;
        d3.select(svgEl).transition().duration(dur).call(zoom.transform, target);
      },
    }),
    [dimensions, projection, zoomTransform.k],
  );

  // Label collision solver (never runs on pointer hover)
  const visibleLabelSet = useMemo(() => {
    const k = Math.max(1, zoomTransform.k || 1);
    const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    const shown = new Set<string>();

    const rankScore = (ap: Airport) => {
      let score = 0;
      if (ap.icao === selectedAirportIcao || ap.icao === sandboxPendingOrigin) score += 1000;
      if (sandboxMode && (addedAirportIcaos.has(ap.icao) || modifiedAirportIcaos.has(ap.icao))) {
        score += 700;
      }
      if (ap.isHub) score += 500;
      if (k >= 2.2) score += 80;
      if (k >= 4.0) score += 120;
      score -= (ap.icao.charCodeAt(3) || 0) * 0.1;
      return score;
    };

    const sorted = [...projectedAirports].sort(
      (a, b) => rankScore(b.airport) - rankScore(a.airport),
    );

    const pad = k >= 5 ? 1 : k >= 2.8 ? 2 : 5;

    for (const item of sorted) {
      const { airport, x, y } = item;
      const screenPt = zoomTransform.apply([x, y]);
      const isFocus = airport.icao === selectedAirportIcao || airport.icao === sandboxPendingOrigin;
      const isHub = airport.isHub;
      const cityDisplay = formatCityName(airport.city);
      const avgCharW = isHub || isFocus ? 6.8 : 5.8;
      const textW = Math.max(40, Math.min(138, cityDisplay.length * avgCharW + 12));
      const boxH = showAirportCounts ? 36 : isHub || isFocus ? 25 : 17;
      const box = {
        left: screenPt[0] - textW / 2,
        right: screenPt[0] + textW / 2,
        top: screenPt[1] - (showAirportCounts ? 18 : 0) + 5,
        bottom: screenPt[1] - (showAirportCounts ? 18 : 0) + 5 + boxH,
      };

      const collides = placed.some((b) => boxesOverlap(box, b, pad));
      const mustShow =
        isFocus ||
        isHub ||
        (sandboxMode && (addedAirportIcaos.has(airport.icao) || modifiedAirportIcaos.has(airport.icao)));

      if (mustShow || !collides) {
        shown.add(airport.icao);
        placed.push(box);
      }
    }

    return shown;
  }, [
    projectedAirports,
    zoomTransform,
    selectedAirportIcao,
    sandboxPendingOrigin,
    sandboxMode,
    showAirportCounts,
    addedAirportIcaos,
    modifiedAirportIcaos,
  ]);

  const computeGeoFromPointer = useCallback(
    (clientX: number, clientY: number): PickedCoordinates | null => {
      const svgEl = svgRef.current;
      if (!svgEl || !projection.invert) return null;
      const rect = svgEl.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const [mx, my] = zoomTransform.invert([sx, sy]);
      const geo = projection.invert([mx, my]);
      if (!geo || Number.isNaN(geo[0]) || Number.isNaN(geo[1])) return null;
      const lon = Math.max(-180, Math.min(180, Number(geo[0].toFixed(4))));
      const lat = Math.max(-85, Math.min(85, Number(geo[1].toFixed(4))));
      return {
        lat,
        lon,
        continent: inferContinentFromCoords(lat, lon),
      };
    },
    [projection, zoomTransform],
  );

  // Zero-rerender pointer tracking for Draw preview line + RAF-throttled coordinate picker
  const handleSvgMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isCoordinatePickMode) {
        const cx = event.clientX;
        const cy = event.clientY;
        if (pickerRafRef.current === null) {
          pickerRafRef.current = window.requestAnimationFrame(() => {
            pickerRafRef.current = null;
            setPickerCursorCoords(computeGeoFromPointer(cx, cy));
          });
        }
      }

      if (
        sandboxMode &&
        sandboxTool === 'draw' &&
        pendingOriginProjected &&
        svgRef.current &&
        drawPreviewLineRef.current
      ) {
        const rect = svgRef.current.getBoundingClientRect();
        const [mx, my] = zoomTransform.invert([
          event.clientX - rect.left,
          event.clientY - rect.top,
        ]);
        const line = drawPreviewLineRef.current;
        line.setAttribute('x2', String(mx));
        line.setAttribute('y2', String(my));
        line.style.display = '';
      }
    },
    [isCoordinatePickMode, computeGeoFromPointer, sandboxMode, sandboxTool, pendingOriginProjected, zoomTransform],
  );

  useEffect(() => {
    if (!isCoordinatePickMode) {
      setPickerCursorCoords(null);
    }
  }, [isCoordinatePickMode]);

  // Stable route hover callbacks so RouteHitAreasLayer never re-renders on hover
  const handleRouteHoverEnter = useCallback(
    (item: ProjectedRouteItem, e: React.MouseEvent<SVGPathElement>) => {
      if (hoverLeaveRafRef.current !== null) {
        window.cancelAnimationFrame(hoverLeaveRafRef.current);
        hoverLeaveRafRef.current = null;
      }
      updateTooltipDomPosition(e.clientX, e.clientY);
      setHoveredRouteItem((prev) => (prev?.key === item.key ? prev : item));
    },
    [updateTooltipDomPosition],
  );

  const handleRouteHoverMove = useCallback(
    (e: React.MouseEvent<SVGPathElement>) => {
      updateTooltipDomPosition(e.clientX, e.clientY);
    },
    [updateTooltipDomPosition],
  );

  const handleRouteHoverLeave = useCallback(() => {
    if (hoverLeaveRafRef.current !== null) {
      window.cancelAnimationFrame(hoverLeaveRafRef.current);
    }
    // Defer clearing by 1 frame so sweeping seamlessly across adjacent routes never flashes unhovered
    hoverLeaveRafRef.current = window.requestAnimationFrame(() => {
      hoverLeaveRafRef.current = null;
      setHoveredRouteItem(null);
    });
  }, []);

  const handleRouteHitClick = useCallback(
    (item: ProjectedRouteItem, e: React.MouseEvent<SVGPathElement>) => {
      e.stopPropagation();
      if (hoverLeaveRafRef.current !== null) {
        window.cancelAnimationFrame(hoverLeaveRafRef.current);
        hoverLeaveRafRef.current = null;
      }
      setHoveredRouteItem(null);
      onSelectRoute(item.route, item.sourceIndex, item.key);
    },
    [onSelectRoute],
  );

  const handleSvgClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (isCoordinatePickMode) {
      const coords = computeGeoFromPointer(event.clientX, event.clientY);
      if (coords) {
        onPickCoordinates(coords);
      }
      return;
    }

    const target = event.target as Element;
    if (target === svgRef.current || target.classList.contains('land-path')) {
      onBackgroundClick();
    }
  };

  const k = Math.max(1, zoomTransform.k || 1);
  const invK = 1 / k;
  const activeFocusAirport = hoveredAirportIcao || selectedAirportIcao || sandboxPendingOrigin;
  const activeRouteKey = hoveredRouteItem?.key || selectedRouteKey;
  const hasActiveFocus = Boolean(activeRouteKey || activeFocusAirport);

  // Only render the few currently highlighted routes in the top overlay group
  const highlightedRoutes = useMemo(() => {
    if (!hasActiveFocus) return [];
    return projectedRoutes.filter(
      (item) =>
        activeRouteKey === item.key ||
        Boolean(
          activeFocusAirport &&
            (item.route.origin === activeFocusAirport ||
              item.route.dest === activeFocusAirport),
        ),
    );
  }, [hasActiveFocus, projectedRoutes, activeRouteKey, activeFocusAirport]);

  const landFill = darkMode ? '#1c2433' : '#e1e6ed';
  const landStroke = darkMode ? '#0b0f17' : '#f3f5f8';
  const markerFill = darkMode ? '#0b0f17' : '#ffffff';
  const labelHalo = darkMode ? '#0b0f17' : '#f3f5f8';

  const landStrokeW = (0.65 * invK).toFixed(4);
  const liveStrokeW = (1.6 * invK).toFixed(4);
  const liveDash = `${(5 * invK).toFixed(2)},${(4 * invK).toFixed(2)}`;
  const baseRouteStrokeW = (1.9 * invK).toFixed(4);
  const highlightRouteStrokeW = (3.5 * invK).toFixed(4);
  const hitRouteStrokeW = (14 * invK).toFixed(4);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 w-screen h-screen overflow-hidden bg-[var(--bg)] z-0 ${
        sandboxMode ? 'ring-2 ring-inset ring-amber-500/75' : ''
      }`}
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label="DEAT Global Route Network Map"
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => {
          if (hoverLeaveRafRef.current !== null) {
            window.cancelAnimationFrame(hoverLeaveRafRef.current);
            hoverLeaveRafRef.current = null;
          }
          setHoveredRouteItem(null);
          setPickerCursorCoords(null);
          if (drawPreviewLineRef.current) {
            drawPreviewLineRef.current.style.display = 'none';
          }
        }}
        onClick={handleSvgClick}
        className={`block w-full h-full select-none ${
          isCoordinatePickMode
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <g
          className="map-layer"
          transform={`translate(${zoomTransform.x}, ${zoomTransform.y}) scale(${zoomTransform.k})`}
        >
          {/* Isolated Memoized Land Polygons */}
          <LandLayer
            landPaths={landPaths}
            landFill={landFill}
            landStroke={landStroke}
            strokeWidth={landStrokeW}
          />

          {/* Isolated Memoized Live Baseline Ghost Overlay */}
          <LiveOverlayLayer
            items={projectedLiveOverlay}
            stroke={darkMode ? '#94a3b8' : '#475569'}
            strokeWidth={liveStrokeW}
            dashArray={liveDash}
            opacity={showSandboxRoutes ? 0.45 : 0.85}
          />

          {/* Base Flight Sector Curves: dims as a single group opacity (no per-path DOM churn) */}
          <g className="routes-base-group" opacity={hasActiveFocus ? 0.14 : 0.9}>
            <BaseRoutesLayer
              projectedRoutes={projectedRoutes}
              baseStrokeWidth={baseRouteStrokeW}
            />
          </g>

          {/* Highlighted Flight Sector Curves (only the 1-N focused routes rendered on top) */}
          {highlightedRoutes.length > 0 && (
            <g className="routes-highlight-group pointer-events-none">
              {highlightedRoutes.map((item) => {
                const strokeColor = sandboxMode ? item.color : HIGHLIGHT_ROUTE_COLOR;
                return item.paths.map((dStr, segIdx) => (
                  <path
                    key={`hl-${item.key}-${segIdx}`}
                    className="route-visible-path"
                    d={dStr}
                    stroke={strokeColor}
                    strokeWidth={highlightRouteStrokeW}
                    opacity={1}
                  />
                ));
              })}
            </g>
          )}

          {/* Isolated Memoized Invisible Route Hit Areas */}
          <RouteHitAreasLayer
            projectedRoutes={projectedRoutes}
            hitWidth={hitRouteStrokeW}
            disabled={isCoordinatePickMode}
            onHoverEnter={handleRouteHoverEnter}
            onHoverMove={handleRouteHoverMove}
            onHoverLeave={handleRouteHoverLeave}
            onSelect={handleRouteHitClick}
          />

          {/* Live Edit Mode Draw Preview Line (updated directly via ref, zero re-renders) */}
          {sandboxMode && sandboxTool === 'draw' && pendingOriginProjected && (
            <line
              ref={drawPreviewLineRef}
              x1={pendingOriginProjected[0]}
              y1={pendingOriginProjected[1]}
              x2={pendingOriginProjected[0]}
              y2={pendingOriginProjected[1]}
              stroke={sandboxDrawColor}
              strokeWidth={(2.2 * invK).toFixed(4)}
              strokeDasharray={`${(6 * invK).toFixed(2)},${(4 * invK).toFixed(2)}`}
              opacity={0.85}
              pointerEvents="none"
              style={{ display: 'none' }}
            />
          )}

          {/* Airport Markers, Count Overlays & Labels */}
          <g className="nodes-group">
            {projectedAirports.map(({ airport, x, y, count, liveCount }) => {
              const isPendingOrigin = airport.icao === sandboxPendingOrigin;
              const isSelected = airport.icao === selectedAirportIcao;
              const isHovered = airport.icao === hoveredAirportIcao;
              const isFocus = isSelected || isPendingOrigin || isHovered;
              const isSandboxAdded = sandboxMode && addedAirportIcaos.has(airport.icao);
              const isSandboxModified = sandboxMode && modifiedAirportIcaos.has(airport.icao);

              const showLabel = visibleLabelSet.has(airport.icao) || isHovered;
              const showIcao = showLabel && (airport.isHub || isFocus || k >= 2.1);
              const cityDisplay = formatCityName(airport.city);

              const outerR = isFocus ? 7.4 : airport.isHub ? 6.0 : 4.2;
              const outerStrokeW = isFocus ? 2.6 : airport.isHub ? 2.3 : 1.8;
              const innerR = airport.isHub || isFocus ? 2.2 : 0;

              const countDelta = count - liveCount;
              const countLabel =
                sandboxMode && countDelta !== 0
                  ? `${count} (${countDelta > 0 ? `+${countDelta}` : countDelta})`
                  : String(count);

              const countColor =
                sandboxMode && countDelta > 0
                  ? '#15803d'
                  : sandboxMode && countDelta < 0
                    ? '#dc2626'
                    : count > 0
                      ? darkMode
                        ? '#f59e0b'
                        : '#b45309'
                      : darkMode
                        ? '#94a3b8'
                        : '#47505e';

              return (
                <g
                  key={airport.icao}
                  className="airport-node"
                  transform={`translate(${x}, ${y}) scale(${invK.toFixed(4)})`}
                  tabIndex={isCoordinatePickMode ? -1 : 0}
                  role="button"
                  aria-label={`${cityDisplay} (${airport.icao})${airport.isHub ? ', Hub' : ''}`}
                  onMouseEnter={() => {
                    if (!isCoordinatePickMode) setHoveredAirportIcao(airport.icao);
                  }}
                  onMouseLeave={() => {
                    if (hoveredAirportIcao === airport.icao) setHoveredAirportIcao(null);
                  }}
                  onFocus={() => {
                    if (!isCoordinatePickMode) setHoveredAirportIcao(airport.icao);
                  }}
                  onBlur={() => {
                    if (hoveredAirportIcao === airport.icao) setHoveredAirportIcao(null);
                  }}
                  onKeyDown={(e) => {
                    if (isCoordinatePickMode) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectAirport(airport);
                    }
                  }}
                  onClick={(e) => {
                    if (isCoordinatePickMode) return;
                    e.stopPropagation();
                    onSelectAirport(airport);
                  }}
                >
                  <circle r={12} fill="transparent" />

                  {/* Admin Route-Count Overlay above airport */}
                  {showAirportCounts && (
                    <text
                      className="map-route-count"
                      textAnchor="middle"
                      y={-11}
                      fontSize="11.5px"
                      stroke={labelHalo}
                      strokeWidth="3.2px"
                      fill={countColor}
                    >
                      {countLabel}
                    </text>
                  )}

                  {/* Subtle halo ring for newly added / modified Edit Mode stations */}
                  {(isSandboxAdded || isSandboxModified) && (
                    <circle
                      r={outerR + 3.2}
                      fill="none"
                      stroke={isSandboxAdded ? '#15803d' : '#d97706'}
                      strokeWidth={1.4}
                      strokeDasharray="2.5,2"
                      opacity={0.9}
                    />
                  )}

                  <circle
                    className="outer-ring"
                    r={outerR}
                    fill={isPendingOrigin ? '#d97706' : markerFill}
                    stroke={
                      isPendingOrigin
                        ? '#d97706'
                        : airport.active === false
                          ? '#94a3b8'
                          : isSandboxAdded
                            ? '#15803d'
                            : '#EE1C25'
                    }
                    strokeWidth={outerStrokeW}
                    strokeDasharray={airport.active === false ? '2.5,2' : undefined}
                    opacity={airport.active === false ? 0.72 : 1}
                  />

                  {innerR > 0 && (
                    <circle
                      className="inner-dot"
                      r={innerR}
                      fill={
                        isPendingOrigin
                          ? '#ffffff'
                          : isSandboxAdded
                            ? '#15803d'
                            : '#EE1C25'
                      }
                    />
                  )}

                  {showLabel && (
                    <text
                      className="map-label-city"
                      textAnchor="middle"
                      y={airport.isHub || isFocus ? 17 : 15}
                      fontSize={airport.isHub || isFocus ? '13px' : '11.5px'}
                      stroke={labelHalo}
                      strokeWidth="3.2px"
                      fill={
                        isPendingOrigin
                          ? '#d97706'
                          : isSelected
                            ? darkMode
                              ? '#f8fafc'
                              : '#12161f'
                            : airport.active === false
                              ? '#94a3b8'
                              : isSandboxAdded
                                ? '#15803d'
                                : '#EE1C25'
                      }
                    >
                      {cityDisplay}
                    </text>
                  )}

                  {showIcao && (
                    <text
                      className="map-label-icao"
                      textAnchor="middle"
                      y={airport.isHub || isFocus ? 28 : 25}
                      fontSize="10px"
                      stroke={labelHalo}
                      strokeWidth="2.8px"
                      fill={darkMode ? '#cbd5e1' : '#5b6472'}
                    >
                      {airport.icao}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Route Hover Tooltip (GPU transform-only positioning, solid surface to avoid SVG backdrop-blur stalls) */}
      {hoveredRouteItem && !isCoordinatePickMode && (
        <div
          ref={tooltipElRef}
          style={{
            left: 0,
            top: 0,
            transform: computeTooltipTransform(tooltipPosRef.current.x, tooltipPosRef.current.y),
          }}
          className="fixed z-40 pointer-events-none max-w-[260px] rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm"
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: hoveredRouteItem.color }}
            />
            <span className="truncate">
              {hoveredRouteItem.originCity} → {hoveredRouteItem.destCity}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--ink-secondary)]">
            <span>
              {hoveredRouteItem.route.origin}–{hoveredRouteItem.route.dest}
            </span>
            <span aria-hidden="true">·</span>
            <span>{hoveredRouteItem.distanceNm.toLocaleString()} NM</span>
            <span aria-hidden="true">·</span>
            <span>{hoveredRouteItem.route.type}</span>
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-[var(--ink-muted)] truncate">
            {hoveredRouteItem.route.aircraftTypes.join(', ')}
          </div>
          {sandboxMode && (
            <div className="mt-1 font-mono text-[10px] text-amber-700 dark:text-amber-400">
              {sandboxTool === 'erase' ? 'Click to erase route' : 'Click to edit or delete route'}
            </div>
          )}
        </div>
      )}

      {/* Coordinate Picker Readout (Network Editor Pin Picker OR Edit Mode Add-Airport tool) */}
      {pinPickerActive && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded border border-[var(--deat-red)] bg-[var(--surface)] px-4 py-2 shadow-sm">
          <div className="text-xs font-medium text-[var(--ink)]">
            Click anywhere on the map to set airport coordinates
          </div>
          {pickerCursorCoords && (
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--ink-secondary)] border-l border-[var(--border)] pl-3">
              <span>{pickerCursorCoords.lat.toFixed(4)}°</span>
              <span>,</span>
              <span>{pickerCursorCoords.lon.toFixed(4)}°</span>
              <span aria-hidden="true">·</span>
              <span>{pickerCursorCoords.continent}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onCancelPinPicker}
            className="ml-1 rounded border border-[var(--border-strong)] px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
      )}

      {sandboxMode && sandboxTool === 'add-airport' && pickerCursorCoords && (
        <div className="fixed top-16 right-4 z-30 pointer-events-none rounded border border-amber-500/70 bg-[var(--surface)] px-3 py-1.5 font-mono text-[11px] tabular-nums text-[var(--ink)] shadow-sm">
          {pickerCursorCoords.lat.toFixed(4)}°, {pickerCursorCoords.lon.toFixed(4)}° ·{' '}
          {pickerCursorCoords.continent}
        </div>
      )}
    </div>
  );
});
