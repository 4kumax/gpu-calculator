import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { cloneDefaultConfig, STORAGE_KEY } from "./config";
import { DRAFT_KEY, saveDraft } from "./local-config-store";
import { HORIZON_STORAGE_KEY } from "./calculation-horizon";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let SettingsPage: typeof import("../app/settings/page").default;
const originalFetch = globalThis.fetch;

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://gpu.test",
    pretendToBeVisual: true,
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    StorageEvent: dom.window.StorageEvent,
    BroadcastChannel: undefined,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  ui = await import("@testing-library/react");
  SettingsPage = (await import("../app/settings/page")).default;
});
afterEach(() => {
  ui.cleanup();
  localStorage.clear();
  sessionStorage.clear();
  globalThis.fetch = originalFetch;
});
after(() => dom.window.close());

for (const invalidMonths of [0, 121, 18.5]) {
  test(`Settings reload preserves an invalid ${invalidMonths}-month draft until correction and validates before saving`, async () => {
    const base = cloneDefaultConfig(),
      draft = structuredClone(base);
    draft.scenarioPresets[0].input.months = invalidMonths;
    draft.gpus[0].name = "Мой ускоритель из черновика";
    const original = JSON.stringify(base);
    localStorage.setItem(STORAGE_KEY, original);
    assert.equal(
      saveDraft(sessionStorage, {
        config: draft,
        baseConfig: base,
        mode: "local",
        updatedAt: "2026-09-07T00:00:00.000Z",
      }),
      null,
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ configured: false, authenticated: false, role: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    ui.render(createElement(SettingsPage));
    const input = (await ui.screen.findByRole("spinbutton", {
      name: "Срок расчёта, месяцев",
    })) as HTMLInputElement;
    assert.equal(
      input.value,
      String(invalidMonths),
      "the invalid draft stays editable after restoration",
    );
    ui.fireEvent.click(
      ui.screen.getByRole("button", { name: "Сохранить изменения" }),
    );
    await ui.waitFor(() =>
      assert.match(
        ui.screen.getByRole("alert").textContent ?? "",
        /input\.months/,
      ),
    );
    assert.equal(
      localStorage.getItem(STORAGE_KEY),
      original,
      "an invalid horizon must not be published",
    );
    assert.equal(localStorage.getItem(HORIZON_STORAGE_KEY), null);
    assert.equal(
      JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).config.scenarioPresets[0]
        .input.months,
      invalidMonths,
    );
    ui.fireEvent.focus(input);
    ui.fireEvent.change(input, { target: { value: "48" } });
    ui.fireEvent.blur(input);
    ui.fireEvent.click(
      ui.screen.getByRole("button", { name: "Сохранить изменения" }),
    );
    await ui.waitFor(() =>
      assert.equal(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).scenarioPresets[0].input
          .months,
        48,
      ),
    );
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    assert.equal(
      saved.gpus[0].name,
      "Мой ускоритель из черновика",
      "correction preserves the other draft edits",
    );
    assert.equal(
      JSON.parse(localStorage.getItem(HORIZON_STORAGE_KEY)!).months,
      48,
    );
    await ui.waitFor(() =>
      assert.equal(sessionStorage.getItem(DRAFT_KEY), null),
    );
  });
}
