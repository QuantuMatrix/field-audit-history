// setup.ts — Jest global mocks for PCF / Dataverse environment
import "@testing-library/jest-dom";
import { initializeIcons, setIconOptions } from "@fluentui/react";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";

// Suppress Fluent UI icon warnings in tests
setIconOptions({ disableWarnings: true });
initializeIcons();

// Mock fetch globally
global.fetch = jest.fn();

// TextDecoder/TextEncoder for UTF-8 base64 decode in config loading (Node / jsdom)
if (typeof global.TextDecoder === "undefined") {
    (global as unknown as { TextDecoder: typeof NodeTextDecoder }).TextDecoder =
        NodeTextDecoder;
}
if (typeof global.TextEncoder === "undefined") {
    (global as unknown as { TextEncoder: typeof NodeTextEncoder }).TextEncoder =
        NodeTextEncoder;
}

// Mock ComponentFramework namespace
(global as Record<string, unknown>).ComponentFramework = {};

// Suppress React 16 act() warnings in test output
const originalError = console.error;
beforeAll(() => {
    console.error = (...args: unknown[]) => {
        if (
            typeof args[0] === "string" &&
            args[0].includes("act(")
        ) {
            return;
        }
        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Reset mocks between tests
afterEach(() => {
    jest.restoreAllMocks();
    (global.fetch as jest.Mock).mockReset();
});
