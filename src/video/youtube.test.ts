import { describe, expect, it } from "vitest";
import { decodeEntities, isKaraokeTitle, isOfficialChannel, parseIsoDuration, queryFor, rankResults, type VideoResult } from "./youtube-search.ts";
import { videoIdFrom } from "./youtube-api.ts";

const result = (over: Partial<VideoResult>): VideoResult => ({
  videoId: "aaaaaaaaaaa",
  title: "",
  channelTitle: "",
  channelId: "c",
  thumbnail: "",
  durationSec: null,
  official: false,
  karaoke: false,
  ...over,
});

describe("videoIdFrom", () => {
  it("reads every common URL form", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      "https://youtu.be/M7lc1UVf-VE?t=10",
      "https://m.youtube.com/watch?v=M7lc1UVf-VE&list=x",
      "https://www.youtube.com/shorts/M7lc1UVf-VE",
      "https://www.youtube.com/embed/M7lc1UVf-VE",
      "https://music.youtube.com/watch?v=M7lc1UVf-VE",
      "M7lc1UVf-VE",
    ])
      expect(videoIdFrom(url)).toBe("M7lc1UVf-VE");
  });

  it("rejects other sites and bad ids", () => {
    expect(videoIdFrom("https://vimeo.com/123456")).toBeNull();
    expect(videoIdFrom("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(videoIdFrom("javascript:alert(1)")).toBeNull();
  });
});

describe("official and karaoke detection", () => {
  it("recognises the artist's own, VEVO and Topic channels", () => {
    expect(isOfficialChannel("Adele", "Adele")).toBe(true);
    expect(isOfficialChannel("AdeleVEVO", "Adele")).toBe(true);
    expect(isOfficialChannel("Adele - Topic", "Adele")).toBe(true);
    expect(isOfficialChannel("Beyoncé Official", "Beyonce")).toBe(true);
    expect(isOfficialChannel("Sing King", "Adele")).toBe(false);
    expect(isOfficialChannel("Fan uploads of Adele", "Adele")).toBe(false);
  });

  it("recognises karaoke-style titles", () => {
    expect(isKaraokeTitle("Song (Karaoke Version)")).toBe(true);
    expect(isKaraokeTitle("Song - Piano Instrumental")).toBe(true);
    expect(isKaraokeTitle("Song (Official Video)")).toBe(false);
  });

  it("ranks by mode and keeps YouTube's order within a rank", () => {
    const list = [
      result({ videoId: "k1", karaoke: true }),
      result({ videoId: "o1", official: true }),
      result({ videoId: "x1" }),
      result({ videoId: "o2", official: true }),
    ];
    expect(rankResults(list, "original").map((r) => r.videoId)).toEqual(["o1", "o2", "x1", "k1"]);
    expect(rankResults(list, "karaoke").map((r) => r.videoId)).toEqual(["k1", "x1", "o1", "o2"]);
  });

  it("builds mode-specific queries", () => {
    expect(queryFor("original", "Hello", "Adele")).toBe("Adele Hello official");
    expect(queryFor("karaoke", "Hello", "Adele")).toBe("Hello Adele karaoke");
  });
});

describe("helpers", () => {
  it("decodes HTML entities in API titles", () => {
    expect(decodeEntities("Rock &amp; Roll &#39;n&#39; &quot;Blues&quot; &#233;")).toBe(`Rock & Roll 'n' "Blues" é`);
  });

  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT3M12S")).toBe(192);
    expect(parseIsoDuration("PT1H2M")).toBe(3720);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("bad")).toBeNull();
  });
});
