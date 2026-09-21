import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom implements neither of these, and the combobox calls both.
Element.prototype.scrollIntoView = vi.fn();
