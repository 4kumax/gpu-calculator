import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement, useState } from "react";
import { JSDOM } from "jsdom";
import { Capability, cloneDefaultConfig, STORAGE_KEY } from "./config";
import { DRAFT_KEY } from "./local-config-store";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let useConfig: typeof import("../hooks/use-config").useConfig;
let fields: typeof import("../components/settings/fields");
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
  ({ useConfig } = await import("../hooks/use-config"));
  fields = await import("../components/settings/fields");
});
afterEach(() => {
  ui.cleanup();
  dom.window.localStorage.clear();
  globalThis.fetch = originalFetch;
});
after(() => {
  dom.window.close();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("ошибка определения backend режима блокирует local save и сохраняет видимый локальный снимок", async () => {
  const local = cloneDefaultConfig();
  local.models[0].name = "Локальные данные";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  globalThis.fetch = async () => {
    throw new Error("Network unavailable");
  };
  const hook = ui.renderHook(() => useConfig());
  await ui.waitFor(() => assert.equal(hook.result.current.loaded, true));
  assert.equal(hook.result.current.modeKnown, false);
  assert.equal(hook.result.current.canSave, false);
  assert.equal(hook.result.current.config.models[0].name, "Локальные данные");
  const before = localStorage.getItem(STORAGE_KEY);
  await ui.act(async () => {
    const result = await hook.result.current.save(local);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /Режим хранения/);
  });
  assert.equal(localStorage.getItem(STORAGE_KEY), before);
});

test("hook игнорирует события черновиков и обновляется при изменении ключа каталога", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return json({ configured: false, authenticated: false, role: null });
  };
  const hook = ui.renderHook(() => useConfig());
  await ui.waitFor(() => assert.equal(hook.result.current.canSave, true));
  const loadedCalls = calls;
  ui.act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: `${DRAFT_KEY}:another-tab` }),
    );
  });
  assert.equal(calls, loadedCalls);
  const external = cloneDefaultConfig();
  external.revision += 1;
  external.models[0].name = "Внешняя ревизия";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(external));
  ui.act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  });
  await ui.waitFor(() =>
    assert.equal(hook.result.current.config.models[0].name, "Внешняя ревизия"),
  );
  assert.equal(calls, loadedCalls + 1);
});

test("роль viewer не отправляет PUT общего каталога", async () => {
  let puts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") puts += 1;
    return json({
      configured: true,
      authenticated: true,
      role: "viewer",
      config: cloneDefaultConfig(),
      history: [],
    });
  };
  const hook = ui.renderHook(() => useConfig());
  await ui.waitFor(() => assert.equal(hook.result.current.loaded, true));
  assert.equal(hook.result.current.canSave, false);
  await ui.act(async () => {
    assert.equal(
      (await hook.result.current.save(cloneDefaultConfig())).ok,
      false,
    );
  });
  assert.equal(puts, 0);
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
});

test("локальный каталог публикуется в общий только по явному save с expectedRevision 0", async () => {
  const local = cloneDefaultConfig();
  local.models[0].name = "Подготовленный локально каталог";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  let serverConfig = { ...cloneDefaultConfig(), revision: 0 };
  let puts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") {
      puts += 1;
      const body = JSON.parse(String(init.body));
      assert.equal(body.expectedRevision, 0);
      serverConfig = {
        ...body.config,
        revision: 1,
        updatedAt: new Date().toISOString(),
      };
      return json({ config: serverConfig });
    }
    return json({
      configured: true,
      authenticated: true,
      role: "editor",
      config: serverConfig,
      history: [],
    });
  };
  const hook = ui.renderHook(() => useConfig());
  await ui.waitFor(() => assert.equal(hook.result.current.canSave, true));
  assert.equal(puts, 0);
  assert.equal(hook.result.current.config.models[0].name, local.models[0].name);
  assert.equal(hook.result.current.sharedRevision, 0);
  await ui.act(async () => {
    assert.equal(
      (
        await hook.result.current.save(hook.result.current.config, {
          expectedRevision: 0,
        })
      ).ok,
      true,
    );
  });
  await ui.waitFor(() => assert.equal(hook.result.current.sharedRevision, 1));
  assert.equal(puts, 1);
  assert.equal(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).revision,
    local.revision,
  );
});

test("checkbox возможностей доступны по названию и сохраняют остальные выбранные пункты", () => {
  function Editor() {
    const [value, setValue] = useState<Capability[]>(["текст"]);
    return createElement(
      "div",
      null,
      createElement(fields.CapabilityField, {
        label: "Возможности модели",
        value,
        onChange: setValue,
      }),
      createElement("output", null, value.join(",")),
    );
  }
  const view = ui.render(createElement(Editor));
  assert.ok(view.getByRole("group", { name: "Возможности модели" }));
  ui.fireEvent.click(view.getByRole("checkbox", { name: "код" }));
  assert.equal(view.getByRole("status").textContent, "текст,код");
  ui.fireEvent.click(view.getByRole("checkbox", { name: "текст" }));
  assert.equal(view.getByRole("status").textContent, "код");
});

test("очистка обязательного числового поля не заменяет цену нулём", () => {
  const values: Array<number | undefined> = [];
  const view = ui.render(
    createElement(fields.NumberField, {
      label: "Цена узла",
      value: 123,
      onChange: (value) => values.push(value),
    }),
  );
  const input = view.getByRole("spinbutton", {
    name: "Цена узла",
  }) as HTMLInputElement;
  ui.fireEvent.focus(input);
  ui.fireEvent.change(input, { target: { value: "" } });
  assert.deepEqual(values, []);
  assert.equal(input.value, "");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  ui.fireEvent.blur(input);
  assert.equal(input.value, "123");
});
