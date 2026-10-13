/*
 * The Journey of Marcus — Home Page
 * Design: Ghibli Pixel Overworld — 8-bit RPG meets Studio Ghibli warmth
 * An interactive overworld map where visitors click on buildings to explore zones
 *
 * Routing: every building, Workshop project, and panel has a hash address
 * (#/zone/meta, #/workshop/hawkerwhere, #/resume, ...). Opening a panel pushes
 * a history entry, so the browser Back button closes it and lands on the map.
 * Exploration progress and the sound preference persist in local storage.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import IntroScreen from "@/components/IntroScreen";
import HUD from "@/components/HUD";
import DialogBox from "@/components/DialogBox";
import PixelLoadingScreen from "@/components/PixelLoadingScreen";

// Lazy-loaded: OverworldMap is large and only renders after game starts
const OverworldMap = lazy(() => import("@/components/OverworldMap"));
import { ZONES, EASTER_EGGS, ASSET_URLS, type Zone } from "@/lib/gameData";
import { WORKSHOP_PROJECTS } from "@/lib/workshopData";
import { playStartGame, playBuildingEnter, playDiscovery, playClose, playTab, playClick, setMuted } from "@/lib/sfx";

// Lazy-loaded components — these are conditionally rendered (modals/overlays)
// and don't need to be in the initial bundle
const ZoneModal = lazy(() => import("@/components/ZoneModal"));
const WorkshopModal = lazy(() => import("@/components/WorkshopModal"));
const AboutSection = lazy(() => import("@/components/AboutSection"));
const TestimonialsSection = lazy(() => import("@/components/TestimonialsSection"));
const ResumeSnapshot = lazy(() => import("@/components/ResumeSnapshot"));
const ConnectFooter = lazy(() => import("@/components/ConnectFooter"));
const CompletionBanner = lazy(() => import("@/components/CompletionBanner"));
const MobileBuildingList = lazy(() => import("@/components/MobileBuildingList"));
const QuestChecklist = lazy(() => import("@/components/QuestChecklist"));

/* ── Hash routing ─────────────────────────────────────────────────────────── */

type PanelKind = "resume" | "about" | "testimonials" | "connect";

type SiteRoute =
  | { kind: "map" }
  | { kind: "zone"; zoneId: string }
  | { kind: "workshop"; projectId: string | null }
  | { kind: "panel"; panel: PanelKind };

const PANEL_KINDS: PanelKind[] = ["resume", "about", "testimonials", "connect"];

function parseHash(hash: string): SiteRoute {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "map" };
  if (parts[0] === "zone" && parts[1] && ZONES.some((z) => z.id === parts[1])) {
    return { kind: "zone", zoneId: parts[1] };
  }
  if (parts[0] === "workshop") {
    const projectId =
      parts[1] && WORKSHOP_PROJECTS.some((p) => p.id === parts[1]) ? parts[1] : null;
    return { kind: "workshop", projectId };
  }
  if (PANEL_KINDS.includes(parts[0] as PanelKind)) {
    return { kind: "panel", panel: parts[0] as PanelKind };
  }
  return { kind: "map" };
}

function routeHash(route: SiteRoute): string {
  switch (route.kind) {
    case "zone":
      return `#/zone/${route.zoneId}`;
    case "workshop":
      return route.projectId ? `#/workshop/${route.projectId}` : "#/workshop";
    case "panel":
      return `#/${route.panel}`;
    default:
      return "#/map";
  }
}

/* ── Saved progress ───────────────────────────────────────────────────────── */

const STORAGE_KEY = "marcus-world-progress-v1";

interface SavedProgress {
  discoveredZones: string[];
  resumeOpened: boolean;
  aboutOpened: boolean;
  testimonialsOpened: boolean;
  easterEggCount: number;
  completionShown: boolean;
  musicMuted: boolean;
}

function loadSavedProgress(): Partial<SavedProgress> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<SavedProgress>) : {};
  } catch {
    return {};
  }
}

/* ── Copy ─────────────────────────────────────────────────────────────────── */

const WELCOME_MESSAGE =
  "Welcome! Tap any building to explore a chapter of Marcus's journey. Start with Meta HQ in the centre, or open the Workshop for live project demos.";

const FUN_FACT_LINES = EASTER_EGGS.punnyDialogues.filter(
  (line) => !/^(Welcome|Click|Want|See that|Check out|The Music Hall)/.test(line),
);

const QUICK_TOUR_ZONE_IDS = ["meta", "ai", "workshop"];

export default function Home() {
  const [saved] = useState<Partial<SavedProgress>>(loadSavedProgress);

  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [immersionMode, setImmersionMode] = useState<"full" | "quick" | "resume" | null>(null);
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [workshopProjectId, setWorkshopProjectId] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [discoveredZones, setDiscoveredZones] = useState<Set<string>>(
    () => new Set(saved.discoveredZones ?? []),
  );
  const [showAbout, setShowAbout] = useState(false);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [easterEggCount, setEasterEggCount] = useState(saved.easterEggCount ?? 0);
  const [isMobile, setIsMobile] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionShown, setCompletionShown] = useState(saved.completionShown ?? false);
  const [quickTourStep, setQuickTourStep] = useState<number | null>(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);

  // Quest tracking state
  const [resumeOpened, setResumeOpened] = useState(saved.resumeOpened ?? false);
  const [aboutOpened, setAboutOpened] = useState(saved.aboutOpened ?? false);
  const [testimonialsOpened, setTestimonialsOpened] = useState(saved.testimonialsOpened ?? false);

  // Music state
  const [musicMuted, setMusicMuted] = useState(saved.musicMuted ?? false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // How many site entries we have pushed this session (for Back-based closing)
  const historyDepthRef = useRef(0);
  const initialRouteHandledRef = useRef(false);
  // Depth of the map entry underneath the current overlay. Closing an overlay
  // jumps straight back to it, however many entries the overlay stacked up.
  const overlayBaseDepthRef = useRef(0);
  const expectingJumpDepthRef = useRef<number | null>(null);
  const overlayOpenRef = useRef(false);
  const lastPopRef = useRef<{ hash: string; at: number } | null>(null);
  const pendingForeignRef = useRef<string | null>(null);
  // Whether the Workshop inventory grid has been shown this session. A project
  // opened from the grid can go Back to it; a deep-linked project cannot,
  // because the entry under it is the map.
  const workshopVisitedRef = useRef(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Persist progress whenever it changes
  useEffect(() => {
    try {
      const data: SavedProgress = {
        discoveredZones: Array.from(discoveredZones),
        resumeOpened,
        aboutOpened,
        testimonialsOpened,
        easterEggCount,
        completionShown,
        musicMuted,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable (private mode); the session simply will not persist.
    }
  }, [discoveredZones, resumeOpened, aboutOpened, testimonialsOpened, easterEggCount, completionShown, musicMuted]);

  // Check for completion
  useEffect(() => {
    if (discoveredZones.size === ZONES.length && !completionShown) {
      setTimeout(() => {
        setShowCompletion(true);
        setCompletionShown(true);
      }, 800);
    }
  }, [discoveredZones, completionShown]);

  // Initialize audio when game starts
  useEffect(() => {
    if (gameStarted && !audioRef.current) {
      const audio = new Audio(ASSET_URLS.bgMusic);
      audio.loop = true;
      audio.volume = 0.25;
      audio.muted = musicMuted;
      audioRef.current = audio;
      // Try to play — browsers may block autoplay until user interaction
      audio.play().catch(() => {
        // Autoplay blocked; will play on next user interaction
        const playOnInteraction = () => {
          audio.play().catch(() => {});
          document.removeEventListener("click", playOnInteraction);
          document.removeEventListener("keydown", playOnInteraction);
        };
        document.addEventListener("click", playOnInteraction);
        document.addEventListener("keydown", playOnInteraction);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStarted]);

  // Sync mute state with audio element and SFX
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = musicMuted;
    }
    setMuted(musicMuted);
  }, [musicMuted]);

  // Pause music when tab is hidden / closed, resume when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!audioRef.current) return;
      if (document.hidden) {
        audioRef.current.pause();
      } else if (gameStarted && !musicMuted) {
        audioRef.current.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [gameStarted, musicMuted]);

  const handleToggleMusic = useCallback(() => {
    setMusicMuted((prev) => !prev);
    playClick();
  }, []);

  /* ── Route application ──────────────────────────────────────────────────── */

  const markDiscovered = useCallback((zoneId: string) => {
    setDiscoveredZones((prev) => {
      if (prev.has(zoneId)) return prev;
      const next = new Set(Array.from(prev));
      next.add(zoneId);
      return next;
    });
  }, []);

  const applyRoute = useCallback(
    (route: SiteRoute) => {
      setDialogMessage(null);
      setQuickTourStep(null);
      setShowAbout(route.kind === "panel" && route.panel === "about");
      setShowTestimonials(route.kind === "panel" && route.panel === "testimonials");
      setShowSnapshot(route.kind === "panel" && route.panel === "resume");
      setShowConnect(route.kind === "panel" && route.panel === "connect");
      if (route.kind === "panel") {
        if (route.panel === "resume") setResumeOpened(true);
        if (route.panel === "about") setAboutOpened(true);
        if (route.panel === "testimonials") setTestimonialsOpened(true);
      }
      if (route.kind === "zone") {
        const zone = ZONES.find((z) => z.id === route.zoneId) ?? null;
        setActiveZone(zone);
        setWorkshopProjectId(null);
        if (zone) markDiscovered(zone.id);
      } else if (route.kind === "workshop") {
        const zone = ZONES.find((z) => z.id === "workshop") ?? null;
        setActiveZone(zone);
        setWorkshopProjectId(route.projectId);
        if (route.projectId === null) workshopVisitedRef.current = true;
        markDiscovered("workshop");
      } else {
        setActiveZone(null);
        setWorkshopProjectId(null);
      }
    },
    [markDiscovered],
  );

  const pushRoute = useCallback((route: SiteRoute) => {
    const hash = routeHash(route);
    if (window.location.hash !== hash) {
      const depth = historyDepthRef.current + 1;
      window.history.pushState({ mw: true, depth }, "", hash);
      historyDepthRef.current = depth;
    }
  }, []);

  const replaceRoute = useCallback((route: SiteRoute) => {
    const hash = routeHash(route);
    if (window.location.hash !== hash) {
      window.history.replaceState({ mw: true, depth: historyDepthRef.current }, "", hash);
    }
  }, []);

  // Close the current routed overlay by jumping straight back to the map
  // entry underneath it, however many entries the overlay stacked up
  // (zone-to-zone and project-to-project navigation each push one).
  const closeOverlay = useCallback(() => {
    playClose();
    setQuickTourStep(null);
    const steps = historyDepthRef.current - overlayBaseDepthRef.current;
    if (steps > 0) {
      expectingJumpDepthRef.current = overlayBaseDepthRef.current;
      window.history.go(-steps);
    } else {
      applyRoute({ kind: "map" });
      replaceRoute({ kind: "map" });
    }
  }, [applyRoute, replaceRoute]);

  // Browser Back / Forward. Depth is stamped into history.state on every
  // push and replace, so popstate resyncs from the entry itself. Entries we
  // did not create (the landing entry, a fragment-created entry) carry no
  // stamp; the hashchange adoption below claims those.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      lastPopRef.current = { hash: window.location.hash, at: Date.now() };
      if (expectingJumpDepthRef.current !== null) {
        historyDepthRef.current = expectingJumpDepthRef.current;
        expectingJumpDepthRef.current = null;
        applyRoute(parseHash(window.location.hash));
        return;
      }
      if (e.state && typeof e.state.depth === "number") {
        historyDepthRef.current = e.state.depth;
        applyRoute(parseHash(window.location.hash));
        return;
      }
      // Foreign entry: a following hashchange will adopt it. If none comes
      // (same-hash traversal), fall back to treating it as the base entry.
      const hash = window.location.hash;
      pendingForeignRef.current = hash;
      window.setTimeout(() => {
        if (pendingForeignRef.current === hash) {
          pendingForeignRef.current = null;
          historyDepthRef.current = 0;
          applyRoute(parseHash(hash));
        }
      }, 350);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute]);

  // Fragment navigation (a pasted deep link, an in-page anchor) creates a
  // history entry our own calls did not make. Adopt it: count it, stamp it,
  // and treat the entry below it as the overlay's base when it opens one.
  useEffect(() => {
    const adoptFragmentEntry = (hash: string) => {
      const route = parseHash(hash);
      historyDepthRef.current += 1;
      window.history.replaceState(
        { mw: true, depth: historyDepthRef.current },
        "",
        hash,
      );
      if (route.kind !== "map" && !overlayOpenRef.current) {
        overlayBaseDepthRef.current = historyDepthRef.current - 1;
      }
      applyRoute(route);
      setGameStarted(true);
    };
    const onHashChange = () => {
      const hash = window.location.hash;
      if (pendingForeignRef.current === hash) {
        // A foreign entry popstate just flagged; this is its adoption.
        pendingForeignRef.current = null;
        adoptFragmentEntry(hash);
        return;
      }
      // Back/Forward among stamped entries fire popstate and hashchange
      // together; popstate already handled those.
      const lastPop = lastPopRef.current;
      if (lastPop && lastPop.hash === hash && Date.now() - lastPop.at < 500) {
        return;
      }
      adoptFragmentEntry(hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [applyRoute]);

  // Deep link on first load: seed a map entry underneath the target so Back
  // lands on the map instead of leaving the site.
  useEffect(() => {
    if (!assetsLoaded || initialRouteHandledRef.current) return;
    initialRouteHandledRef.current = true;
    const route = parseHash(window.location.hash);
    if (route.kind === "map") return;
    replaceRoute({ kind: "map" });
    setGameStarted(true);
    setImmersionMode("full");
    overlayBaseDepthRef.current = 0;
    applyRoute(route);
    pushRoute(route);
  }, [assetsLoaded, applyRoute, pushRoute, replaceRoute]);

  /* ── Opening things ─────────────────────────────────────────────────────── */

  const openZone = useCallback(
    (zone: Zone, opts?: { tourStep?: number }) => {
      const wasDiscovered = discoveredZones.has(zone.id);
      if (!overlayOpenRef.current) {
        overlayBaseDepthRef.current = historyDepthRef.current;
      }
      playBuildingEnter();
      setDialogMessage(null);
      markDiscovered(zone.id);
      setShowAbout(false);
      setShowTestimonials(false);
      setShowSnapshot(false);
      setShowConnect(false);
      setActiveZone(zone);
      setWorkshopProjectId(null);
      if (zone.id === "workshop") workshopVisitedRef.current = true;
      setQuickTourStep(opts?.tourStep ?? null);
      pushRoute(
        zone.id === "workshop"
          ? { kind: "workshop", projectId: null }
          : { kind: "zone", zoneId: zone.id },
      );
      if (!wasDiscovered) {
        setTimeout(() => playDiscovery(), 400);
      }
    },
    [discoveredZones, markDiscovered, pushRoute],
  );

  const openPanel = useCallback(
    (panel: PanelKind) => {
      if (!overlayOpenRef.current) {
        overlayBaseDepthRef.current = historyDepthRef.current;
      }
      playTab();
      setDialogMessage(null);
      setActiveZone(null);
      setWorkshopProjectId(null);
      setQuickTourStep(null);
      setShowAbout(panel === "about");
      setShowTestimonials(panel === "testimonials");
      setShowSnapshot(panel === "resume");
      setShowConnect(panel === "connect");
      if (panel === "resume") setResumeOpened(true);
      if (panel === "about") setAboutOpened(true);
      if (panel === "testimonials") setTestimonialsOpened(true);
      pushRoute({ kind: "panel", panel });
    },
    [pushRoute],
  );

  const handleZoneClick = useCallback(
    (zone: Zone) => {
      openZone(zone);
    },
    [openZone ],
  );

  /* ── Start paths ────────────────────────────────────────────────────────── */

  const handleStartGame = useCallback(() => {
    playStartGame();
    setImmersionMode("full");
    setGameStarted(true);
    replaceRoute({ kind: "map" });
    // One short welcome line. The trivia lives behind Fun Facts now.
    setTimeout(() => {
      setDialogMessage(WELCOME_MESSAGE);
    }, 300);
  }, [replaceRoute]);

  const handleImmersionSelect = useCallback(
    (mode: "full" | "quick" | "resume") => {
      setImmersionMode(mode);
      playStartGame();
      setGameStarted(true);
      replaceRoute({ kind: "map" });

      if (mode === "resume") {
        setTimeout(() => openPanel("resume"), 400);
      } else if (mode === "quick") {
        // Quick Highlights: a guided three-stop route, Meta then AI then Workshop.
        setTimeout(() => {
          const first = ZONES.find((z) => z.id === QUICK_TOUR_ZONE_IDS[0]);
          if (first) openZone(first, { tourStep: 0 });
        }, 500);
      } else {
        setTimeout(() => {
          setDialogMessage(WELCOME_MESSAGE);
        }, 300);
      }
    },
    [openPanel, openZone, replaceRoute],
  );

  /* ── Quick Highlights tour ──────────────────────────────────────────────── */

  const handleTourNext = useCallback(() => {
    if (quickTourStep === null) return;
    const nextStep = quickTourStep + 1;
    if (nextStep >= QUICK_TOUR_ZONE_IDS.length) return;
    const next = ZONES.find((z) => z.id === QUICK_TOUR_ZONE_IDS[nextStep]);
    if (next) openZone(next, { tourStep: nextStep });
  }, [openZone, quickTourStep]);

  const handleFinishTour = useCallback(() => {
    setImmersionMode("full");
    closeOverlay();
    setTimeout(() => {
      setDialogMessage(
        "Quick Highlights complete. The full map is yours to explore, and every Workshop project has a live demo.",
      );
    }, 350);
  }, [closeOverlay]);

  /* ── Hint and fun facts ─────────────────────────────────────────────────── */

  const handleHint = useCallback(() => {
    playClick();
    const next = ZONES.find((z) => !discoveredZones.has(z.id));
    if (!next) {
      setDialogMessage(
        "Every building has been explored. Open the Workshop for the live demos, or use Connect when you are ready to talk.",
      );
      return;
    }
    setHighlightedZoneId(next.id);
    window.setTimeout(() => {
      setHighlightedZoneId((current) => (current === next.id ? null : current));
    }, 3200);
    setDialogMessage(
      next.id === "meta"
        ? "Start with Meta HQ, the emerald city in the centre of the map. It is glowing for the next few seconds."
        : `Next stop: ${next.name}. It is glowing on the map for the next few seconds.`,
    );
  }, [discoveredZones]);

  const handleFunFact = useCallback(() => {
    playClick();
    const line = FUN_FACT_LINES[Math.floor(Math.random() * FUN_FACT_LINES.length)];
    setDialogMessage(line);
  }, []);

  /* ── Workshop project routing ───────────────────────────────────────────── */

  const handleSelectProject = useCallback(
    (projectId: string) => {
      playClick();
      setWorkshopProjectId(projectId);
      pushRoute({ kind: "workshop", projectId });
    },
    [pushRoute],
  );

  const handleBackToInventory = useCallback(() => {
    playClose();
    if (
      workshopVisitedRef.current &&
      historyDepthRef.current > 0 &&
      window.location.hash.startsWith("#/workshop/")
    ) {
      // The project was opened from the grid in this session; a real Back
      // step lands on the inventory entry.
      window.history.back();
    } else {
      // Deep-linked project: the entry below is the map, so swap the URL to
      // the inventory in place instead of leaving the Workshop entirely.
      setWorkshopProjectId(null);
      workshopVisitedRef.current = true;
      replaceRoute({ kind: "workshop", projectId: null });
    }
  }, [replaceRoute]);

  /* ── Keyboard: Escape closes the topmost layer ──────────────────────────── */

  const overlayOpen =
    activeZone !== null || showAbout || showTestimonials || showSnapshot || showConnect;

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
  }, [overlayOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showCompletion) setShowCompletion(false);
      else if (dialogMessage) setDialogMessage(null);
      else if (overlayOpen) closeOverlay();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCompletion, dialogMessage, overlayOpen, closeOverlay]);

  // Konami code Easter egg
  useEffect(() => {
    const konamiCode = [
      "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
      "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
      "KeyB", "KeyA",
    ];
    let konamiIndex = 0;
    let lastKeyTime = 0;

    const handleKonami = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyTime > 800) {
        konamiIndex = 0;
      }
      lastKeyTime = now;

      if (e.code === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          setEasterEggCount((prev) => prev + 1);
          konamiIndex = 0;
          document.body.classList.add("konami-active");
          setTimeout(() => document.body.classList.remove("konami-active"), 3000);
        }
      } else {
        konamiIndex = 0;
      }
    };
    window.addEventListener("keydown", handleKonami);
    return () => window.removeEventListener("keydown", handleKonami);
  }, []);

  // Assets to preload — the lightweight intro preview and the portrait only.
  // The full map loads when the game starts; nothing blocks the front door.
  const assetsToPreload = [
    ASSET_URLS.overworldPreview,
    ASSET_URLS.marcusPortrait,
  ];

  /* ── Derived modal wiring ───────────────────────────────────────────────── */

  const activeZoneIndex = activeZone ? ZONES.findIndex((z) => z.id === activeZone.id) : -1;
  const isTourStop =
    quickTourStep !== null && activeZone !== null && activeZone.id === QUICK_TOUR_ZONE_IDS[quickTourStep];
  const tourLabel = isTourStop
    ? `QUICK HIGHLIGHTS · STOP ${quickTourStep + 1} OF ${QUICK_TOUR_ZONE_IDS.length}`
    : undefined;
  const tourNextZone =
    isTourStop && quickTourStep < QUICK_TOUR_ZONE_IDS.length - 1
      ? ZONES.find((z) => z.id === QUICK_TOUR_ZONE_IDS[quickTourStep + 1])
      : undefined;

  return (
    <div className="min-h-screen bg-[#f0e6d3] overflow-hidden relative">
      {/* Pixel loading screen — preloads the small intro assets only */}
      {!assetsLoaded && (
        <PixelLoadingScreen
          onLoaded={() => setAssetsLoaded(true)}
          assetsToLoad={assetsToPreload}
        />
      )}

      <AnimatePresence mode="wait">
        {!gameStarted ? (
          <IntroScreen
            key="intro"
            onStart={handleStartGame}
            onSkipToResume={() => handleImmersionSelect("resume")}
            onImmersionSelect={handleImmersionSelect}
          />
        ) : (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="relative min-h-screen"
          >
            <HUD
              discoveredZones={discoveredZones}
              totalZones={ZONES.length}
              easterEggs={easterEggCount}
              onAboutClick={() => openPanel("about")}
              onTestimonialsClick={() => openPanel("testimonials")}
              onHintClick={handleHint}
              onFunFactClick={handleFunFact}
              onSnapshotClick={() => openPanel("resume")}
              onConnectClick={() => openPanel("connect")}
              musicMuted={musicMuted}
              onToggleMusic={handleToggleMusic}
            />

            <Suspense fallback={null}>
              <OverworldMap
                zones={ZONES}
                discoveredZones={discoveredZones}
                onZoneClick={handleZoneClick}
                onSnapshotClick={() => openPanel("resume")}
                highlightedZoneId={highlightedZoneId}
              />
            </Suspense>

            {/* Mobile building list — primary mobile navigation */}
            {isMobile && (
              <Suspense fallback={null}>
                <MobileBuildingList
                  zones={ZONES}
                  discoveredZones={discoveredZones}
                  onZoneClick={handleZoneClick}
                  onSnapshotClick={() => openPanel("resume")}
                  onAboutClick={() => openPanel("about")}
                  onTestimonialsClick={() => openPanel("testimonials")}
                  onConnectClick={() => openPanel("connect")}
                />
              </Suspense>
            )}

            <AnimatePresence>
              {dialogMessage && !activeZone && (
                <DialogBox
                  message={dialogMessage}
                  onNext={() => setDialogMessage(null)}
                  onDismiss={() => setDialogMessage(null)}
                  isLast
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {activeZone && (
                <Suspense fallback={null}>
                  {activeZone.id === "workshop" ? (
                    <WorkshopModal
                      onClose={closeOverlay}
                      selectedProjectId={workshopProjectId}
                      onSelectProject={handleSelectProject}
                      onBackToInventory={handleBackToInventory}
                      tourLabel={tourLabel}
                      onFinishTour={isTourStop ? handleFinishTour : undefined}
                    />
                  ) : (
                    <ZoneModal
                      zone={activeZone}
                      onClose={closeOverlay}
                      navigation={
                        activeZoneIndex >= 0
                          ? {
                              index: activeZoneIndex,
                              total: ZONES.length,
                              onPrevious: () =>
                                openZone(ZONES[(activeZoneIndex - 1 + ZONES.length) % ZONES.length]),
                              onNext: () =>
                                openZone(ZONES[(activeZoneIndex + 1) % ZONES.length]),
                            }
                          : undefined
                      }
                      tourLabel={tourLabel}
                      primaryAction={
                        tourNextZone
                          ? {
                              label: `NEXT: ${tourNextZone.name.toUpperCase()}`,
                              onClick: handleTourNext,
                            }
                          : undefined
                      }
                    />
                  )}
                </Suspense>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showAbout && (
                <Suspense fallback={null}>
                  <AboutSection onClose={closeOverlay} />
                </Suspense>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showTestimonials && (
                <Suspense fallback={null}>
                  <TestimonialsSection onClose={closeOverlay} />
                </Suspense>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showSnapshot && (
                <Suspense fallback={null}>
                  <ResumeSnapshot onClose={closeOverlay} />
                </Suspense>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showConnect && (
                <Suspense fallback={null}>
                  <ConnectFooter onClose={closeOverlay} />
                </Suspense>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showCompletion && (
                <Suspense fallback={null}>
                  <CompletionBanner
                    onDismiss={() => setShowCompletion(false)}
                    onConnectClick={() => {
                      setShowCompletion(false);
                      openPanel("connect");
                    }}
                  />
                </Suspense>
              )}
            </AnimatePresence>

            {/* Quest checklist — only show in full adventure mode */}
            {immersionMode !== "quick" && immersionMode !== "resume" && (
              <Suspense fallback={null}>
                <QuestChecklist
                  discoveredZones={discoveredZones}
                  totalZones={ZONES.length}
                  resumeOpened={resumeOpened}
                  testimonialsOpened={testimonialsOpened}
                  aboutOpened={aboutOpened}
                  easterEggFound={easterEggCount > 0}
                />
              </Suspense>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
