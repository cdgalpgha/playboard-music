import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { installComputerKeyboard } from "@/input/computer-keyboard.ts";
import { restoreInputSettings } from "@/input/midi-input.ts";
import { initCloud } from "@/storage/sync/cloud.ts";
import { Layout } from "./Layout.tsx";
import { Home, PLAYED_KEY } from "@/ui/pages/Home.tsx";
import { inputBus } from "@/input/input-bus.ts";

const FreePlay = lazy(() => import("@/ui/pages/FreePlay.tsx"));
const Learn = lazy(() => import("@/ui/pages/Learn.tsx"));
const LessonPage = lazy(() => import("@/ui/pages/LessonPage.tsx"));
const Pieces = lazy(() => import("@/ui/pages/Pieces.tsx"));
const Piece = lazy(() => import("@/ui/pages/Piece.tsx"));
const ChordBook = lazy(() => import("@/ui/pages/ChordBook.tsx"));
const PlayAlong = lazy(() => import("@/ui/pages/PlayAlong.tsx"));
const Progress = lazy(() => import("@/ui/pages/Progress.tsx"));
const Import = lazy(() => import("@/ui/pages/Import.tsx"));
const Setup = lazy(() => import("@/ui/pages/Setup.tsx"));
const Settings = lazy(() => import("@/ui/pages/Settings.tsx"));
const About = lazy(() => import("@/ui/pages/About.tsx"));
const NotFound = lazy(() => import("@/ui/pages/NotFound.tsx"));

function page(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted" role="status">
          Loading…
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

export function App() {
  useEffect(() => {
    installComputerKeyboard();
    void restoreInputSettings();
    void initCloud();
    // Remember the first note ever played, for the "Start here" guide.
    const off = inputBus.subscribe((e) => {
      if (e.type !== "noteon" || e.source === "playback") return;
      try {
        localStorage.setItem(PLAYED_KEY, "1");
      } catch {
        /* storage blocked */
      }
      off();
    });
    return off;
  }, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="play" element={page(FreePlay)} />
          <Route path="learn" element={page(Learn)} />
          <Route path="learn/:id" element={page(LessonPage)} />
          <Route path="chords" element={page(ChordBook)} />
          <Route path="play-along" element={page(PlayAlong)} />
          <Route path="pieces" element={page(Pieces)} />
          <Route path="pieces/:id" element={page(Piece)} />
          <Route path="import" element={page(Import)} />
          <Route path="progress" element={page(Progress)} />
          <Route path="setup" element={page(Setup)} />
          <Route path="settings" element={page(Settings)} />
          <Route path="about" element={page(About)} />
          <Route path="*" element={page(NotFound)} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
