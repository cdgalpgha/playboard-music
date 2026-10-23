import { PageHeader } from "../controls.tsx";

export default function About() {
  return (
    <div className="pb-12">
      <PageHeader eyebrow="About" title="Credits and licences" />
      <div className="grid max-w-4xl gap-4 px-4 lg:px-8">
        <section className="card space-y-2 text-sm leading-relaxed" aria-labelledby="salamander">
          <h2 id="salamander" className="text-base font-bold">
            Salamander Grand Piano
          </h2>
          <p>
            Piano sounds are from the <strong>Salamander Grand Piano V3</strong> by <strong>Alexander Holm</strong>,
            recorded from a Yamaha C5 grand at 48 kHz/24-bit with two AKG C414 microphones. Licensed under{" "}
            <a className="text-green underline" href="https://creativecommons.org/licenses/by/3.0/" rel="noopener" target="_blank">
              Creative Commons Attribution 3.0
            </a>
            .
          </p>
          <p>
            Source:{" "}
            <a
              className="text-green underline"
              href="https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html"
              rel="noopener"
              target="_blank"
            >
              FreePats
            </a>{" "}
            and{" "}
            <a className="text-green underline" href="https://archive.org/details/SalamanderGrandPianoV3" rel="noopener" target="_blank">
              archive.org
            </a>
            . Changes made by Playboard: a subset of velocity layers, silence trimmed before each attack, tails shortened
            with a fade, and encoding to Ogg Opus. The compatibility tier uses the MP3 conversion distributed by{" "}
            <a className="text-green underline" href="https://github.com/Tonejs/audio" rel="noopener" target="_blank">
              Tone.js
            </a>
            .
          </p>
        </section>
        <section className="card space-y-2 text-sm leading-relaxed" aria-labelledby="fonts">
          <h2 id="fonts" className="text-base font-bold">
            Fonts and software
          </h2>
          <p>
            DM Sans and Manrope (SIL Open Font License), bundled through Fontsource. Built with React, Vite and
            Tailwind CSS (MIT).
          </p>
        </section>
      </div>
    </div>
  );
}
