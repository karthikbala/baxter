// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Assistant } from "../apps/web/src/assistant";
import { Workspace } from "../apps/web/src/workspace";
vi.mock("../apps/web/src/api", () => ({ api: vi.fn(async () => []) }));
vi.mock("../apps/web/src/voice", () => ({ startVoice: vi.fn() }));

it("survives chat history updates, case switches and unmount when scrolling returns a Promise", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const scroll = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const data = { run: { id: "run" }, cases: [{ id: "one", title: "A case" }, { id: "two", title: "Another case" }] };
  const render = (id: string) => <React.StrictMode><Workspace.Provider value={{ data }}><Assistant caseId={id} onAction={() => {}} /></Workspace.Provider></React.StrictMode>;
  await act(async () => { root.render(render("one")); });
  expect(element.textContent).toContain("Response assistant");
  await act(async () => { root.render(render("two")); });
  expect(element.textContent).toContain("Response assistant");
  expect(scroll).not.toHaveBeenCalled(); // Scroll only the message list, never its ancestors.
  await act(async () => { root.unmount(); });
  element.remove();
});
