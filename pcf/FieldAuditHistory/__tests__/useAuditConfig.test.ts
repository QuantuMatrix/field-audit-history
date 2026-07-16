/* eslint-disable @typescript-eslint/unbound-method */
import { act } from "@testing-library/react";
import { renderHook } from "./renderHook";
import { useAuditConfig } from "../hooks/useAuditConfig";
import { DEFAULT_CONFIG, DEFAULT_CONFIG_WEB_RESOURCE } from "../models/IConfig";
import { createMockContext, createMockService } from "./helpers";
import { EntityContext } from "../hooks/loadAuditData";

describe("useAuditConfig", () => {
    const entityContext: EntityContext = {
        entityId: "record-001",
        entityTypeName: "contact",
    };

    it("should return defaults and stop loading when entityContext is null", () => {
        const mockContext = createMockContext();
        const service = createMockService();

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                null,
                service,
            )
        );

        expect(result.current.metadataLoading).toBe(false);
        expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    it("should load config and metadata when entityContext is provided", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getAttributeDisplayNames as jest.Mock).mockReturnValue({
            emailaddress1: "Email",
        });

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(service.getAuditEnabledAttributes).toHaveBeenCalledWith("contact");
        expect(result.current.metadataLoading).toBe(false);
        expect(result.current.auditedFields).toEqual(new Set(["emailaddress1"]));
    });

    it("should auto-load DEFAULT_CONFIG_WEB_RESOURCE when property is blank", async () => {
        const mockContext = createMockContext();
        const service = createMockService();

        await act(async () => {
            renderHook(() =>
                useAuditConfig(
                    mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                    entityContext,
                    service,
                )
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        // Blank/null property still loads the solution-shipped default name
        expect(service.loadConfig).toHaveBeenCalledWith(
            mockContext.webAPI,
            DEFAULT_CONFIG_WEB_RESOURCE
        );
    });

    it("should load config when configWebResourceName is provided", async () => {
        const mockContext = createMockContext();
        mockContext.parameters.configWebResourceName = { raw: "vp365_config" };
        const service = createMockService();

        await act(async () => {
            renderHook(() =>
                useAuditConfig(
                    mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                    entityContext,
                    service,
                )
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(service.loadConfig).toHaveBeenCalledWith(
            mockContext.webAPI,
            "vp365_config"
        );
    });

    it("should trim configWebResourceName before load", async () => {
        const mockContext = createMockContext();
        mockContext.parameters.configWebResourceName = { raw: "  custom_Config  " };
        const service = createMockService();

        await act(async () => {
            renderHook(() =>
                useAuditConfig(
                    mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                    entityContext,
                    service,
                )
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(service.loadConfig).toHaveBeenCalledWith(
            mockContext.webAPI,
            "custom_Config"
        );
    });

    it("should handle metadata loading exception gracefully", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getAuditEnabledAttributes as jest.Mock).mockRejectedValue(new Error("Network timeout"));

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        // Exception in metadata loading should set auditedFields to null and stop loading
        expect(result.current.auditedFields).toBeNull();
        expect(result.current.metadataLoading).toBe(false);
    });

    it("should handle metadata failure gracefully", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getAuditEnabledAttributes as jest.Mock).mockResolvedValue(null);

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditedFields).toBeNull();
        expect(result.current.metadataLoading).toBe(false);
    });

    // ========================================================================
    // Audit status detection
    // ========================================================================
    it("should set auditStatus to orgAuditDisabled when org audit is off", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getOrgAuditEnabled as jest.Mock).mockResolvedValue(false);

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("orgAuditDisabled");
    });

    it("should set auditStatus to tableAuditDisabled when table audit is off", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getEntityAuditEnabled as jest.Mock).mockResolvedValue(false);

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("tableAuditDisabled");
    });

    it("should set auditStatus to noAuditedFields when field list is empty", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getAuditEnabledAttributes as jest.Mock).mockResolvedValue([]);

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("noAuditedFields");
    });

    it("should set auditStatus to noAuditRecords when audit API returns zero entries", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getRecordAuditHistory as jest.Mock).mockResolvedValue({
            entries: [],
            totalRecordCount: 0,
            moreRecords: false,
            pagingCookie: null,
        });

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("noAuditRecords");
    });

    it("should set auditStatus to ok when everything is configured", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getRecordAuditHistory as jest.Mock).mockResolvedValue({
            entries: [{}],
            totalRecordCount: 5,
            moreRecords: false,
            pagingCookie: null,
        });

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("ok");
    });

    it("should prioritize orgAuditDisabled over tableAuditDisabled", async () => {
        const mockContext = createMockContext();
        const service = createMockService();
        (service.getOrgAuditEnabled as jest.Mock).mockResolvedValue(false);
        (service.getEntityAuditEnabled as jest.Mock).mockResolvedValue(false);

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.auditStatus).toBe("orgAuditDisabled");
    });

    it("should resolve table config for the entity", async () => {
        const mockContext = createMockContext();
        const service = createMockService();

        const { result } = renderHook(() =>
            useAuditConfig(
                mockContext as unknown as Parameters<typeof useAuditConfig>[0],
                entityContext,
                service,
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(result.current.tableConfig.mode).toBe("audited");
    });
});
