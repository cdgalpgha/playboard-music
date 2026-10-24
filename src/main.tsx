import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";

if (import.meta.env.DEV) {
  // Read-only handles for end-to-end tests and debugging; not present in production builds.
  void Promise.all([
    import("./state/audio-store.ts"),
    import("./state/input-store.ts"),
    import("./input/input-bus.ts"),
    import("./audio/engine.ts"),
  ]).then(([audio, input, bus, eng]) => {
    Object.assign(window, {
      __pb: { audioStore: audio.audioStore, inputStore: input.inputStore, inputBus: bus.inputBus, engine: eng.engine },
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
