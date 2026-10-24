import type { Page } from "@playwright/test";

/**
 * Installs a fake Web MIDI implementation with one input device.
 * `window.__midi.send([status, data1, data2])` delivers a message with the
 * current performance.now() as its timestamp, like a real USB keyboard.
 */
export async function installMockMidi(page: Page, name = "Mock Keystation 61"): Promise<void> {
  await page.addInitScript((deviceName: string) => {
    const input = {
      id: "mock-input-1",
      name: deviceName,
      manufacturer: "Playboard Test",
      state: "connected",
      connection: "open",
      type: "input",
      onmidimessage: null as null | ((e: unknown) => void),
      addEventListener() {},
      removeEventListener() {},
    };
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null as null | ((e: unknown) => void),
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: () => Promise.resolve(access),
    });
    (window as unknown as { __midi: unknown }).__midi = {
      send(bytes: number[], timeStamp = performance.now()) {
        const event = { data: new Uint8Array(bytes), timeStamp };
        input.onmidimessage?.call(input, event);
      },
    };
  }, name);
}

export async function midiSend(page: Page, bytes: number[]): Promise<void> {
  await page.evaluate((b) => (window as unknown as { __midi: { send(b: number[]): void } }).__midi.send(b), bytes);
}
