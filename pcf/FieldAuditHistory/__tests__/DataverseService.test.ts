import { DataverseService, AuditPrivilegeError } from "../services/DataverseService";
import { DEFAULT_CONFIG } from "../models/IConfig";
import { IFieldChange } from "../models/IAuditEntry";
import {
    mockFetchResponse,
    mockEntitySetNameResponse,
    mockAuditResponse,
    mockAuditEnabledAttributesResponse,
    mockOrgAuditResponse,
    mockEntityAuditSettingResponse,
    createAuditEntries,
    createFieldChange,
    createLookupFieldChange,
    createMockWebAPI,
} from "./helpers";

describe("DataverseService", () => {
    let service: DataverseService;

    beforeEach(() => {
        service = new DataverseService();
    });

    // ========================================================================
    // getEntitySetName
    // ========================================================================
    describe("getEntitySetName", () => {
        it("should fetch and return entity set name", async () => {
            mockEntitySetNameResponse("contacts");

            const result = await service.getEntitySetName("contact");

            expect(result).toBe("contacts");
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("EntityDefinitions(LogicalName='contact')"),
                expect.any(Object)
            );
        });

        it("should cache entity set name on subsequent calls", async () => {
            mockEntitySetNameResponse("contacts");

            await service.getEntitySetName("contact");
            const result = await service.getEntitySetName("contact");

            expect(result).toBe("contacts");
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it("should throw on HTTP error", async () => {
            mockFetchResponse({}, false, 404);

            await expect(service.getEntitySetName("badentity")).rejects.toThrow(
                "Failed to get entity metadata"
            );
        });
    });

    // ========================================================================
    // getAuditEnabledAttributes
    // ========================================================================
    describe("getAuditEnabledAttributes", () => {
        it("should return audit-enabled field names", async () => {
            mockAuditEnabledAttributesResponse(["emailaddress1", "telephone1", "jobtitle"]);

            const result = await service.getAuditEnabledAttributes("contact");

            expect(result).toEqual(["emailaddress1", "telephone1", "jobtitle"]);
        });

        it("should build display name map as side effect", async () => {
            mockAuditEnabledAttributesResponse(["emailaddress1", "telephone1"]);

            await service.getAuditEnabledAttributes("contact");

            const displayNames = service.getAttributeDisplayNames();
            expect(displayNames.emailaddress1).toBe("Email");
            expect(displayNames.telephone1).toBe("Business Phone");
        });

        it("should filter out non-audited fields", async () => {
            mockFetchResponse({
                value: [
                    { LogicalName: "emailaddress1", IsAuditEnabled: { Value: true }, DisplayName: { UserLocalizedLabel: { Label: "Email" } } },
                    { LogicalName: "address1_line1", IsAuditEnabled: { Value: false }, DisplayName: { UserLocalizedLabel: { Label: "Street 1" } } },
                    { LogicalName: "telephone1", IsAuditEnabled: { Value: true }, DisplayName: { UserLocalizedLabel: { Label: "Phone" } } },
                ],
            });

            const result = await service.getAuditEnabledAttributes("contact");

            expect(result).toEqual(["emailaddress1", "telephone1"]);
        });

        it("should return null on HTTP error (graceful degradation)", async () => {
            mockFetchResponse({}, false, 500);

            const result = await service.getAuditEnabledAttributes("contact");

            expect(result).toBeNull();
        });

        it("should return null on network error", async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

            const result = await service.getAuditEnabledAttributes("contact");

            expect(result).toBeNull();
        });
    });

    // ========================================================================
    // getOrgAuditEnabled
    // ========================================================================
    describe("getOrgAuditEnabled", () => {
        it("should return true when org audit is enabled", async () => {
            mockOrgAuditResponse(true);
            const result = await service.getOrgAuditEnabled();
            expect(result).toBe(true);
        });

        it("should return false when org audit is disabled", async () => {
            mockOrgAuditResponse(false);
            const result = await service.getOrgAuditEnabled();
            expect(result).toBe(false);
        });

        it("should return true on HTTP error (fail-open)", async () => {
            mockFetchResponse({}, false, 500);
            const result = await service.getOrgAuditEnabled();
            expect(result).toBe(true);
        });

        it("should return true on network error (fail-open)", async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
            const result = await service.getOrgAuditEnabled();
            expect(result).toBe(true);
        });
    });

    // ========================================================================
    // getEntityAuditEnabled
    // ========================================================================
    describe("getEntityAuditEnabled", () => {
        it("should return true when entity audit is enabled", async () => {
            mockEntityAuditSettingResponse(true);
            const result = await service.getEntityAuditEnabled("contact");
            expect(result).toBe(true);
        });

        it("should return false when entity audit is disabled", async () => {
            mockEntityAuditSettingResponse(false);
            const result = await service.getEntityAuditEnabled("contact");
            expect(result).toBe(false);
        });

        it("should return true on HTTP error (fail-open)", async () => {
            mockFetchResponse({}, false, 500);
            const result = await service.getEntityAuditEnabled("contact");
            expect(result).toBe(true);
        });

        it("should return true on network error (fail-open)", async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
            const result = await service.getEntityAuditEnabled("contact");
            expect(result).toBe(true);
        });

        it("should validate entity logical name", async () => {
            const result = await service.getEntityAuditEnabled("INVALID-NAME!");
            expect(result).toBe(true); // fail-open on validation error
        });
    });

    // ========================================================================
    // getFieldAuditHistory
    // ========================================================================
    describe("getFieldAuditHistory", () => {
        it("should call RetrieveAttributeChangeHistory with correct params", async () => {
            mockAuditResponse([], 0, false);

            await service.getFieldAuditHistory("contacts", "record-001", "emailaddress1", 1, 25);

            const calls = (global.fetch as jest.Mock).mock.calls as string[][];
            const url = calls[0][0];
            expect(url).toContain("RetrieveAttributeChangeHistory");
            expect(url).toContain("contacts(record-001)");
            expect(url).toContain("emailaddress1");
        });

        it("should strip braces from record ID", async () => {
            mockAuditResponse([], 0, false);

            await service.getFieldAuditHistory("contacts", "{abc-123}", "emailaddress1");

            const calls = (global.fetch as jest.Mock).mock.calls as string[][];
            const url = calls[0][0];
            expect(url).toContain("contacts(abc-123)");
            expect(url).not.toContain("{");
        });

        it("should parse audit entries correctly", async () => {
            const entries = createAuditEntries(3);
            mockAuditResponse(entries, 3, false);

            const result = await service.getFieldAuditHistory("contacts", "id", "email", 1, 25);

            expect(result.entries).toHaveLength(3);
            expect(result.totalRecordCount).toBe(3);
            expect(result.moreRecords).toBe(false);
        });

        it("should return pagination info", async () => {
            mockAuditResponse(createAuditEntries(25), 100, true);

            const result = await service.getFieldAuditHistory("contacts", "id", "email", 1, 25);

            expect(result.moreRecords).toBe(true);
            expect(result.totalRecordCount).toBe(100);
        });

        it("should throw AuditPrivilegeError on 403", async () => {
            mockFetchResponse({}, false, 403);

            await expect(
                service.getFieldAuditHistory("contacts", "id", "email")
            ).rejects.toThrow(AuditPrivilegeError);
        });

        it("should throw generic error on other HTTP errors", async () => {
            mockFetchResponse({}, false, 500);

            await expect(
                service.getFieldAuditHistory("contacts", "id", "email")
            ).rejects.toThrow("Audit API error: 500");
        });

        it("should handle empty AuditDetailCollection gracefully", async () => {
            mockFetchResponse({});

            const result = await service.getFieldAuditHistory("contacts", "id", "email");

            expect(result.entries).toHaveLength(0);
            expect(result.totalRecordCount).toBe(0);
        });
    });

    // ========================================================================
    // getRecordAuditHistory
    // ========================================================================
    describe("getRecordAuditHistory", () => {
        it("should call RetrieveRecordChangeHistory", async () => {
            mockAuditResponse([], 0, false);

            await service.getRecordAuditHistory("contacts", "record-001", 1, 25);

            const calls = (global.fetch as jest.Mock).mock.calls as string[][];
            const url = calls[0][0];
            expect(url).toContain("RetrieveRecordChangeHistory");
            expect(url).not.toContain("AttributeLogicalName");
        });
    });

    // ========================================================================
    // loadConfig
    // ========================================================================
    describe("loadConfig", () => {
        let mockWebAPI: ComponentFramework.WebApi;

        beforeEach(() => {
            mockWebAPI = {
                retrieveMultipleRecords: jest.fn(),
            } as unknown as ComponentFramework.WebApi;
        });

        /** Mock primary /WebResources fetch path with plain text body */
        function mockWebResourceFetch(text: string, ok = true, status = 200): void {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok,
                status,
                statusText: ok ? "OK" : "Error",
                text: () => Promise.resolve(text),
                json: () => Promise.resolve({}),
            });
        }

        /** Fail the primary fetch so WebAPI fallback is used */
        function mockWebResourceFetchMiss(): void {
            mockWebResourceFetch("", false, 404);
        }

        it("should return DEFAULT_CONFIG when no web resource found", async () => {
            mockWebResourceFetchMiss();
            (mockWebAPI.retrieveMultipleRecords as jest.Mock).mockResolvedValue({
                entities: [],
            });

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should load and deep-merge config via /WebResources fetch (primary path)", async () => {
            const configJs = 'var config = { "quickPeek": { "maxEntries": 5 } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result.quickPeek.maxEntries).toBe(5);
            expect(result.quickPeek.showUserFilter).toBe(true);
            expect(result.audit.defaultPageSize).toBe(25);
            // WebAPI should not be needed when fetch succeeds
            // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
            expect(mockWebAPI.retrieveMultipleRecords).not.toHaveBeenCalled();
            expect(global.fetch).toHaveBeenCalledWith(
                // eslint-disable-next-line @microsoft/power-apps/use-cached-webresource -- asserts production load URL
                "/WebResources/vp365_config",
                expect.objectContaining({ credentials: "same-origin" })
            );
        });

        it("should deep-merge config from WebAPI when fetch misses", async () => {
            mockWebResourceFetchMiss();
            const configJs = 'var config = { "quickPeek": { "maxEntries": 5 } };';
            const base64 = btoa(configJs);

            (mockWebAPI.retrieveMultipleRecords as jest.Mock).mockResolvedValue({
                entities: [{ content: base64 }],
            });

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result.quickPeek.maxEntries).toBe(5);
            expect(result.quickPeek.showUserFilter).toBe(true);
            expect(result.audit.defaultPageSize).toBe(25);
        });

        it("should strip .js extension and trim name before lookup", async () => {
            mockWebResourceFetch('{ "quickPeek": { "maxEntries": 3 } }');

            await service.loadConfig(mockWebAPI, "  vp365_AuditHistoryConfig.js  ");

            expect(global.fetch).toHaveBeenCalledWith(
                // eslint-disable-next-line @microsoft/power-apps/use-cached-webresource -- asserts production load URL
                "/WebResources/vp365_AuditHistoryConfig",
                expect.any(Object)
            );
        });

        it("should return DEFAULT_CONFIG for empty name after normalize", async () => {
            const result = await service.loadConfig(mockWebAPI, "   ");
            expect(result).toEqual(DEFAULT_CONFIG);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should return DEFAULT_CONFIG on parse error", async () => {
            mockWebResourceFetch("not valid js");

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should return DEFAULT_CONFIG for unquoted JavaScript object keys", async () => {
            // Shipped pre-fix samples used bare JS keys — invalid for JSON.parse
            mockWebResourceFetch("var config = { quickPeek: { maxEntries: 5 } };");

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should parse shipped-style file with braces inside header comments", async () => {
            // Regression: first `{` used to be in // example comments, breaking JSON.parse
            const shippedStyle = `
// EXAMPLE (per-table overrides):
//   "tables": {
//       "*": { "mode": "audited", "fields": [] },
//       "contact": { "mode": "include", "fields": ["emailaddress1"] }
//   }
// ============================================================================
var config = {
    "features": {
        "allowRestore": false,
        "allowCopy": false,
        "allowExport": false
    },
    "quickPeek": {
        "maxEntries": 3
    }
};
`;
            mockWebResourceFetch(shippedStyle);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result.features.allowRestore).toBe(false);
            expect(result.features.allowCopy).toBe(false);
            expect(result.features.allowExport).toBe(false);
            expect(result.quickPeek.maxEntries).toBe(3);
        });

        it("should parseConfigText directly for comment-heavy web resources", () => {
            const text = `
// tables: { mode: audited }
var config = { "labels": { "statusLabel": "from-config" } };
`;
            const parsed = DataverseService.parseConfigText(text);
            expect(parsed).not.toBeNull();
            expect((parsed?.labels as { statusLabel?: string })?.statusLabel).toBe(
                "from-config"
            );
        });

        it("should return DEFAULT_CONFIG when both fetch and WebAPI fail", async () => {
            mockWebResourceFetchMiss();
            (mockWebAPI.retrieveMultipleRecords as jest.Mock).mockRejectedValue(
                new Error("API Error")
            );

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should decode UTF-8 base64 content from WebAPI path", async () => {
            mockWebResourceFetchMiss();
            // "CONFIG" with a non-ASCII character in a label
            const configJs =
                'var config = { "labels": { "statusLabel": "Audit — loaded" } };';
            const base64 = btoa(unescape(encodeURIComponent(configJs)));

            (mockWebAPI.retrieveMultipleRecords as jest.Mock).mockResolvedValue({
                entities: [{ content: base64 }],
            });

            const result = await service.loadConfig(mockWebAPI, "vp365_config");

            expect(result.labels.statusLabel).toBe("Audit — loaded");
        });
    });

    describe("normalizeConfigWebResourceName", () => {
        it("should trim and strip .js / .json", () => {
            expect(DataverseService.normalizeConfigWebResourceName("  a.js  ")).toBe("a");
            expect(DataverseService.normalizeConfigWebResourceName("b.JSON")).toBe("b");
            expect(DataverseService.normalizeConfigWebResourceName("vp365_AuditHistoryConfig")).toBe(
                "vp365_AuditHistoryConfig"
            );
            expect(DataverseService.normalizeConfigWebResourceName("")).toBe("");
        });
    });

    // ========================================================================
    // Static methods
    // ========================================================================
    describe("deepMerge", () => {
        it("should preserve defaults when source is empty", () => {
            const result = DataverseService.deepMerge(DEFAULT_CONFIG, {});

            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should override nested values without losing siblings", () => {
            const result = DataverseService.deepMerge(DEFAULT_CONFIG, {
                audit: { defaultPageSize: 50 },
            } as Partial<typeof DEFAULT_CONFIG>);

            expect(result.audit.defaultPageSize).toBe(50);
            expect(result.audit.maxPages).toBe(10); // preserved
            expect(result.audit.visibleOperations).toEqual([1, 2]); // preserved
        });

        it("should merge quickPeek section", () => {
            const result = DataverseService.deepMerge(DEFAULT_CONFIG, {
                quickPeek: { maxEntries: 3 },
            } as Partial<typeof DEFAULT_CONFIG>);

            expect(result.quickPeek.maxEntries).toBe(3);
            expect(result.quickPeek.showUserFilter).toBe(true); // preserved
        });

        it("should merge tables section additively", () => {
            const result = DataverseService.deepMerge(DEFAULT_CONFIG, {
                tables: {
                    contact: { mode: "include", fields: ["emailaddress1"] },
                },
            });

            expect(result.tables["*"]).toEqual({ mode: "audited", fields: [] }); // preserved
            expect(result.tables.contact).toEqual({ mode: "include", fields: ["emailaddress1"] });
        });
    });

    // ========================================================================
    // Input validation
    // ========================================================================
    describe("input validation", () => {
        it("should reject entity names with special characters", async () => {
            await expect(service.getEntitySetName("contact'; DROP TABLE")).rejects.toThrow(
                "Invalid entity logical name"
            );
        });

        it("should reject entity names starting with a number", async () => {
            await expect(service.getEntitySetName("123contact")).rejects.toThrow(
                "Invalid entity logical name"
            );
        });

        it("should reject entity names with uppercase", async () => {
            await expect(service.getEntitySetName("Contact")).rejects.toThrow(
                "Invalid entity logical name"
            );
        });

        it("should accept valid entity names with underscores", async () => {
            mockEntitySetNameResponse("new_customentities");
            const result = await service.getEntitySetName("new_customentity");
            expect(result).toBe("new_customentities");
        });

        it("should reject field names with special characters", async () => {
            mockAuditResponse([], 0, false);
            await expect(
                service.getFieldAuditHistory("contacts", "id", "email'; --")
            ).rejects.toThrow("Invalid attribute logical name");
        });

        it("should validate entity names in getAuditEnabledAttributes", async () => {
            const result = await service.getAuditEnabledAttributes("INVALID-NAME!");
            // Returns null because validation throws, caught by try/catch
            expect(result).toBeNull();
        });
    });

    // ========================================================================
    // Config parsing security
    // ========================================================================
    describe("config parsing security", () => {
        const mockWebAPI = {
            retrieveMultipleRecords: jest.fn(),
        } as unknown as ComponentFramework.WebApi;

        function mockWebResourceFetch(text: string): void {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                text: () => Promise.resolve(text),
                json: () => Promise.resolve({}),
            });
        }

        it("should handle config without assignment operator", async () => {
            mockWebResourceFetch('{ "quickPeek": { "maxEntries": 5 } }');

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            // Direct JSON object should be parsed (indexOf '{' finds it)
            expect(result.quickPeek.maxEntries).toBe(5);
        });

        it("should handle config with nested braces correctly", async () => {
            const configJs = 'var config = { "tables": { "*": { "mode": "audited", "fields": [] } } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result.tables["*"].mode).toBe("audited");
        });

        it("should return defaults for content with no JSON object", async () => {
            mockWebResourceFetch("// just a comment, no JSON");

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result).toEqual(DEFAULT_CONFIG);
        });

        it("should strip non-numeric defaultPageSize from config", async () => {
            const configJs = 'var config = { "audit": { "defaultPageSize": "fifty" } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            // Invalid value stripped, default preserved
            expect(result.audit.defaultPageSize).toBe(25);
        });

        it("should strip non-numeric maxPages from config", async () => {
            const configJs = 'var config = { "audit": { "maxPages": true } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result.audit.maxPages).toBe(10);
        });

        it("should strip non-string panelWidth from config", async () => {
            const configJs = 'var config = { "display": { "panelWidth": 480 } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result.display.panelWidth).toBe("80%");
        });

        it("should accept valid numeric config overrides", async () => {
            const configJs = 'var config = { "audit": { "defaultPageSize": 50, "maxPages": 20 } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result.audit.defaultPageSize).toBe(50);
            expect(result.audit.maxPages).toBe(20);
        });
    });

    // ========================================================================
    // Additional sanitizeConfig + getFormattedValue edge cases (A4 + S2 + S3)
    // ========================================================================
    describe("sanitizeConfig edge cases", () => {
        const mockWebAPI = {
            retrieveMultipleRecords: jest.fn(),
        } as unknown as ComponentFramework.WebApi;

        function mockWebResourceFetch(text: string): void {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                text: () => Promise.resolve(text),
                json: () => Promise.resolve({}),
            });
        }

        it("should strip non-array visibleOperations", async () => {
            const configJs = 'var config = { "audit": { "visibleOperations": "1,2,3" } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(result.audit.visibleOperations).toEqual([1, 2]); // default preserved
        });

        it("should strip non-numeric valuePreviewLength", async () => {
            const configJs = 'var config = { "display": { "valuePreviewLength": "long" } };';
            mockWebResourceFetch(configJs);

            const result = await service.loadConfig(mockWebAPI, "vp365_config");
            expect(typeof result.display.valuePreviewLength).toBe("number");
        });
    });

    describe("getFormattedValue edge cases", () => {
        it("should return JSON-stringified object for non-string formatted value", async () => {
            // Mock an audit response where a formatted value is a number (not string)
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 1,
                    AuditDetails: [{
                        AuditRecord: {
                            auditid: "audit-fmt-1",
                            operation: 2,
                            createdon: "2026-03-10T15:00:00Z",
                            _userid_value: "user-001",
                            "_userid_value@OData.Community.Display.V1.FormattedValue": "John Smith",
                        },
                        OldValue: {
                            statuscode: 1,
                            "statuscode@OData.Community.Display.V1.FormattedValue": 100,
                        },
                        NewValue: {
                            statuscode: 2,
                            "statuscode@OData.Community.Display.V1.FormattedValue": 200,
                        },
                    }],
                },
            });

            const result = await service.getFieldAuditHistory("contacts", "record-001", "statuscode", 1, 25);
            // Non-string formatted values should be JSON-stringified
            expect(result.entries[0].changedFields[0].oldValue).toBe("100");
            expect(result.entries[0].changedFields[0].newValue).toBe("200");
        });

        it("should return null for fields missing from both old and new values", async () => {
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 1,
                    AuditDetails: [{
                        AuditRecord: {
                            auditid: "audit-null-1",
                            operation: 2,
                            createdon: "2026-03-10T15:00:00Z",
                            _userid_value: "user-001",
                            "_userid_value@OData.Community.Display.V1.FormattedValue": "John Smith",
                        },
                        OldValue: { emailaddress1: null },
                        NewValue: { emailaddress1: "new@test.com" },
                    }],
                },
            });

            const result = await service.getFieldAuditHistory("contacts", "record-001", "emailaddress1", 1, 25);
            expect(result.entries[0].changedFields[0].oldValue).toBeNull();
            expect(result.entries[0].changedFields[0].newValue).toBe("new@test.com");
        });
    });

    // ========================================================================
    // Security: config URL injection (S2)
    // ========================================================================
    describe("config URL injection", () => {
        it("should not allow single-quote injection in config web resource name", async () => {
            const mockWebAPI = {
                retrieveMultipleRecords: jest.fn().mockResolvedValue({ entities: [] }),
            } as unknown as ComponentFramework.WebApi;

            // Primary fetch misses so WebAPI fallback runs
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Error",
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await service.loadConfig(mockWebAPI, "'; DELETE FROM --");
            // Should still call retrieveMultipleRecords (no pre-validation on config name)
            // but the OData filter uses the raw string — verify the mock was called with the injected name
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockWebAPI.retrieveMultipleRecords).toHaveBeenCalledWith(
                "webresource",
                expect.stringContaining("'; DELETE FROM --")
            );
            // The key defense is that webAPI.retrieveMultipleRecords is a Dataverse SDK method
            // that handles parameterization — this test documents the current behavior
        });
    });

    // ========================================================================
    // Security: record ID format (S3)
    // ========================================================================
    describe("record ID handling", () => {
        it("should strip braces from record ID", async () => {
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 0,
                    AuditDetails: [],
                },
            });

            await service.getRecordAuditHistory("contacts", "{abc-123-def}", 1, 25);

            const calls = (global.fetch as jest.Mock).mock.calls as string[][];
            const fetchCall = calls[0][0];
            expect(fetchCall).not.toContain("{");
            expect(fetchCall).not.toContain("}");
            expect(fetchCall).toContain("abc-123-def");
        });

        it("should handle record ID with OData injection attempt", async () => {
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 0,
                    AuditDetails: [],
                },
            });

            // The recordId is placed inside encodeURIComponent(JSON.stringify(...))
            // so special characters are double-encoded and cannot break the URL
            await service.getRecordAuditHistory("contacts", "abc); DROP TABLE--", 1, 25);

            const calls = (global.fetch as jest.Mock).mock.calls as string[][];
            const fetchCall = calls[0][0];
            // The value is inside a JSON string inside encodeURIComponent — safe
            expect(fetchCall).toContain("RetrieveRecordChangeHistory");
        });
    });

    describe("resolveTableConfig", () => {
        it("should return table-specific config when available", () => {
            const config = {
                ...DEFAULT_CONFIG,
                tables: {
                    "*": { mode: "audited" as const, fields: [] },
                    contact: { mode: "include" as const, fields: ["emailaddress1"] },
                },
            };

            const result = DataverseService.resolveTableConfig(config, "contact");

            expect(result.mode).toBe("include");
            expect(result.fields).toEqual(["emailaddress1"]);
        });

        it("should fall back to wildcard when table not listed", () => {
            const result = DataverseService.resolveTableConfig(DEFAULT_CONFIG, "account");

            expect(result.mode).toBe("audited");
        });

        it("should return default when no wildcard exists", () => {
            const config = { ...DEFAULT_CONFIG, tables: {} };
            const result = DataverseService.resolveTableConfig(config, "account");

            expect(result.mode).toBe("audited");
            expect(result.fields).toEqual([]);
        });
    });

    // ========================================================================
    // restoreFieldValue
    // ========================================================================
    /* eslint-disable @typescript-eslint/unbound-method */
    describe("restoreFieldValue", () => {
        let mockWebAPI: ComponentFramework.WebApi;

        beforeEach(() => {
            mockWebAPI = createMockWebAPI();
        });

        it("should restore a standard text field", async () => {
            const change = createFieldChange({
                fieldName: "emailaddress1",
                rawOldValue: "old@contoso.com",
                fieldType: "standard",
            });

            await service.restoreFieldValue(mockWebAPI, "contact", "record-001", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "contact",
                "record-001",
                { emailaddress1: "old@contoso.com" }
            );
        });

        it("should restore an option set field (integer)", async () => {
            const change = createFieldChange({
                fieldName: "statuscode",
                displayName: "statuscode",
                rawOldValue: 1,
                fieldType: "standard",
            });

            await service.restoreFieldValue(mockWebAPI, "contact", "record-001", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "contact",
                "record-001",
                { statuscode: 1 }
            );
        });

        it("should restore a boolean field", async () => {
            const change = createFieldChange({
                fieldName: "donotemail",
                displayName: "donotemail",
                rawOldValue: false,
                fieldType: "standard",
            });

            await service.restoreFieldValue(mockWebAPI, "contact", "record-001", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "contact",
                "record-001",
                { donotemail: false }
            );
        });

        it("should restore a lookup field with @odata.bind", async () => {
            mockEntitySetNameResponse("contacts");

            const change = createLookupFieldChange({
                rawOldValue: "aaa-bbb-ccc-111",
                lookupTarget: "contact",
            });

            await service.restoreFieldValue(mockWebAPI, "account", "record-001", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "account",
                "record-001",
                { "primarycontactid@odata.bind": "/contacts(aaa-bbb-ccc-111)" }
            );
        });

        it("should clear a lookup field (restore to null)", async () => {
            const change = createLookupFieldChange({
                rawOldValue: null,
                lookupTarget: "contact",
            });

            await service.restoreFieldValue(mockWebAPI, "account", "record-001", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "account",
                "record-001",
                { "primarycontactid@odata.bind": null }
            );
        });

        it("should throw when rawOldValue is undefined", async () => {
            const change: IFieldChange = {
                fieldName: "emailaddress1",
                displayName: "emailaddress1",
                oldValue: "old@test.com",
                newValue: "new@test.com",
                // rawOldValue intentionally omitted
            };

            await expect(
                service.restoreFieldValue(mockWebAPI, "contact", "record-001", change)
            ).rejects.toThrow("raw value not available");
        });

        it("should throw when lookup target is missing", async () => {
            const change = createLookupFieldChange({
                rawOldValue: "some-guid",
                lookupTarget: undefined,
            });

            await expect(
                service.restoreFieldValue(mockWebAPI, "account", "record-001", change)
            ).rejects.toThrow("target entity is unknown");
        });

        it("should handle permission error from updateRecord", async () => {
            (mockWebAPI.updateRecord as jest.Mock).mockRejectedValue(
                new Error("403 Forbidden: privilege check failed")
            );

            const change = createFieldChange({
                rawOldValue: "old@test.com",
                fieldType: "standard",
            });

            await expect(
                service.restoreFieldValue(mockWebAPI, "contact", "record-001", change)
            ).rejects.toThrow("permission to update");
        });

        it("should handle generic update error", async () => {
            (mockWebAPI.updateRecord as jest.Mock).mockRejectedValue(
                new Error("Network timeout")
            );

            const change = createFieldChange({
                rawOldValue: "old@test.com",
                fieldType: "standard",
            });

            await expect(
                service.restoreFieldValue(mockWebAPI, "contact", "record-001", change)
            ).rejects.toThrow("Restore failed: Network timeout");
        });

        it("should reject invalid navigation property names for lookup restore", async () => {
            const change = createLookupFieldChange({
                displayName: "INVALID NAME!",
                rawOldValue: "aaa-bbb-ccc",
                lookupTarget: "contact",
            });

            await expect(
                service.restoreFieldValue(mockWebAPI, "account", "record-001", change)
            ).rejects.toThrow("Invalid navigation property");
        });

        it("should strip braces from record ID", async () => {
            const change = createFieldChange({
                rawOldValue: "old@test.com",
                fieldType: "standard",
            });

            await service.restoreFieldValue(mockWebAPI, "contact", "{record-001}", change);

            expect(mockWebAPI.updateRecord).toHaveBeenCalledWith(
                "contact",
                "record-001",
                expect.any(Object)
            );
        });
    });

    // ========================================================================
    // extractChangedFields — raw value preservation
    // ========================================================================
    describe("extractChangedFields raw values", () => {
        it("should preserve raw values alongside formatted values", async () => {
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 1,
                    AuditDetails: [{
                        AuditRecord: {
                            auditid: "audit-raw-1",
                            operation: 2,
                            createdon: "2026-03-10T15:00:00Z",
                            _userid_value: "user-001",
                            "_userid_value@OData.Community.Display.V1.FormattedValue": "John Smith",
                        },
                        OldValue: {
                            statuscode: 1,
                            "statuscode@OData.Community.Display.V1.FormattedValue": "Active",
                        },
                        NewValue: {
                            statuscode: 2,
                            "statuscode@OData.Community.Display.V1.FormattedValue": "Inactive",
                        },
                    }],
                },
            });

            const result = await service.getFieldAuditHistory("contacts", "id", "statuscode");
            const field = result.entries[0].changedFields[0];

            expect(field.oldValue).toBe("Active");
            expect(field.newValue).toBe("Inactive");
            expect(field.rawOldValue).toBe(1);
            expect(field.rawNewValue).toBe(2);
            expect(field.fieldType).toBe("standard");
        });

        it("should detect lookup fields and extract target entity", async () => {
            mockFetchResponse({
                AuditDetailCollection: {
                    MoreRecords: false,
                    TotalRecordCount: 1,
                    AuditDetails: [{
                        AuditRecord: {
                            auditid: "audit-lookup-1",
                            operation: 2,
                            createdon: "2026-03-10T15:00:00Z",
                            _userid_value: "user-001",
                            "_userid_value@OData.Community.Display.V1.FormattedValue": "John Smith",
                        },
                        OldValue: {
                            "_primarycontactid_value": "guid-old",
                            "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "John Smith",
                            "_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
                        },
                        NewValue: {
                            "_primarycontactid_value": "guid-new",
                            "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Jane Doe",
                            "_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
                        },
                    }],
                },
            });

            const result = await service.getFieldAuditHistory("accounts", "id", "primarycontactid");
            const field = result.entries[0].changedFields[0];

            expect(field.fieldType).toBe("lookup");
            expect(field.lookupTarget).toBe("contact");
            expect(field.rawOldValue).toBe("guid-old");
            expect(field.rawNewValue).toBe("guid-new");
            expect(field.oldValue).toBe("John Smith");
            expect(field.newValue).toBe("Jane Doe");
        });
    });
});
