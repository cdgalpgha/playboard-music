import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { installComputerKeyboard } from "@/input/computer-keyboard.ts";
import { restoreInputSettings } from "@/input/midi-input.ts";
import { Layout } from "./Layout.tsx";
import { Home } from "@/ui/pages/Home.tsx";

const FreePlay = lazy(() => import("@/ui/pages/FreePlay.tsx"));
const Setup = lazy(() => import("@/ui/pages/Setup.tsx"));
const Settings = lazy(() => import("@/ui/pages/Settings.tsx"));
const About = lazy(() => import("@/ui/pages/About.tsx"));
const NotFound = lazy(() => import("@/ui/pages/NotFound.tsx"));

function PageFallback() {
  return (
    <div className="p-8 text-sm text-muted" role="status">
      Loading…
    </div>
  );
}

export function App() {
  useEffect(() => {
    installComputerKeyboard();
    void restoreInputSettings();
  }, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="play"
            element={
              <Suspense fallback={<PageFallback />}>
                <FreePlay />
              </Suspense>
            }
          />
          <Route
            path="setup"
            element={
              <Suspense fallback={<PageFallback />}>
                <Setup />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<PageFallback />}>
                <About />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<PageFallback />}>
                <NotFound />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
