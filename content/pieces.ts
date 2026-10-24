/**
 * Built-in pieces: public-domain compositions in arrangements written for Playboard.
 * Notation is documented in src/formats/musicxml-writer.ts.
 */
import type { ScoreSpec } from "../src/formats/musicxml-writer.ts";
import type { LicenseInfo } from "../src/core/chart.ts";

export interface PieceSource {
  id: string;
  level: number;
  skills: string[];
  description: string;
  license: LicenseInfo;
  score: ScoreSpec;
}

const ARRANGER = "Playboard";

export const PIECES: PieceSource[] = [
  {
    id: "ode-to-joy",
    level: 1,
    skills: ["c-position", "hands-together", "dotted-rhythm"],
    description: "The theme from Beethoven's Ninth Symphony in C position, with a simple left hand.",
    license: {
      kind: "public-domain",
      attribution: "Ludwig van Beethoven, Symphony No. 9 (1824), public domain. Arrangement written for Playboard.",
    },
    score: {
      title: "Ode to Joy",
      composer: "Ludwig van Beethoven",
      arranger: ARRANGER,
      rights: "Composition public domain. Arrangement © Playboard, free to use.",
      keyFifths: 0,
      time: [4, 4],
      tempo: 100,
      staves: [
        [
          "!mf E4/q:3 E4:3 F4:4 G4:5",
          "G4:5 F4:4 E4:3 D4:2",
          "C4:1 C4:1 D4:2 E4:3",
          "E4/q.:3 D4/e:2 D4/h:2",
          "E4/q:3 E4:3 F4:4 G4:5",
          "G4:5 F4:4 E4:3 D4:2",
          "C4:1 C4:1 D4:2 E4:3",
          "D4/q.:2 C4/e:1 C4/h:1",
          "!mp D4/q:2 D4:2 E4:3 C4:1",
          "D4/q:2 E4/e:3 F4/e:4 E4/q:3 C4/q:1",
          "D4/q:2 E4/e:3 F4/e:4 E4/q:3 D4/q:2",
          "C4/q:1 D4/q:2 r/h",
          "!f E4/q:3 E4:3 F4:4 G4:5",
          "G4:5 F4:4 E4:3 D4:2",
          "C4:1 C4:1 D4:2 E4:3",
          "D4/q.:2 C4/e:1 C4/h:1",
        ].join(" | "),
        [
          "!mp C3/w:5",
          "G3/w:1",
          "C3/w:5",
          "G3/w:1",
          "C3/w:5",
          "G3/w:1",
          "C3/w:5",
          "G3/h:1 C3/h:5",
          "G3/w:1",
          "G3/h:1 C3/h:5",
          "G3/h:1 C3/h:5",
          "r/h G3/h:1",
          "!mf C3/w:5",
          "G3/w:1",
          "C3/w:5",
          "G3/h:1 C3/h:5",
        ].join(" | "),
      ],
    },
  },
  {
    id: "minuet-in-g",
    level: 2,
    skills: ["g-position", "three-four", "eighth-notes", "hands-together"],
    description: "The first half of the Minuet in G from the Anna Magdalena Bach Notebook, with a walking bass of dotted halves.",
    license: {
      kind: "public-domain",
      attribution:
        "Christian Petzold, Minuet in G major, BWV Anh. 114 (c. 1725), public domain. Arrangement written for Playboard.",
    },
    score: {
      title: "Minuet in G",
      composer: "Christian Petzold (attr. J. S. Bach)",
      arranger: ARRANGER,
      rights: "Composition public domain. Arrangement © Playboard, free to use.",
      keyFifths: 1,
      time: [3, 4],
      tempo: 104,
      staves: [
        [
          "!mf D5/q:5 G4/e:1 A4/e:2 B4/e:3 C5/e:4",
          "D5/q:5 G4/q:1 G4/q:1",
          "E5/q:5 C5/e:1 D5/e:2 E5/e:3 F#5/e:4",
          "G5/q:5 G4/q:1 G4/q:1",
          "C5/q:4 D5/e:5 C5/e:4 B4/e:3 A4/e:2",
          "B4/q:3 C5/e:4 B4/e:3 A4/e:2 G4/e:1",
          "F#4/q:1 G4/e:2 A4/e:3 B4/e:4 G4/e:2",
          "A4/h.:3",
          "D5/q:5 G4/e:1 A4/e:2 B4/e:3 C5/e:4",
          "D5/q:5 G4/q:1 G4/q:1",
          "E5/q:5 C5/e:1 D5/e:2 E5/e:3 F#5/e:4",
          "G5/q:5 G4/q:1 G4/q:1",
          "C5/q:4 D5/e:5 C5/e:4 B4/e:3 A4/e:2",
          "B4/q:3 C5/e:4 B4/e:3 A4/e:2 G4/e:1",
          "A4/q:3 B4/e:4 A4/e:3 G4/e:2 F#4/e:1",
          "G4/h.:2",
        ].join(" | "),
        [
          "!mp G3/h.:1",
          "B2/h.:4",
          "C3/h.:3",
          "B2/h.:4",
          "A2/h.:5",
          "G2/h.:5",
          "D3/h.:2",
          "D3/h.:2",
          "G3/h.:1",
          "B2/h.:4",
          "C3/h.:3",
          "B2/h.:4",
          "A2/h.:5",
          "G2/h.:5",
          "D3/h.:2",
          "G2/h.:5",
        ].join(" | "),
      ],
    },
  },
];
