// IConfig.ts — Configuration interfaces and defaults

/**
 * Logical name of the solution-shipped config web resource.
 * Loaded automatically when the PCF "Config Web Resource" property is blank.
 */
export const DEFAULT_CONFIG_WEB_RESOURCE = "vp365_AuditHistoryConfig";

/**
 * Per-table field visibility configuration.
 * Controls which fields on a specific table get audit history icons.
 */
/**
 * Discriminated status for audit readiness detection.
 * Evaluated in priority order during init.
 */
export type AuditStatusKind =
    | "loading"
    | "ok"
    | "orgAuditDisabled"
    | "tableAuditDisabled"
    | "noAuditedFields"
    | "noAuditRecords"
    | "error";

export interface ITableConfig {
    /**
     * Field selection mode:
     * - "audited": show icons only on fields with IsAuditEnabled=true (default)
     * - "include": show icons ONLY on fields listed in `fields`
     * - "exclude": show icons on all audited fields EXCEPT those in `fields`
     * - "all": show icons on ALL visible fields (ignore audit metadata)
     */
    mode: "audited" | "include" | "exclude" | "all";

    /** Field logical names for include/exclude modes */
    fields: string[];
}

/**
 * Client-side filter state for the audit panel.
 * Filters are applied to already-loaded entries — no extra API calls.
 */
export interface IFilterState {
    /** Filter by field logical names (empty = show all) */
    selectedFields: string[];

    /** Filter by user display names (empty = show all) */
    selectedUsers: string[];

    /** Filter by operation type codes (empty = show all) */
    selectedOperations: number[];

    /** Show only entries where a field value was cleared (new value is empty) */
    showClearedOnly: boolean;

    /** Show entries on or after this date (null = no lower bound) */
    dateFrom: Date | null;

    /** Show entries on or before this date (null = no upper bound) */
    dateTo: Date | null;
}

export interface IAuditConfig {
    /** Schema version for forward compatibility */
    _version: string;

    features: {
        /** Allow restoring field values from audit history (default true) */
        allowRestore: boolean;

        /** Allow copying field values to clipboard (default true) */
        allowCopy: boolean;

        /** Allow exporting audit history to CSV (default true) */
        allowExport: boolean;
    };

    audit: {
        /** Number of audit entries per page (default 25) */
        defaultPageSize: number;

        /** Maximum number of pages to allow loading (safety limit) */
        maxPages: number;

        /**
         * Which operation types to show in the timeline.
         * 1 = Created, 2 = Updated, 3 = Deleted, 4 = Accessed.
         * Default: [1, 2] — excludes "Accessed" which is usually noise.
         */
        visibleOperations: number[];

        /**
         * Date format for timestamps in the timeline.
         * - "short": compact date only (e.g., "Mar 14, 2026")
         * - "long": full date + time (e.g., "March 14, 2026, 3:45 PM")
         * - "relative": relative time in Quick Peek, full in Deep Dive
         * Default: "short" — uses toLocaleDateString with short month.
         */
        dateFormat: "short" | "long" | "relative";
    };

    /**
     * Per-table field visibility rules.
     * Key = entity logical name (e.g., "account") or "*" for default.
     * If a table is not listed, falls back to "*".
     * If no "*" exists, defaults to mode:"audited".
     */
    tables: Record<string, ITableConfig>;

    /** Quick Peek callout settings (UC1 — compact popup on icon click) */
    quickPeek: {
        /** Max entries to show in the quick peek popup */
        maxEntries: number;

        /** Show "Changed By" filter dropdown in the popup */
        showUserFilter: boolean;
    };

    display: {
        /** Panel width — "80%" for sidecar or a pixel value like "480px" */
        panelWidth: string;

        /** Show who made the change in timeline entries */
        showChangedBy: boolean;

        /** Show operation type (Created/Updated/Deleted) in timeline */
        showOperationType: boolean;

        /** Max characters for old/new value preview before truncation */
        valuePreviewLength: number;

        /** Tooltip text shown when hovering over an audit icon */
        iconTooltip: string;

        /** Show filter bar in the audit panel (default true) */
        showFilters: boolean;
    };

    labels: {
        /** Panel header when viewing all-record audit */
        panelTitle: string;

        /** Panel header when viewing single-field audit (field name appended) */
        fieldPanelTitle: string;

        /** Message when no audit entries exist */
        noRecordsMessage: string;

        /** Text on the "Load More" pagination button */
        loadMoreButton: string;

        /** Generic error message fallback */
        errorMessage: string;

        /** Operation labels */
        createdLabel: string;
        updatedLabel: string;
        deletedLabel: string;

        /** Status text shown in the host field container */
        statusLabel: string;

        /** Status text while detecting audited fields */
        statusLoadingLabel: string;

        /** Quick peek "no changes" message */
        quickPeekNoChanges: string;

        /** Quick peek "View full history" link text */
        quickPeekViewFull: string;

        /** Restore confirmation dialog title */
        restoreConfirmTitle: string;

        /** Restore confirmation dialog message (supports {field} and {value} tokens) */
        restoreConfirmMessage: string;

        /** Message shown after successful restore */
        restoreSuccessMessage: string;

        /** Message shown when restore fails */
        restoreErrorMessage: string;

        /** Restore button tooltip/label */
        restoreButtonLabel: string;

        /** Label for "Cleared" filter toggle (field value set to empty) */
        clearedLabel: string;

        /** Tooltip shown briefly after copying a value */
        copySuccessLabel: string;

        /** Label for copy-all summary button on timeline entries */
        copySummaryLabel: string;

        /** Export CSV button label */
        exportButtonLabel: string;

        /** Status: environment auditing not enabled */
        statusOrgAuditDisabled: string;

        /** Status: table auditing not enabled */
        statusTableAuditDisabled: string;

        /** Status: no fields have auditing enabled */
        statusNoAuditedFields: string;

        /** Status: auditing active but no records yet */
        statusNoAuditRecords: string;
    };
}

/**
 * DEFAULT_CONFIG — used when no config web resource is specified,
 * or as the base that gets deep-merged with partial overrides.
 */
export const DEFAULT_CONFIG: IAuditConfig = {
    _version: "3.4.0",

    features: {
        allowRestore: true,
        allowCopy: true,
        allowExport: true,
    },

    audit: {
        defaultPageSize: 25,
        maxPages: 10,
        visibleOperations: [1, 2],
        dateFormat: "short",
    },

    tables: {
        "*": { mode: "audited", fields: [] },
    },

    quickPeek: {
        maxEntries: 8,
        showUserFilter: true,
    },

    display: {
        panelWidth: "80%",
        showChangedBy: true,
        showOperationType: true,
        valuePreviewLength: 200,
        iconTooltip: "View audit history",
        showFilters: true,
    },

    labels: {
        panelTitle: "Record Audit History",
        fieldPanelTitle: "Audit History",
        noRecordsMessage: "No audit history found.",
        loadMoreButton: "Load More",
        errorMessage: "Unable to load audit history.",
        createdLabel: "Created",
        updatedLabel: "Updated",
        deletedLabel: "Deleted",
        statusLabel: "Audit tracking",
        statusLoadingLabel: "Detecting audited fields...",
        quickPeekNoChanges: "No changes recorded",
        quickPeekViewFull: "View full history",
        restoreConfirmTitle: "Restore Value",
        restoreConfirmMessage: "Restore {field} to its previous value? This will overwrite the current value.",
        restoreSuccessMessage: "Value restored. Refresh the form to see the update.",
        restoreErrorMessage: "Failed to restore value.",
        restoreButtonLabel: "Restore",
        clearedLabel: "Cleared",
        copySuccessLabel: "Copied!",
        copySummaryLabel: "Copy summary",
        exportButtonLabel: "Export CSV",
        statusOrgAuditDisabled: "Auditing is not enabled for this environment. Go to Settings \u203a Auditing \u203a Global Audit Settings to enable it.",
        statusTableAuditDisabled: "Auditing is not enabled for this table. Enable it in table properties \u203a 'Audit changes to its data'.",
        statusNoAuditedFields: "No fields on this table have auditing enabled. Enable auditing on individual columns in column properties.",
        statusNoAuditRecords: "Audit tracking is active but no changes have been recorded yet for this record.",
    },
};
