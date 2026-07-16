// usePortalInjection.ts — DOM scanning and portal injection
//
// HARD RULE: at most ONE audit icon per field logical name on the form,
// under all conditions (field appears once, many times, re-scans, dual strategies).
//
// Config web resource (vp365_AuditHistoryConfig.js) still controls WHICH fields
// are eligible via shouldShowIcon (audited | include | exclude | all).

import * as React from "react";
import { ITableConfig } from "../models/IConfig";
import { EntityContext } from "./loadAuditData";

const PORTAL_MARKER_ATTR = "data-audit-portal";
const MUTATION_DEBOUNCE_MS = 500;
const INITIAL_SCAN_DELAY_MS = 800;

const GUID_LABEL_ID_REGEX =
    /^id-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+-(.+)-field-label$/i;

export interface PortalTarget {
    fieldLogicalName: string;
    fieldDisplayName: string;
    portalElement: HTMLSpanElement;
}

/**
 * Config web resource field visibility (vp365_AuditHistoryConfig.js tables.*).
 * Modes: audited | include | exclude | all — unchanged contract.
 */
export function shouldShowIcon(
    fieldName: string,
    tableConfig: ITableConfig,
    auditedFields: Set<string> | null,
): boolean {
    switch (tableConfig.mode) {
        case "include":
            return tableConfig.fields.includes(fieldName);
        case "exclude":
            if (tableConfig.fields.includes(fieldName)) return false;
            return auditedFields === null || auditedFields.has(fieldName);
        case "all":
            return true;
        case "audited":
        default:
            return auditedFields === null || auditedFields.has(fieldName);
    }
}

/**
 * Prefer the UCI label container (`data-id="…-field-label"`) as the inject host.
 */
export function resolveAnchor(fromEl: Element): Element {
    let current: Element | null = fromEl;
    while (current) {
        if (current.getAttribute("data-id")?.endsWith("-field-label")) {
            return current;
        }
        current = current.parentElement;
    }
    return fromEl.parentElement ?? fromEl;
}

/**
 * Document-wide: exactly one portal span for this field logical name.
 * Keeps the first existing span (moves it onto preferredAnchor if needed),
 * removes every other span for the same field name, creates only if none exist.
 */
export function ensureOnePortalForField(
    fieldName: string,
    preferredAnchor: Element,
): HTMLSpanElement {
    const existing = Array.from(
        document.querySelectorAll(`[${PORTAL_MARKER_ATTR}="${fieldName}"]`)
    ).filter((el): el is HTMLSpanElement => el instanceof HTMLSpanElement);

    if (existing.length > 0) {
        const keep = existing[0];
        for (let i = 1; i < existing.length; i++) {
            existing[i].remove();
        }
        // Prefer hosting on the resolved anchor so the icon sits on the label row
        if (
            keep.parentElement !== preferredAnchor &&
            preferredAnchor.isConnected
        ) {
            preferredAnchor.appendChild(keep);
        }
        keep.setAttribute(PORTAL_MARKER_ATTR, fieldName);
        return keep;
    }

    const portalSpan = document.createElement("span");
    portalSpan.setAttribute(PORTAL_MARKER_ATTR, fieldName);
    portalSpan.style.display = "inline-flex";
    portalSpan.style.alignItems = "center";
    portalSpan.style.verticalAlign = "middle";
    preferredAnchor.appendChild(portalSpan);
    return portalSpan;
}

function targetsEqual(a: PortalTarget[], b: PortalTarget[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (
            a[i].fieldLogicalName !== b[i].fieldLogicalName ||
            a[i].portalElement !== b[i].portalElement
        ) {
            return false;
        }
    }
    return true;
}

/**
 * Build at most one PortalTarget per field logical name.
 * First eligible label/container for a field wins; later occurrences are ignored.
 */
export function usePortalInjection(
    hostFieldLogicalName: string,
    tableConfig: ITableConfig,
    auditedFields: Set<string> | null,
    metadataLoading: boolean,
    entityContext: EntityContext | null,
): { portalTargets: PortalTarget[] } {
    // Keyed by field logical name — never more than one portal per field
    const portalContainersRef = React.useRef<Map<string, HTMLSpanElement>>(
        new Map()
    );
    const scanFnRef = React.useRef<() => void>(() => undefined);
    const debounceTimerRef = React.useRef<number>(0);
    const portalTargetsRef = React.useRef<PortalTarget[]>([]);
    const isMutatingRef = React.useRef(false);

    const [portalTargets, setPortalTargets] = React.useState<PortalTarget[]>(
        []
    );

    const shouldShowIconCb = React.useCallback(
        (fieldName: string): boolean =>
            shouldShowIcon(fieldName, tableConfig, auditedFields),
        [tableConfig, auditedFields]
    );

    const scanFormForFields = React.useCallback(() => {
        const newTargets: PortalTarget[] = [];
        /** Fields already claimed this scan — prevents re-push / multi-portal */
        const claimedFields = new Set<string>();

        /**
         * Claim a field exactly once. Subsequent labels for the same logical
         * name are no-ops (fixes stacked icons when a field appears N times).
         */
        const claimField = (
            fieldName: string,
            displayName: string,
            anchorSource: Element
        ): void => {
            if (!fieldName) return;
            if (fieldName === hostFieldLogicalName) return;
            if (claimedFields.has(fieldName)) return;
            if (!shouldShowIconCb(fieldName)) return;

            const anchor = resolveAnchor(anchorSource);
            const portalElement = ensureOnePortalForField(fieldName, anchor);

            claimedFields.add(fieldName);
            portalContainersRef.current.set(fieldName, portalElement);
            // Exactly one target entry per field — never push again for this name
            newTargets.push({
                fieldLogicalName: fieldName,
                fieldDisplayName: displayName,
                portalElement,
            });
        };

        isMutatingRef.current = true;
        try {
            // Strategy 1 (PRIMARY): Dynamics GUID labels
            document
                .querySelectorAll('label[id$="-field-label"]')
                .forEach((label) => {
                    const match = GUID_LABEL_ID_REGEX.exec(label.id);
                    if (!match?.[1]) return;
                    const fieldName = match[1];
                    const trimmed = label.textContent?.trim();
                    const displayName =
                        trimmed && trimmed.length > 0 ? trimmed : fieldName;
                    claimField(fieldName, displayName, label);
                });

            // Strategy 2 (FALLBACK): data-id containers for fields not yet claimed
            document
                .querySelectorAll('[data-id$="-field-label"]')
                .forEach((container) => {
                    const dataId = container.getAttribute("data-id") ?? "";
                    const fieldName = dataId.replace(/-field-label$/, "");
                    if (!fieldName || claimedFields.has(fieldName)) return;

                    const label = container.querySelector("label");
                    const trimmed = label?.textContent?.trim();
                    const displayName =
                        trimmed && trimmed.length > 0 ? trimmed : fieldName;
                    claimField(fieldName, displayName, container);
                });

            // Remove any portal spans for fields no longer claimed (or orphans)
            const live = new Set(newTargets.map((t) => t.portalElement));
            document
                .querySelectorAll(`[${PORTAL_MARKER_ATTR}]`)
                .forEach((el) => {
                    if (!(el instanceof HTMLSpanElement)) return;
                    if (!live.has(el)) {
                        el.remove();
                    }
                });

            // Enforce document invariant: ≤1 span per field name
            const seenNames = new Set<string>();
            document
                .querySelectorAll(`[${PORTAL_MARKER_ATTR}]`)
                .forEach((el) => {
                    if (!(el instanceof HTMLSpanElement)) return;
                    const name = el.getAttribute(PORTAL_MARKER_ATTR) ?? "";
                    if (!name) {
                        el.remove();
                        return;
                    }
                    if (seenNames.has(name)) {
                        el.remove();
                        return;
                    }
                    seenNames.add(name);
                });

            // Rebuild map from final targets only
            portalContainersRef.current.clear();
            for (const t of newTargets) {
                portalContainersRef.current.set(
                    t.fieldLogicalName,
                    t.portalElement
                );
            }

            if (!targetsEqual(portalTargetsRef.current, newTargets)) {
                portalTargetsRef.current = newTargets;
                setPortalTargets(newTargets);
            }
        } finally {
            isMutatingRef.current = false;
        }
    }, [shouldShowIconCb, hostFieldLogicalName]);

    scanFnRef.current = scanFormForFields;

    React.useEffect(() => {
        if (metadataLoading || !entityContext) return;

        const debouncedScan = (): void => {
            if (isMutatingRef.current) return;
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = window.setTimeout(() => {
                if (isMutatingRef.current) return;
                scanFnRef.current();
            }, MUTATION_DEBOUNCE_MS);
        };

        const initialTimer = window.setTimeout(() => {
            scanFnRef.current();
        }, INITIAL_SCAN_DELAY_MS);

        const observer = new MutationObserver(debouncedScan);

        const formBody =
            document.querySelector('[data-id="form-body"]') ??
            document.querySelector('[data-id="editFormRoot"]') ??
            document.body;

        observer.observe(formBody, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
            window.clearTimeout(initialTimer);
            window.clearTimeout(debounceTimerRef.current);

            isMutatingRef.current = true;
            try {
                document
                    .querySelectorAll(`[${PORTAL_MARKER_ATTR}]`)
                    .forEach((el) => el.remove());
            } finally {
                isMutatingRef.current = false;
            }

            portalContainersRef.current.clear();
            portalTargetsRef.current = [];
        };
    }, [metadataLoading, entityContext]);

    return { portalTargets };
}
