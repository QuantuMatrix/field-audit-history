// useAuditConfig.ts — Config loading and table config resolution

import * as React from "react";
import { IInputs } from "../generated/ManifestTypes";
import { DataverseService } from "../services/DataverseService";
import {
    IAuditConfig,
    ITableConfig,
    DEFAULT_CONFIG,
    DEFAULT_CONFIG_WEB_RESOURCE,
    AuditStatusKind,
} from "../models/IConfig";
import { EntityContext } from "./loadAuditData";

export interface UseAuditConfigReturn {
    config: IAuditConfig;
    tableConfig: ITableConfig;
    displayNameMap: Record<string, string>;
    auditedFields: Set<string> | null;
    metadataLoading: boolean;
    auditStatus: AuditStatusKind;
}

/**
 * Loads the config web resource, resolves per-table config,
 * fetches audit-enabled attributes, and builds the display name map.
 * All loading happens on mount in parallel.
 */
export function useAuditConfig(
    context: ComponentFramework.Context<IInputs>,
    entityContext: EntityContext | null,
    service: DataverseService,
): UseAuditConfigReturn {
    const [config, setConfig] = React.useState<IAuditConfig>(DEFAULT_CONFIG);
    const [tableConfig, setTableConfig] = React.useState<ITableConfig>({
        mode: "audited",
        fields: [],
    });
    const [displayNameMap, setDisplayNameMap] = React.useState<
        Record<string, string>
    >({});
    const [auditedFields, setAuditedFields] = React.useState<Set<
        string
    > | null>(null);
    const [metadataLoading, setMetadataLoading] = React.useState(true);
    const [auditStatus, setAuditStatus] = React.useState<AuditStatusKind>("loading");

    React.useEffect(() => {
        if (!entityContext) {
            setMetadataLoading(false);
            setAuditStatus("ok");
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                // Prefer the form property; otherwise load the solution-shipped default.
                const rawName =
                    context.parameters.configWebResourceName?.raw?.trim() ?? "";
                const configName =
                    rawName.length > 0 ? rawName : DEFAULT_CONFIG_WEB_RESOURCE;

                const [loadedConfig, fields, orgEnabled, tableEnabled] = await Promise.all([
                    service.loadConfig(context.webAPI, configName),
                    service.getAuditEnabledAttributes(
                        entityContext.entityTypeName
                    ),
                    service.getOrgAuditEnabled(),
                    service.getEntityAuditEnabled(entityContext.entityTypeName),
                ]);

                if (cancelled) return;

                setConfig(loadedConfig);

                const resolved = DataverseService.resolveTableConfig(
                    loadedConfig,
                    entityContext.entityTypeName
                );
                setTableConfig(resolved);

                setDisplayNameMap(service.getAttributeDisplayNames());

                if (fields !== null) {
                    setAuditedFields(new Set(fields));
                } else {
                    setAuditedFields(null);
                }

                // Determine audit status in priority order
                if (!orgEnabled) {
                    setAuditStatus("orgAuditDisabled");
                } else if (!tableEnabled) {
                    setAuditStatus("tableAuditDisabled");
                } else if (fields !== null && fields.length === 0) {
                    setAuditStatus("noAuditedFields");
                } else {
                    // Check for empty audit records with a lightweight probe
                    try {
                        const entitySetName = await service.getEntitySetName(
                            entityContext.entityTypeName
                        );
                        if (cancelled) return;
                        const sample = await service.getRecordAuditHistory(
                            entitySetName,
                            entityContext.entityId,
                            1,
                            1,
                        );
                        if (cancelled) return;
                        setAuditStatus(
                            sample.totalRecordCount === 0 ? "noAuditRecords" : "ok"
                        );
                    } catch {
                        // Fail-open: if we can't check, assume ok
                        if (!cancelled) setAuditStatus("ok");
                    }
                }
            } catch {
                if (!cancelled) {
                    setAuditedFields(null);
                    setAuditStatus("error");
                }
            } finally {
                if (!cancelled) {
                    setMetadataLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [entityContext, context, service]);

    return { config, tableConfig, displayNameMap, auditedFields, metadataLoading, auditStatus };
}
