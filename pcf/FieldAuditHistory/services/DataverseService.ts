// DataverseService.ts — Dataverse Web API calls for audit history

import { IAuditEntry, IAuditResponse, IFieldChange } from "../models/IAuditEntry";
import { IAuditConfig, ITableConfig, DEFAULT_CONFIG } from "../models/IConfig";

export class AuditPrivilegeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuditPrivilegeError";
    }
}

const OPERATION_LABELS: Record<number, string> = {
    1: "Created",
    2: "Updated",
    3: "Deleted",
    4: "Accessed",
};

const HEADERS: Record<string, string> = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Accept": "application/json",
    "Prefer": 'odata.include-annotations="*"',
};

/** Response from EntityDefinitions(LogicalName='xxx')?$select=EntitySetName */
interface EntityDefinitionResponse {
    EntitySetName: string;
}

/** Response from organizations query for audit setting */
interface OrgAuditSettingResponse {
    value: { isauditenabled?: boolean }[];
}

/** Response from EntityDefinitions for IsAuditEnabled check */
interface EntityAuditSettingResponse {
    IsAuditEnabled?: { Value: boolean };
}

/** Single attribute metadata entry from EntityDefinitions/.../Attributes */
interface AttributeMetadataEntry {
    LogicalName: string;
    /** BooleanManagedProperty — has a Value sub-property */
    IsAuditEnabled?: {
        Value: boolean;
    };
    /** Complex type with localized labels */
    DisplayName?: {
        UserLocalizedLabel?: {
            Label?: string;
        };
    };
}

/** Response from EntityDefinitions/.../Attributes query */
interface AttributeMetadataResponse {
    value: AttributeMetadataEntry[];
}

/** Wrapper for the audit API response */
interface AuditApiResponse {
    AuditDetailCollection?: AuditDetailCollectionResponse;
}

/** The AuditDetailCollection contains pagination info and the detail records */
interface AuditDetailCollectionResponse {
    MoreRecords?: boolean;
    PagingCookie?: string;
    TotalRecordCount?: number;
    AuditDetails?: AuditDetailRecord[];
}

/** A single audit detail — contains the audit metadata plus old/new values */
interface AuditDetailRecord {
    AuditRecord?: AuditRecord;
    /** The entity attribute values BEFORE the change */
    OldValue?: Record<string, unknown>;
    /** The entity attribute values AFTER the change */
    NewValue?: Record<string, unknown>;
}

/** Audit record metadata (who, when, what operation) */
interface AuditRecord {
    auditid?: string;
    operation?: number;
    createdon?: string;
    _userid_value?: string;
    /** Allow indexing for formatted value annotations */
    [key: string]: unknown;
}

export class DataverseService {
    /**
     * Pattern for valid Dataverse logical names.
     * Logical names are always lowercase alphanumeric with underscores,
     * starting with a letter, max 128 characters.
     */
    private static readonly SAFE_LOGICAL_NAME = /^[a-z][a-z0-9_]{0,128}$/;

    /**
     * Validates that a logical name is safe for URL interpolation.
     * Prevents OData injection via malformed entity/field names.
     */
    private static validateLogicalName(name: string, label: string): void {
        if (!DataverseService.SAFE_LOGICAL_NAME.test(name)) {
            throw new Error(`Invalid ${label}: ${name}`);
        }
    }

    /**
     * Validates and sanitizes parsed config values.
     * Strips values with wrong types to prevent runtime errors from
     * admin misconfiguration.
     */
    private static sanitizeConfig(raw: Record<string, unknown>): Partial<IAuditConfig> {
        const audit = raw.audit as Record<string, unknown> | undefined;
        if (audit) {
            if (typeof audit.defaultPageSize !== "undefined" && typeof audit.defaultPageSize !== "number") {
                delete audit.defaultPageSize;
            }
            if (typeof audit.maxPages !== "undefined" && typeof audit.maxPages !== "number") {
                delete audit.maxPages;
            }
            if (typeof audit.visibleOperations !== "undefined" && !Array.isArray(audit.visibleOperations)) {
                delete audit.visibleOperations;
            }
        }
        const display = raw.display as Record<string, unknown> | undefined;
        if (display) {
            if (typeof display.panelWidth !== "undefined" && typeof display.panelWidth !== "string") {
                delete display.panelWidth;
            }
            if (typeof display.valuePreviewLength !== "undefined" && typeof display.valuePreviewLength !== "number") {
                delete display.valuePreviewLength;
            }
        }
        return raw as Partial<IAuditConfig>;
    }

    /**
     * In-memory cache: entity logical name → entity set name.
     * Prevents repeated metadata lookups for the same entity.
     */
    private entitySetNameCache: Record<string, string> = {};

    /**
     * Attribute display name map: logical name → localized display name.
     * Populated as a side effect of getAuditEnabledAttributes().
     */
    private attributeDisplayNames: Record<string, string> = {};

    /**
     * Returns the display name map built during getAuditEnabledAttributes().
     * Call getAuditEnabledAttributes() first to populate this map.
     */
    getAttributeDisplayNames(): Record<string, string> {
        return this.attributeDisplayNames;
    }

    /**
     * Checks whether org-level auditing is enabled.
     * Queries the organization entity for isauditenabled.
     * Fails open (returns true) on any error to avoid false-positive messages.
     */
    async getOrgAuditEnabled(): Promise<boolean> {
        try {
            const response = await fetch(
                `/api/data/v9.2/organizations?$select=isauditenabled&$top=1`,
                { headers: HEADERS }
            );
            if (!response.ok) return true;
            const data = (await response.json()) as OrgAuditSettingResponse;
            return data.value?.[0]?.isauditenabled !== false;
        } catch {
            return true;
        }
    }

    /**
     * Checks whether table-level auditing is enabled for a specific entity.
     * Queries EntityDefinitions for the IsAuditEnabled managed property.
     * Fails open (returns true) on any error.
     */
    async getEntityAuditEnabled(entityLogicalName: string): Promise<boolean> {
        try {
            DataverseService.validateLogicalName(entityLogicalName, "entity logical name");
            const response = await fetch(
                `/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=IsAuditEnabled`,
                { headers: HEADERS }
            );
            if (!response.ok) return true;
            const data = (await response.json()) as EntityAuditSettingResponse;
            return data.IsAuditEnabled?.Value !== false;
        } catch {
            return true;
        }
    }

    /**
     * Deep-merges a partial config override into the defaults.
     * Each known section is merged individually so partial overrides
     * preserve sibling keys (e.g., overriding audit.defaultPageSize
     * doesn't lose audit.maxPages).
     */
    static deepMerge(
        target: IAuditConfig,
        source: Partial<IAuditConfig>
    ): IAuditConfig {
        return {
            _version: source._version ?? target._version,

            features: {
                ...target.features,
                ...(source.features ?? {}),
            },

            audit: {
                ...target.audit,
                ...(source.audit ?? {}),
            },

            tables: {
                ...target.tables,
                ...(source.tables ?? {}),
            },

            quickPeek: {
                ...target.quickPeek,
                ...(source.quickPeek ?? {}),
            },

            display: {
                ...target.display,
                ...(source.display ?? {}),
            },

            labels: {
                ...target.labels,
                ...(source.labels ?? {}),
            },
        };
    }

    /**
     * Resolves the field configuration for a specific table.
     * Looks up the table by logical name, falls back to "*" wildcard,
     * then falls back to mode:"audited" default.
     */
    static resolveTableConfig(
        config: IAuditConfig,
        entityLogicalName: string
    ): ITableConfig {
        return (
            config.tables[entityLogicalName] ??
            config.tables["*"] ??
            { mode: "audited", fields: [] }
        );
    }

    /**
     * Resolves an entity logical name to its entity set name.
     * Example: "account" → "accounts", "contact" → "contacts".
     *
     * The entity set name is required for constructing audit API URLs
     * because the @odata.id reference uses it (e.g., "accounts(guid)").
     *
     * Results are cached in-memory for the lifetime of the service instance.
     *
     * @param entityLogicalName - The entity logical name (e.g., "account")
     * @returns The entity set name (e.g., "accounts")
     * @throws Error if the metadata lookup fails
     */
    async getEntitySetName(entityLogicalName: string): Promise<string> {
        DataverseService.validateLogicalName(entityLogicalName, "entity logical name");

        // Return cached value if available
        if (this.entitySetNameCache[entityLogicalName]) {
            return this.entitySetNameCache[entityLogicalName];
        }

        const response = await fetch(
            `/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=EntitySetName`,
            { headers: HEADERS }
        );

        if (!response.ok) {
            throw new Error(
                `Failed to get entity metadata for '${entityLogicalName}': ${response.status}`
            );
        }

        const data = (await response.json()) as EntityDefinitionResponse;
        this.entitySetNameCache[entityLogicalName] = data.EntitySetName;
        return data.EntitySetName;
    }

    /**
     * Queries entity metadata to discover which attributes have auditing enabled.
     *
     * Calls: GET /api/data/v9.2/EntityDefinitions(LogicalName='xxx')/Attributes
     *          ?$select=LogicalName,IsAuditEnabled
     *
     * Then filters client-side for IsAuditEnabled.Value === true.
     * We fetch all attributes and filter client-side because the OData filter
     * on BooleanManagedProperty sub-properties is not reliably supported
     * across all Dataverse versions.
     *
     * @param entityLogicalName - The entity logical name (e.g., "account")
     * @returns Array of field logical names that have auditing enabled,
     *          or null if the metadata query fails (caller should show
     *          icons on ALL fields as a fallback).
     */
    async getAuditEnabledAttributes(
        entityLogicalName: string
    ): Promise<string[] | null> {
        try {
            DataverseService.validateLogicalName(entityLogicalName, "entity logical name");

            const url =
                `/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
                `/Attributes?$select=LogicalName,IsAuditEnabled,DisplayName`;

            const response = await fetch(url, { headers: HEADERS });

            if (!response.ok) {
                // If metadata query fails, return null = show icons on all fields
                return null;
            }

            const data = (await response.json()) as AttributeMetadataResponse;

            // Build display name map as a side effect (avoids an extra API call)
            this.attributeDisplayNames = {};
            for (const attr of data.value) {
                const label = attr.DisplayName?.UserLocalizedLabel?.Label;
                if (label) {
                    this.attributeDisplayNames[attr.LogicalName] = label;
                }
            }

            // Filter for attributes where IsAuditEnabled.Value is true
            return data.value
                .filter((attr) => attr.IsAuditEnabled?.Value === true)
                .map((attr) => attr.LogicalName);
        } catch {
            // On any error, return null = show icons on all fields (graceful degradation)
            return null;
        }
    }

    /**
     * Retrieves audit change history for a SINGLE FIELD on a record.
     *
     * Calls the Dataverse RetrieveAttributeChangeHistory function:
     *   GET /api/data/v9.2/RetrieveAttributeChangeHistory(
     *     Target=@target,
     *     AttributeLogicalName=@attr,
     *     PagingInfo=@paging
     *   )?@target=...&@attr=...&@paging=...
     *
     * @param entitySetName - Entity set name (e.g., "accounts")
     * @param recordId - The record GUID (with or without braces)
     * @param attributeLogicalName - Field logical name (e.g., "name")
     * @param pageNumber - Page number for pagination (1-based)
     * @param pageSize - Number of entries per page
     * @returns Parsed audit response with entries, pagination info
     */
    async getFieldAuditHistory(
        entitySetName: string,
        recordId: string,
        attributeLogicalName: string,
        pageNumber = 1,
        pageSize = 25
    ): Promise<IAuditResponse> {
        DataverseService.validateLogicalName(attributeLogicalName, "attribute logical name");

        // Strip braces from GUID if present (e.g., "{abc-123}" → "abc-123")
        const cleanId = recordId.replace(/[{}]/g, "");

        // Build the @target parameter — an OData entity reference
        const targetParam = encodeURIComponent(
            JSON.stringify({ "@odata.id": `${entitySetName}(${cleanId})` })
        );

        // Build the @paging parameter — pagination settings
        const pagingParam = encodeURIComponent(
            JSON.stringify({
                PageNumber: pageNumber,
                Count: pageSize,
                ReturnTotalRecordCount: true,
            })
        );

        const url =
            `/api/data/v9.2/RetrieveAttributeChangeHistory(` +
            `Target=@target,` +
            `AttributeLogicalName=@attr,` +
            `PagingInfo=@paging)?` +
            `@target=${targetParam}` +
            `&@attr='${attributeLogicalName}'` +
            `&@paging=${pagingParam}`;

        return this.executeAuditRequest(url);
    }

    /**
     * Retrieves audit change history for an ENTIRE RECORD (all fields).
     *
     * Calls the Dataverse RetrieveRecordChangeHistory function:
     *   GET /api/data/v9.2/RetrieveRecordChangeHistory(
     *     Target=@target,
     *     PagingInfo=@paging
     *   )?@target=...&@paging=...
     *
     * @param entitySetName - Entity set name (e.g., "accounts")
     * @param recordId - The record GUID (with or without braces)
     * @param pageNumber - Page number for pagination (1-based)
     * @param pageSize - Number of entries per page
     * @returns Parsed audit response with entries, pagination info
     */
    async getRecordAuditHistory(
        entitySetName: string,
        recordId: string,
        pageNumber = 1,
        pageSize = 25
    ): Promise<IAuditResponse> {
        const cleanId = recordId.replace(/[{}]/g, "");

        const targetParam = encodeURIComponent(
            JSON.stringify({ "@odata.id": `${entitySetName}(${cleanId})` })
        );
        const pagingParam = encodeURIComponent(
            JSON.stringify({
                PageNumber: pageNumber,
                Count: pageSize,
                ReturnTotalRecordCount: true,
            })
        );

        const url =
            `/api/data/v9.2/RetrieveRecordChangeHistory(` +
            `Target=@target,` +
            `PagingInfo=@paging)?` +
            `@target=${targetParam}` +
            `&@paging=${pagingParam}`;

        return this.executeAuditRequest(url);
    }

    /**
     * Normalizes a config web resource logical name for lookup.
     * Trims whitespace and strips a trailing .js / .json extension.
     */
    static normalizeConfigWebResourceName(name: string): string {
        const trimmed = (name ?? "").trim();
        if (!trimmed) {
            return "";
        }
        return trimmed.replace(/\.(js|json)$/i, "");
    }

    /**
     * Strips // line comments and block comments so braces inside
     * documentation comments cannot hijack JSON extraction.
     * Not a full JS parser — config values should not rely on // inside strings.
     */
    static stripJsComments(text: string): string {
        return text
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
    }

    /**
     * Finds the JSON object substring: prefers `var config = {` / `config = {`,
     * then falls back to the first `{`. Uses brace-depth matching so trailing
     * junk after the object does not get included.
     */
    static extractConfigJsonObject(text: string): string | null {
        const cleaned = DataverseService.stripJsComments(text);
        const assignMatch = /(?:var\s+)?config\s*=\s*\{/i.exec(cleaned);
        const startIdx = assignMatch
            ? assignMatch.index + assignMatch[0].length - 1
            : cleaned.indexOf("{");

        if (startIdx === -1) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = startIdx; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (inString) {
                if (escape) {
                    escape = false;
                } else if (ch === "\\") {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === "{") {
                depth++;
            } else if (ch === "}") {
                depth--;
                if (depth === 0) {
                    return cleaned.substring(startIdx, i + 1);
                }
            }
        }
        return null;
    }

    /**
     * Extracts and JSON.parses the config object from web resource text.
     * Accepts pure JSON or a JS wrapper like: var config = { ... };
     * Strips comments first so example braces in headers do not break parsing.
     * Never evaluates JavaScript (security: config is data only).
     */
    static parseConfigText(text: string): Record<string, unknown> | null {
        const jsonStr = DataverseService.extractConfigJsonObject(text);

        if (!jsonStr) {
            console.warn(
                "[FieldAuditHistory] Config web resource has no JSON object; using defaults."
            );
            return null;
        }

        try {
            return JSON.parse(jsonStr) as Record<string, unknown>;
        } catch (err) {
            const preview =
                jsonStr.length > 100 ? `${jsonStr.slice(0, 100)}…` : jsonStr;
            console.warn(
                "[FieldAuditHistory] Config JSON parse failed; using defaults. " +
                    "Keys must be double-quoted (valid JSON), not bare JavaScript object keys. " +
                    `Preview: ${preview}`,
                err
            );
            return null;
        }
    }

    /**
     * UTF-8-safe base64 decode for WebAPI webresource.content.
     * Uses TextDecoder when available; falls back for older runtimes / Jest.
     */
    static decodeBase64Utf8(base64: string): string {
        const binary = atob(base64);
        if (typeof TextDecoder !== "undefined") {
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder("utf-8").decode(bytes);
        }
        // Percent-encode each byte then decode as UTF-8
        try {
            let escaped = "";
            for (let i = 0; i < binary.length; i++) {
                escaped +=
                    "%" + binary.charCodeAt(i).toString(16).padStart(2, "0");
            }
            return decodeURIComponent(escaped);
        } catch {
            return binary;
        }
    }

    /**
     * Primary load path: same-origin /WebResources/{name} (plain text).
     * Works for form users without prvRead on the webresource table.
     */
    private async tryLoadConfigViaWebResourceUrl(
        name: string
    ): Promise<string | null> {
        try {
            const res = await fetch(
                `/WebResources/${encodeURIComponent(name)}`,
                { credentials: "same-origin", cache: "no-store" }
            );
            if (!res.ok) {
                console.warn(
                    `[FieldAuditHistory] /WebResources/${name} returned HTTP ${res.status}; trying WebAPI fallback.`
                );
                return null;
            }
            return await res.text();
        } catch (err) {
            console.warn(
                `[FieldAuditHistory] /WebResources/${name} fetch failed; trying WebAPI fallback.`,
                err
            );
            return null;
        }
    }

    /**
     * Fallback load path: WebAPI query on webresource + base64 content.
     */
    private async tryLoadConfigViaWebApi(
        webAPI: ComponentFramework.WebApi,
        name: string
    ): Promise<string | null> {
        try {
            const result = await webAPI.retrieveMultipleRecords(
                "webresource",
                `?$filter=name eq '${name.replace(/'/g, "''")}'&$select=content`
            );

            if (result.entities.length === 0) {
                return null;
            }

            const entity = result.entities[0] as { content?: unknown };
            const content = entity.content;
            if (typeof content !== "string" || content.length === 0) {
                return null;
            }

            return DataverseService.decodeBase64Utf8(content);
        } catch (err) {
            console.warn(
                `[FieldAuditHistory] WebAPI load of web resource '${name}' failed.`,
                err
            );
            return null;
        }
    }

    /**
     * Loads custom configuration from a Dataverse web resource.
     *
     * The web resource may contain pure JSON or a JS-style wrapper:
     *   var config = { "audit": { "defaultPageSize": 50 }, "labels": { ... } };
     *
     * Content inside the braces must be valid JSON (double-quoted keys).
     * Load order: /WebResources/{name} fetch first, then WebAPI base64 content.
     * Partial overrides are deep-merged with DEFAULT_CONFIG.
     *
     * @param webAPI - PCF WebApi interface for querying web resources
     * @param configName - Logical name of the web resource (e.g., "vp365_AuditHistoryConfig")
     * @returns Merged config (defaults + overrides)
     */
    async loadConfig(
        webAPI: ComponentFramework.WebApi,
        configName: string
    ): Promise<IAuditConfig> {
        const name = DataverseService.normalizeConfigWebResourceName(configName);
        if (!name) {
            console.warn(
                "[FieldAuditHistory] Config web resource name is empty; using defaults."
            );
            return DEFAULT_CONFIG;
        }

        try {
            let text = await this.tryLoadConfigViaWebResourceUrl(name);
            text ??= await this.tryLoadConfigViaWebApi(webAPI, name);

            if (text == null) {
                console.warn(
                    `[FieldAuditHistory] Config web resource '${name}' not found; using defaults.`
                );
                return DEFAULT_CONFIG;
            }

            const raw = DataverseService.parseConfigText(text);
            if (!raw) {
                return DEFAULT_CONFIG;
            }

            const parsed = DataverseService.sanitizeConfig(raw);
            return DataverseService.deepMerge(DEFAULT_CONFIG, parsed);
        } catch (err) {
            console.warn(
                "[FieldAuditHistory] Failed to load config; using defaults.",
                err
            );
            return DEFAULT_CONFIG;
        }
    }

    /**
     * Restores a field to its previous value by PATCHing the record.
     *
     * Handles three field types:
     * - **Lookup**: Uses @odata.bind syntax with entity set name resolution
     * - **Standard**: Direct value assignment (strings, numbers, booleans, dates)
     * - **Null restore**: Clears the field (null for standard, null bind for lookup)
     *
     * @param webAPI - PCF WebApi interface for updateRecord
     * @param entityLogicalName - The entity logical name (e.g., "contact")
     * @param recordId - The record GUID
     * @param change - The field change containing raw values and type info
     * @throws Error if raw value is unavailable, lookup target is unknown, or update fails
     */
    async restoreFieldValue(
        webAPI: ComponentFramework.WebApi,
        entityLogicalName: string,
        recordId: string,
        change: IFieldChange,
    ): Promise<void> {
        if (change.rawOldValue === undefined) {
            throw new Error("Cannot restore: raw value not available for this audit entry.");
        }

        const cleanId = recordId.replace(/[{}]/g, "");
        const data: Record<string, unknown> = {};

        if (change.fieldType === "lookup") {
            // Lookup field: use @odata.bind syntax
            const navPropName = change.displayName;
            DataverseService.validateLogicalName(navPropName, "navigation property");

            if (change.rawOldValue === null) {
                // Clear the lookup
                data[`${navPropName}@odata.bind`] = null;
            } else {
                if (!change.lookupTarget) {
                    throw new Error("Cannot restore lookup: target entity is unknown.");
                }
                const entitySetName = await this.getEntitySetName(change.lookupTarget);
                const targetId = `${change.rawOldValue as string}`.replace(/[{}]/g, "");
                data[`${navPropName}@odata.bind`] = `/${entitySetName}(${targetId})`;
            }
        } else {
            // Standard field: direct value assignment
            data[change.fieldName] = change.rawOldValue;
        }

        try {
            await webAPI.updateRecord(entityLogicalName, cleanId, data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("403") || msg.includes("privilege") || msg.includes("permission")) {
                throw new Error("You don't have permission to update this record.");
            }
            throw new Error(`Restore failed: ${msg}`);
        }
    }

    /**
     * Executes an audit API request and parses the response.
     * Handles HTTP error codes with specific error messages:
     * - 403 → AuditPrivilegeError (user lacks audit read permissions)
     * - Other → generic Error with status code
     */
    private async executeAuditRequest(url: string): Promise<IAuditResponse> {
        const response = await fetch(url, { headers: HEADERS });

        if (!response.ok) {
            if (response.status === 403) {
                throw new AuditPrivilegeError(
                    "You don't have permission to view audit history. " +
                    "Contact your administrator to grant prvReadRecordAuditHistory " +
                    "and prvReadAuditSummary privileges."
                );
            }
            throw new Error(
                `Audit API error: ${response.status} ${response.statusText}`
            );
        }

        const raw = (await response.json()) as AuditApiResponse;
        return this.parseAuditResponse(raw);
    }

    /**
     * Parses the raw Dataverse audit API response into our IAuditResponse shape.
     * Handles missing/null collection gracefully.
     */
    private parseAuditResponse(raw: AuditApiResponse): IAuditResponse {
        const collection = raw.AuditDetailCollection;

        if (!collection) {
            return {
                entries: [],
                moreRecords: false,
                pagingCookie: null,
                totalRecordCount: 0,
            };
        }

        const details = collection.AuditDetails ?? [];

        return {
            moreRecords: collection.MoreRecords ?? false,
            pagingCookie: collection.PagingCookie ?? null,
            totalRecordCount: collection.TotalRecordCount ?? 0,
            entries: details.map((detail) => this.parseAuditDetail(detail)),
        };
    }

    /**
     * Converts a single AuditDetailRecord into our IAuditEntry interface.
     * Extracts: audit ID, operation type, timestamp, user info, and field changes.
     */
    private parseAuditDetail(detail: AuditDetailRecord): IAuditEntry {
        const audit = detail.AuditRecord ?? {};
        const oldValue = detail.OldValue ?? {};
        const newValue = detail.NewValue ?? {};

        const changedFields = this.extractChangedFields(oldValue, newValue);

        const operation = audit.operation ?? 0;

        // The user display name is in an OData annotation on the _userid_value field
        const userIdKey = "_userid_value@OData.Community.Display.V1.FormattedValue";

        return {
            auditId: audit.auditid ?? "",
            operation,
            operationLabel: OPERATION_LABELS[operation] ?? "Unknown",
            changedOn: new Date(audit.createdon ?? ""),
            changedById: audit._userid_value ?? "",
            changedByName: (audit[userIdKey] as string | undefined) ?? "Unknown",
            changedFields,
        };
    }

    /**
     * Compares old and new value objects to extract individual field changes.
     *
     * Skips:
     * - OData metadata keys (starting with "@odata")
     * - The "id" key (record identifier, not a user field)
     * - Annotation keys (containing "@") — these are OData formatted values
     *
     * For lookup fields (prefixed with "_" and suffixed with "_value"),
     * extracts the base field name for display.
     *
     * Prefers OData formatted values (display names, labels) over raw values
     * (GUIDs, integers) when available.
     */
    private extractChangedFields(
        oldValue: Record<string, unknown>,
        newValue: Record<string, unknown>
    ): IFieldChange[] {
        const changes: IFieldChange[] = [];
        const processedKeys = new Set<string>();

        // Combine all keys from both old and new value objects
        const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

        for (const key of allKeys) {
            // Skip OData metadata and annotation keys
            if (key.startsWith("@odata")) continue;
            if (key === "id") continue;
            if (key.includes("@")) continue;

            // Detect lookup fields: "_primarycontactid_value" → "primarycontactid"
            const isLookup = key.startsWith("_") && key.endsWith("_value");
            const baseKey = isLookup ? key.slice(1, -6) : key;

            // Avoid processing the same field twice
            if (processedKeys.has(baseKey)) continue;
            processedKeys.add(baseKey);

            // Capture raw API values for restore capability
            const rawOld = oldValue[key] ?? null;
            const rawNew = newValue[key] ?? null;

            // Resolve lookup target entity from OData annotation
            const lookupTargetKey = `${key}@Microsoft.Dynamics.CRM.lookuplogicalname`;
            const lookupTarget = isLookup
                ? (oldValue[lookupTargetKey] as string | undefined)
                  ?? (newValue[lookupTargetKey] as string | undefined)
                : undefined;

            const oldFormatted = this.getFormattedValue(key, oldValue);
            const newFormatted = this.getFormattedValue(key, newValue);

            changes.push({
                fieldName: key,
                displayName: baseKey,
                oldValue: oldFormatted,
                newValue: newFormatted,
                rawOldValue: rawOld,
                rawNewValue: rawNew,
                lookupTarget,
                fieldType: isLookup ? "lookup" : "standard",
            });
        }

        return changes;
    }

    /**
     * Gets the best human-readable value for a field.
     *
     * Priority:
     * 1. OData formatted value annotation (e.g., lookup display name, option set label)
     * 2. Raw value (string or JSON-stringified)
     * 3. null if the field doesn't exist in the record
     */
    private getFormattedValue(
        key: string,
        record: Record<string, unknown>
    ): string | null {
        // Check for OData formatted value annotation first
        const formattedKey = `${key}@OData.Community.Display.V1.FormattedValue`;
        const formattedVal = record[formattedKey];
        if (formattedVal !== undefined) {
            return typeof formattedVal === "string"
                ? formattedVal
                : JSON.stringify(formattedVal);
        }

        // Fall back to raw value
        const rawVal = record[key];
        if (rawVal !== undefined && rawVal !== null) {
            return typeof rawVal === "string"
                ? rawVal
                : JSON.stringify(rawVal);
        }

        return null;
    }
}
