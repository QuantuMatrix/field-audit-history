import { act } from "@testing-library/react";
import { renderHook } from "./renderHook";
import {
    usePortalInjection,
    resolveAnchor,
    ensureOnePortalForField,
} from "../hooks/usePortalInjection";
import { ITableConfig } from "../models/IConfig";
import { EntityContext } from "../hooks/loadAuditData";

function createGuidLabel(
    fieldName: string,
    displayName: string,
    options?: { guid?: string; index?: number },
): HTMLElement {
    const guid = options?.guid ?? "00000000-0000-0000-0000-000000000001";
    const index = options?.index ?? 1;
    const label = document.createElement("label");
    label.id = `id-${guid}-${index}-${fieldName}-field-label`;
    label.textContent = displayName;
    const wrapper = document.createElement("div");
    wrapper.appendChild(label);
    document.body.appendChild(wrapper);
    return wrapper;
}

function createDataIdLabel(fieldName: string, displayName: string): HTMLElement {
    const container = document.createElement("div");
    container.setAttribute("data-id", `${fieldName}-field-label`);
    const label = document.createElement("label");
    label.textContent = displayName;
    container.appendChild(label);
    document.body.appendChild(container);
    return container;
}

/** Realistic UCI: data-id container + GUID label (both strategies would match). */
function createNestedUciLabel(
    fieldName: string,
    displayName: string,
    options?: { guid?: string; index?: number },
): HTMLElement {
    const guid = options?.guid ?? "00000000-0000-0000-0000-000000000001";
    const index = options?.index ?? 1;
    const container = document.createElement("div");
    container.setAttribute("data-id", `${fieldName}-field-label`);
    const label = document.createElement("label");
    label.id = `id-${guid}-${index}-${fieldName}-field-label`;
    label.textContent = displayName;
    container.appendChild(label);
    document.body.appendChild(container);
    return container;
}

function cleanupLabels(): void {
    document.querySelectorAll("[data-audit-portal]").forEach((el) => el.remove());
    document.querySelectorAll('label[id$="-field-label"]').forEach((el) => {
        const root =
            el.closest('[data-id$="-field-label"]') ?? el.parentElement;
        root?.remove();
    });
    document.querySelectorAll('[data-id$="-field-label"]').forEach((el) => {
        el.remove();
    });
}

function countPortals(fieldName?: string): number {
    if (fieldName) {
        return document.querySelectorAll(
            `[data-audit-portal="${fieldName}"]`
        ).length;
    }
    return document.querySelectorAll("[data-audit-portal]").length;
}

describe("resolveAnchor / ensureOnePortalForField", () => {
    afterEach(() => {
        cleanupLabels();
    });

    it("resolveAnchor prefers data-id field-label ancestor", () => {
        const container = createNestedUciLabel("emailaddress1", "Email");
        const label = container.querySelector("label")!;
        expect(resolveAnchor(label)).toBe(container);
    });

    it("ensureOnePortalForField creates exactly one and collapses extras", () => {
        const a = createNestedUciLabel("emailaddress1", "Email", {
            guid: "11111111-1111-1111-1111-111111111111",
            index: 1,
        });
        const b = createNestedUciLabel("emailaddress1", "Email", {
            guid: "22222222-2222-2222-2222-222222222222",
            index: 2,
        });

        const first = ensureOnePortalForField("emailaddress1", a);
        // Second call with different anchor must NOT create a second portal
        const second = ensureOnePortalForField("emailaddress1", b);
        expect(first).toBe(second);
        expect(countPortals("emailaddress1")).toBe(1);

        // Force orphan extras under both anchors
        const extra1 = document.createElement("span");
        extra1.setAttribute("data-audit-portal", "emailaddress1");
        a.appendChild(extra1);
        const extra2 = document.createElement("span");
        extra2.setAttribute("data-audit-portal", "emailaddress1");
        b.appendChild(extra2);
        expect(countPortals("emailaddress1")).toBeGreaterThan(1);

        ensureOnePortalForField("emailaddress1", a);
        expect(countPortals("emailaddress1")).toBe(1);
    });
});

describe("usePortalInjection (DOM scanning)", () => {
    const auditedFields = new Set(["emailaddress1", "telephone1", "jobtitle"]);
    const tableConfig: ITableConfig = { mode: "audited", fields: [] };
    const defaultEntityContext: EntityContext = {
        entityId: "record-001",
        entityTypeName: "contact",
    };

    afterEach(() => {
        cleanupLabels();
        jest.useRealTimers();
    });

    function setupHook(
        hostField = "vp365_audithost",
        tc: ITableConfig = tableConfig,
        af: Set<string> | null = auditedFields,
        loading = false,
        ec: EntityContext | null = defaultEntityContext,
    ) {
        return renderHook(() =>
            usePortalInjection(hostField, tc, af, loading, ec)
        );
    }

    it("should scan labels with GUID-prefixed id and create portal spans", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        createGuidLabel("telephone1", "Business Phone");
        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(2);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
        expect(result.current.portalTargets[1].fieldLogicalName).toBe(
            "telephone1"
        );
        expect(countPortals()).toBe(2);
    });

    it("should skip the host field to prevent self-injection", () => {
        jest.useFakeTimers();
        createGuidLabel("vp365_audithost", "Audit Host");
        createGuidLabel("emailaddress1", "Email");
        const { result } = setupHook("vp365_audithost");
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
    });

    it("should not scan when metadataLoading is true", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        const { result } = setupHook(
            "vp365_audithost",
            tableConfig,
            auditedFields,
            true
        );
        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current.portalTargets.length).toBe(0);
    });

    it("should not scan when entityContext is null (create mode)", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        const { result } = setupHook(
            "vp365_audithost",
            tableConfig,
            auditedFields,
            false,
            null
        );
        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current.portalTargets.length).toBe(0);
    });

    it("should respect audited filtering — skip non-audited fields", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        createGuidLabel("address1_line1", "Address");
        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
    });

    it("should fall back to data-id selector when GUID labels not present", () => {
        jest.useFakeTimers();
        createDataIdLabel("emailaddress1", "Email");
        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
    });

    it("should not create duplicate portal spans on re-scan", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        const { result, rerender } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        rerender();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(countPortals("emailaddress1")).toBe(1);
        expect(result.current.portalTargets.length).toBe(1);
    });

    it("should clean up portals on unmount", () => {
        jest.useFakeTimers();
        createGuidLabel("emailaddress1", "Email");
        const { unmount } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(countPortals()).toBe(1);
        unmount();
        expect(countPortals()).toBe(0);
    });

    // --- Config web resource (vp365_AuditHistoryConfig.js) ---

    it("config mode include: only listed fields get icons", () => {
        jest.useFakeTimers();
        const includeConfig: ITableConfig = {
            mode: "include",
            fields: ["emailaddress1"],
        };
        createGuidLabel("emailaddress1", "Email");
        createGuidLabel("telephone1", "Phone");
        createGuidLabel("jobtitle", "Job Title");
        const { result } = setupHook("vp365_audithost", includeConfig);
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
        expect(countPortals()).toBe(1);
    });

    it("config mode exclude: listed fields do not get icons", () => {
        jest.useFakeTimers();
        const excludeConfig: ITableConfig = {
            mode: "exclude",
            fields: ["telephone1"],
        };
        createGuidLabel("emailaddress1", "Email");
        createGuidLabel("telephone1", "Phone");
        createGuidLabel("jobtitle", "Job Title");
        const { result } = setupHook("vp365_audithost", excludeConfig);
        act(() => {
            jest.advanceTimersByTime(900);
        });
        const names = result.current.portalTargets
            .map((t) => t.fieldLogicalName)
            .sort();
        expect(names).toEqual(["emailaddress1", "jobtitle"]);
        expect(countPortals("telephone1")).toBe(0);
    });

    it("config mode all: icons on fields even if not audited", () => {
        jest.useFakeTimers();
        const allConfig: ITableConfig = { mode: "all", fields: [] };
        createGuidLabel("emailaddress1", "Email");
        createGuidLabel("address1_line1", "Address");
        const { result } = setupHook("vp365_audithost", allConfig);
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(2);
    });

    // --- HARD RULE: one icon per field logical name under ALL conditions ---

    it("nested UCI (both strategies match): exactly one portal and one target", () => {
        jest.useFakeTimers();
        createNestedUciLabel("emailaddress1", "Email");
        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(1);
        expect(countPortals("emailaddress1")).toBe(1);
        expect(countPortals()).toBe(1);
    });

    it("field present three times: still exactly ONE portal and ONE target", () => {
        jest.useFakeTimers();
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "11111111-1111-1111-1111-111111111111",
            index: 1,
        });
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "22222222-2222-2222-2222-222222222222",
            index: 2,
        });
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "33333333-3333-3333-3333-333333333333",
            index: 3,
        });

        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });

        // One logical field → one icon host, one React target (never 3)
        expect(result.current.portalTargets.length).toBe(1);
        expect(result.current.portalTargets[0].fieldLogicalName).toBe(
            "emailaddress1"
        );
        expect(countPortals("emailaddress1")).toBe(1);
        expect(countPortals()).toBe(1);
    });

    it("three different fields: exactly one portal each (never three each)", () => {
        jest.useFakeTimers();
        createNestedUciLabel("emailaddress1", "Email");
        createNestedUciLabel("telephone1", "Phone");
        createNestedUciLabel("jobtitle", "Job Title");
        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(result.current.portalTargets.length).toBe(3);
        expect(countPortals("emailaddress1")).toBe(1);
        expect(countPortals("telephone1")).toBe(1);
        expect(countPortals("jobtitle")).toBe(1);
        expect(countPortals()).toBe(3);
    });

    it("re-scan with triplicate field labels never grows icon count", () => {
        jest.useFakeTimers();
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "11111111-1111-1111-1111-111111111111",
            index: 1,
        });
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "22222222-2222-2222-2222-222222222222",
            index: 2,
        });
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "33333333-3333-3333-3333-333333333333",
            index: 3,
        });

        const { result, rerender } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });
        expect(countPortals("emailaddress1")).toBe(1);

        rerender();
        act(() => {
            jest.advanceTimersByTime(1500);
        });

        expect(result.current.portalTargets.length).toBe(1);
        expect(countPortals("emailaddress1")).toBe(1);
    });

    it("collapses pre-seeded duplicate portal spans for the same field", () => {
        jest.useFakeTimers();
        const row = createNestedUciLabel("emailaddress1", "Email");
        for (let i = 0; i < 3; i++) {
            const span = document.createElement("span");
            span.setAttribute("data-audit-portal", "emailaddress1");
            row.appendChild(span);
        }
        expect(countPortals("emailaddress1")).toBe(3);

        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });

        expect(result.current.portalTargets.length).toBe(1);
        expect(countPortals("emailaddress1")).toBe(1);
    });

    it("portalTargets never lists the same field twice", () => {
        jest.useFakeTimers();
        // GUID-only + nested for same field name (would double-match without claim)
        createGuidLabel("emailaddress1", "Email", {
            guid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            index: 1,
        });
        createNestedUciLabel("emailaddress1", "Email", {
            guid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            index: 2,
        });
        createDataIdLabel("emailaddress1", "Email");

        const { result } = setupHook();
        act(() => {
            jest.advanceTimersByTime(900);
        });

        const names = result.current.portalTargets.map(
            (t) => t.fieldLogicalName
        );
        expect(names).toEqual(["emailaddress1"]);
        expect(new Set(names).size).toBe(names.length);
        expect(countPortals("emailaddress1")).toBe(1);
    });
});
