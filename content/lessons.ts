/**
 * The Learn path: ten lessons from first notes to a two-hand piece.
 * Melodies are traditional or public domain; exercises and arrangements are
 * written for Playboard. Notation is documented in src/formats/musicxml-writer.ts.
 */
import type { ScoreSpec } from "../src/formats/musicxml-writer.ts";
import type { Hand, LicenseInfo } from "../src/core/chart.ts";

export type LessonStep =
  | { kind: "text"; title: string; body: string }
  | { kind: "keys"; title: string; body: string; notes: number[]; fingers?: number[]; hand: Hand };

export interface LessonSource {
  id: string;
  unit: string;
  title: string;
  summary: string;
  skills: string[];
  goals: string[];
  steps: LessonStep[];
  /** Either a score written for the lesson or a reference to a built-in piece. */
  score?: ScoreSpec;
  pieceRef?: string;
  practice: { hands: Hand[]; rate: number; wait: boolean; metronome: boolean; autoplayOther: boolean };
  pass: { accuracy: number };
  license: LicenseInfo;
}

const RIGHTS = "Exercise © Playboard, free to use.";
const original = (what: string): LicenseInfo => ({ kind: "original", attribution: `${what} written for Playboard.` });
const traditional = (song: string): LicenseInfo => ({
  kind: "public-domain",
  attribution: `${song}: traditional melody, public domain. Arrangement written for Playboard.`,
});

export const LESSONS: LessonSource[] = [
  {
    id: "l01-middle-c",
    unit: "First notes",
    title: "Meet middle C",
    summary: "Find your way around the keys and play C, D and E with fingers 1, 2 and 3.",
    skills: ["keyboard-geography", "finger-numbers", "note-reading"],
    goals: ["Find middle C", "Use finger numbers", "Read C, D and E on the treble staff"],
    steps: [
      {
        kind: "text",
        title: "Groups of two and three",
        body: "Black keys come in groups of two and three. Every C is the white key just left of a group of two. Middle C is the C closest to the middle of your keyboard, often near the brand name.",
      },
      {
        kind: "keys",
        title: "Your right-hand fingers have numbers",
        body: "Thumb is 1, index 2, middle 3, ring 4, little finger 5. Rest your thumb on middle C and let fingers 2 and 3 fall on D and E.",
        notes: [60, 62, 64],
        fingers: [1, 2, 3],
        hand: "R",
      },
      {
        kind: "text",
        title: "On the staff",
        body: "Middle C sits on its own short line below the treble staff. D hangs just under the bottom line. E sits on the bottom line. The music waits for you, so take your time.",
      },
    ],
    score: {
      title: "Meet middle C",
      composer: "Playboard",
      rights: RIGHTS,
      keyFifths: 0,
      time: [4, 4],
      tempo: 72,
      staves: [
        "C4/q:1 C4:1 C4:1 C4:1 | C4/h:1 C4/h:1 | D4/q:2 D4:2 D4:2 D4:2 | D4/h:2 D4/h:2 | E4/q:3 E4:3 E4:3 E4:3 | E4/h:3 E4/h:3 | C4/q:1 D4:2 E4:3 D4:2 | C4/w:1",
      ],
    },
    practice: { hands: ["R"], rate: 1, wait: true, metronome: false, autoplayOther: false },
    pass: { accuracy: 85 },
    license: original("Exercise"),
  },
  {
    id: "l02-five-fingers",
    unit: "First notes",
    title: "Five fingers in C position",
    summary: "Put all five right-hand fingers on C D E F G and play up, down and in skips.",
    skills: ["c-position", "finger-numbers", "note-reading"],
    goals: ["Keep each finger over its own key", "Read F and G", "Play steps and skips"],
    steps: [
      {
        kind: "keys",
        title: "C position",
        body: "Thumb on middle C, then one finger per white key: C D E F G under fingers 1 2 3 4 5. Keep your hand curved, as if holding a ball.",
        notes: [60, 62, 64, 65, 67],
        fingers: [1, 2, 3, 4, 5],
        hand: "R",
      },
      {
        kind: "text",
        title: "Steps and skips",
        body: "Moving to the next key is a step (line to space on the staff). Jumping over a key is a skip (line to line). Bar 5 skips C–E–G.",
      },
    ],
    score: {
      title: "Five fingers",
      composer: "Playboard",
      rights: RIGHTS,
      keyFifths: 0,
      time: [4, 4],
      tempo: 80,
      staves: [
        "C4/q:1 D4:2 E4:3 F4:4 | G4/w:5 | G4/q:5 F4:4 E4:3 D4:2 | C4/w:1 | C4/q:1 E4:3 G4:5 E4:3 | C4/h:1 r/h | E4/q:3 F4:4 G4:5 F4:4 | E4/q:3 D4:2 C4/h:1",
      ],
    },
    practice: { hands: ["R"], rate: 1, wait: true, metronome: false, autoplayOther: false },
    pass: { accuracy: 85 },
    license: original("Exercise"),
  },
  {
    id: "l03-left-hand",
    unit: "First notes",
    title: "The left hand joins",
    summary: "Play the same five notes an octave lower with the left hand, reading the bass staff.",
    skills: ["left-hand", "bass-clef", "finger-numbers"],
    goals: ["Find the C below middle C", "Left-hand finger numbers", "Read C to G on the bass staff"],
    steps: [
      {
        kind: "keys",
        title: "Left-hand C position",
        body: "Left-hand fingers are numbered from the thumb too, so the little finger (5) plays the low C and the thumb (1) plays G.",
        notes: [48, 50, 52, 53, 55],
        fingers: [5, 4, 3, 2, 1],
        hand: "L",
      },
      {
        kind: "text",
        title: "The bass staff",
        body: "The bass clef's two dots surround the F line. The C an octave below middle C sits in the second space from the bottom; G sits on the top line.",
      },
    ],
    score: {
      title: "Left-hand five",
      composer: "Playboard",
      rights: RIGHTS,
      keyFifths: 0,
      time: [4, 4],
      tempo: 80,
      clefs: ["F"],
      staves: [
        "C3/q:5 D3:4 E3:3 F3:2 | G3/w:1 | G3/q:1 F3:2 E3:3 D3:4 | C3/w:5 | C3/q:5 E3:3 G3:1 E3:3 | C3/h:5 r/h | G3/q:1 F3:2 E3:3 D3:4 | C3/w:5",
      ],
    },
    practice: { hands: ["L"], rate: 1, wait: true, metronome: false, autoplayOther: false },
    pass: { accuracy: 85 },
    license: original("Exercise"),
  },
  {
    id: "l04-rhythm",
    unit: "Rhythm",
    title: "Whole, half and quarter notes",
    summary: "Count steady beats and hold notes for their full length in Hot Cross Buns.",
    skills: ["rhythm", "counting", "steady-pulse"],
    goals: ["Count four beats per bar", "Hold half and whole notes", "Play in time with the metronome"],
    steps: [
      {
        kind: "text",
        title: "Note lengths",
        body: "A quarter note gets one beat, a half note two, a whole note four. Count “1 2 3 4” out loud with the clicks and keep holding a key until its beat is over.",
      },
      {
        kind: "text",
        title: "Playing in time",
        body: "From now on the music keeps going. Notes within 40 ms of the beat score Perfect, within 90 ms Good. The metronome clicks every beat; a one-bar count-in starts each run.",
      },
    ],
    score: {
      title: "Hot Cross Buns",
      composer: "Traditional",
      arranger: "Playboard",
      rights: "Melody traditional, public domain. Arrangement © Playboard, free to use.",
      keyFifths: 0,
      time: [4, 4],
      tempo: 84,
      staves: [
        "E4/h:3 D4/h:2 | C4/w:1 | E4/h:3 D4/h:2 | C4/w:1 | C4/q:1 C4:1 C4:1 C4:1 | D4/q:2 D4:2 D4:2 D4:2 | E4/h:3 D4/h:2 | C4/w:1",
      ],
    },
    practice: { hands: ["R"], rate: 1, wait: false, metronome: true, autoplayOther: false },
    pass: { accuracy: 75 },
    license: traditional("Hot Cross Buns"),
  },
  {
    id: "l05-mary",
    unit: "Rhythm",
    title: "Mary Had a Little Lamb",
    summary: "A whole song in C position: keep the beat steady through repeated notes.",
    skills: ["c-position", "rhythm", "repeated-notes"],
    goals: ["Play a complete melody", "Keep repeated notes even", "Hold the final whole note"],
    steps: [
      {
        kind: "text",
        title: "Repeated notes",
        body: "Bars 2 and 6 repeat the same key. Let the key come up between notes so each one sounds, and keep them all the same loudness.",
      },
    ],
    score: {
      title: "Mary Had a Little Lamb",
      composer: "Traditional",
      arranger: "Playboard",
      rights: "Melody traditional, public domain. Arrangement © Playboard, free to use.",
      keyFifths: 0,
      time: [4, 4],
      tempo: 96,
      staves: [
        "E4/q:3 D4:2 C4:1 D4:2 | E4/q:3 E4:3 E4/h:3 | D4/q:2 D4:2 D4/h:2 | E4/q:3 G4:5 G4/h:5 | E4/q:3 D4:2 C4:1 D4:2 | E4/q:3 E4:3 E4:3 E4:3 | D4/q:2 D4:2 E4:3 D4:2 | C4/w:1",
      ],
    },
    practice: { hands: ["R"], rate: 1, wait: false, metronome: true, autoplayOther: false },
    pass: { accuracy: 75 },
    license: traditional("Mary Had a Little Lamb"),
  },
  {
    id: "l06-ode-right",
    unit: "Melodies",
    title: "Ode to Joy, right hand",
    summary: "Beethoven's famous theme with a dotted rhythm, while Playboard plays the left hand.",
    skills: ["c-position", "dotted-rhythm", "phrasing"],
    goals: ["Play a dotted quarter and eighth", "Follow a melody over 16 bars", "Listen to the left hand"],
    steps: [
      {
        kind: "text",
        title: "Dotted rhythm",
        body: "A dot adds half the note's value: a dotted quarter lasts one and a half beats, and the eighth note after it fills the last half beat. Bar 4 goes “long – short – hold”.",
      },
      {
        kind: "text",
        title: "Bar 12",
        body: "The right hand rests while the left-hand thumb plays a low G. Keep counting through the rest.",
      },
    ],
    pieceRef: "ode-to-joy",
    practice: { hands: ["R"], rate: 0.85, wait: false, metronome: false, autoplayOther: true },
    pass: { accuracy: 75 },
    license: {
      kind: "public-domain",
      attribution: "Ludwig van Beethoven, Symphony No. 9 (1824), public domain. Arrangement written for Playboard.",
    },
  },
  {
    id: "l07-hands-together",
    unit: "Hands together",
    title: "Hands together: Lightly Row",
    summary: "Play a melody with the right hand while the left hand holds long bass notes.",
    skills: ["hands-together", "c-position", "coordination"],
    goals: ["Start both hands together", "Hold the left hand while the right moves", "Keep both hands in C position"],
    steps: [
      {
        kind: "text",
        title: "One hand moves, one holds",
        body: "The left hand plays one note per bar and holds it. Press both hands together on beat 1, then let the right hand carry on. Practise each hand alone first if it feels busy: choose Right or Left above the stage.",
      },
      {
        kind: "keys",
        title: "Left-hand notes",
        body: "Only three left-hand notes: C (5), E (3) and G (1).",
        notes: [48, 52, 55],
        fingers: [5, 3, 1],
        hand: "L",
      },
    ],
    score: {
      title: "Lightly Row",
      composer: "Traditional (German folk song)",
      arranger: "Playboard",
      rights: "Melody traditional, public domain. Arrangement © Playboard, free to use.",
      keyFifths: 0,
      time: [4, 4],
      tempo: 92,
      staves: [
        "!mf G4/q:5 E4:3 E4/h:3 | F4/q:4 D4:2 D4/h:2 | C4/q:1 D4:2 E4:3 F4:4 | G4/q:5 G4:5 G4/h:5 | G4/q:5 E4:3 E4/h:3 | F4/q:4 D4:2 D4/h:2 | C4/q:1 E4:3 G4:5 G4:5 | C4/w:1",
        "!mp C3/w:5 | G3/w:1 | C3/w:5 | E3/w:3 | C3/w:5 | G3/w:1 | E3/h:3 G3/h:1 | C3/w:5",
      ],
    },
    practice: { hands: ["L", "R"], rate: 0.8, wait: false, metronome: false, autoplayOther: true },
    pass: { accuracy: 75 },
    license: traditional("Lightly Row (Hänschen klein)"),
  },
  {
    id: "l08-c-scale",
    unit: "Scales",
    title: "The C major scale",
    summary: "Eight notes with five fingers: tuck the thumb under to keep going.",
    skills: ["scales", "thumb-under", "fingering"],
    goals: ["Cross the thumb under after finger 3", "Cross finger 3 over on the way down", "Play eighth notes evenly"],
    steps: [
      {
        kind: "keys",
        title: "Thumb under",
        body: "Play C D E with 1 2 3, then slide the thumb under your hand to F and continue G A B C with 2 3 4 5. On the way down, finger 3 crosses over the thumb from F to E.",
        notes: [60, 62, 64, 65, 67, 69, 71, 72],
        fingers: [1, 2, 3, 1, 2, 3, 4, 5],
        hand: "R",
      },
      {
        kind: "text",
        title: "Eighth notes",
        body: "Bar 5 plays two notes per beat. Count “1 and 2 and”. Start slowly with the tempo slider and speed up when it feels even.",
      },
    ],
    score: {
      title: "C major scale",
      composer: "Playboard",
      rights: RIGHTS,
      keyFifths: 0,
      time: [4, 4],
      tempo: 76,
      staves: [
        "C4/q:1 D4:2 E4:3 F4:1 | G4/q:2 A4:3 B4:4 C5:5 | C5/q:5 B4:4 A4:3 G4:2 | F4/q:1 E4:3 D4:2 C4:1 | C4/e:1 D4/e:2 E4/e:3 F4/e:1 G4/e:2 A4/e:3 B4/e:4 C5/e:5 | C5/h:5 r/h",
      ],
    },
    practice: { hands: ["R"], rate: 0.8, wait: false, metronome: true, autoplayOther: false },
    pass: { accuracy: 75 },
    license: original("Exercise"),
  },
  {
    id: "l09-chords",
    unit: "Chords",
    title: "First chords: C, F and G",
    summary: "Three-note chords in the right hand, moving with as little motion as possible.",
    skills: ["chords", "triads", "inversions"],
    goals: ["Play three notes at exactly the same time", "Move between C, F and G chords", "Keep the thumb on C"],
    steps: [
      {
        kind: "keys",
        title: "C chord",
        body: "C, E and G with fingers 1, 3 and 5.",
        notes: [60, 64, 67],
        fingers: [1, 3, 5],
        hand: "R",
      },
      {
        kind: "keys",
        title: "F chord, close to C",
        body: "Keep the thumb on C; finger 3 moves up to F and finger 5 to A.",
        notes: [60, 65, 69],
        fingers: [1, 3, 5],
        hand: "R",
      },
      {
        kind: "keys",
        title: "G chord, close to C",
        body: "Thumb steps down to B, finger 2 to D, finger 5 stays on G.",
        notes: [59, 62, 67],
        fingers: [1, 2, 5],
        hand: "R",
      },
    ],
    score: {
      title: "C, F and G",
      composer: "Playboard",
      rights: RIGHTS,
      keyFifths: 0,
      time: [4, 4],
      tempo: 80,
      staves: [
        "!mf [C4 E4 G4]/w:1,3,5 | [C4 F4 A4]/w:1,3,5 | [C4 E4 G4]/w:1,3,5 | [B3 D4 G4]/w:1,2,5 | [C4 E4 G4]/h:1,3,5 [C4 F4 A4]/h:1,3,5 | [C4 E4 G4]/h:1,3,5 [B3 D4 G4]/h:1,2,5 | [C4 E4 G4]/q:1,3,5 [C4 E4 G4]/q:1,3,5 [C4 F4 A4]/q:1,3,5 [C4 F4 A4]/q:1,3,5 | [B3 D4 G4]/q:1,2,5 [B3 D4 G4]/q:1,2,5 [C4 E4 G4]/h:1,3,5",
        "!mp C3/w:5 | F3/w:2 | C3/w:5 | G3/w:1 | C3/h:5 F3/h:2 | C3/h:5 G3/h:1 | C3/h:5 F3/h:2 | G3/h:1 C3/h:5",
      ],
    },
    practice: { hands: ["R"], rate: 0.85, wait: false, metronome: false, autoplayOther: true },
    pass: { accuracy: 75 },
    license: original("Exercise"),
  },
  {
    id: "l10-minuet",
    unit: "Your first piece",
    title: "Hands together: Minuet in G",
    summary: "A real Baroque dance for both hands, in G position and three-four time.",
    skills: ["hands-together", "g-position", "three-four", "eighth-notes"],
    goals: ["Count three beats per bar", "Play eighth notes against a held bass", "Play a 16-bar piece with both hands"],
    steps: [
      {
        kind: "text",
        title: "Three-four time",
        body: "A minuet is a dance in three: count “1 2 3” and lean slightly on beat 1. The left hand plays one dotted half note per bar, lasting all three beats.",
      },
      {
        kind: "text",
        title: "F sharp",
        body: "The sharp at the start of each staff means every F is played as F♯, the black key just right of F. You meet it in bars 3, 7 and 15.",
      },
      {
        kind: "text",
        title: "How to practise it",
        body: "Start at 70% tempo. Loop any bar that shows up in Weak spots, practise hands separately, then put them back together.",
      },
    ],
    pieceRef: "minuet-in-g",
    practice: { hands: ["L", "R"], rate: 0.7, wait: false, metronome: false, autoplayOther: true },
    pass: { accuracy: 70 },
    license: {
      kind: "public-domain",
      attribution: "Christian Petzold, Minuet in G major, BWV Anh. 114 (c. 1725), public domain. Arrangement written for Playboard.",
    },
  },
];
