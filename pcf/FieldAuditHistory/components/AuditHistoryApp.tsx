// AuditHistoryApp.tsx — Composition-only orchestrator
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IInputs } from "../generated/ManifestTypes";
import { DataverseService } from "../services/DataverseService";
import { AuditIcon } from "./AuditIcon";
import { AuditPanel } from "./AuditPanel";
import { QuickPeekCallout } from "./QuickPeekCallout";
import {
    useEntityContext,
    useAuditConfig,
    usePortalInjection,
    useDeepDive,
    useQuickPeek,
    useRestore,
} from "../hooks";
import { AuditStatusKind } from "../models/IConfig";
import { RestoreConfirmDialog } from "./RestoreConfirmDialog";
import { exportAuditCsv } from "../utils/exportCsv";
import { colors } from "../utils/theme";
import {
    Stack,
    Icon,
    Text,
    Spinner,
    SpinnerSize,
    Link,
} from "@fluentui/react";

export interface IAuditHistoryAppProps {
    context: ComponentFramework.Context<IInputs>;
    hostFieldLogicalName: string;
}

const statusContainerStyles = {
    root: {
        padding: "4px 0",
        minHeight: 24,
        cursor: "pointer",
        ":hover": {
            backgroundColor: colors.neutralLighter,
            borderRadius: 4,
        },
    },
};

const statusIconStyles = {
    root: {
        color: colors.themePrimary,
        fontSize: 14,
    },
};

const statusTextStyles = {
    root: {
        fontSize: 12,
        color: colors.neutralSecondary,
    },
};

const viewAllLinkStyles = {
    root: {
        fontSize: 12,
        marginLeft: "auto",
    },
};

const infoIconStyles = {
    root: {
        color: colors.neutralSecondary,
        fontSize: 14,
    },
};

const infoTextStyles = {
    root: {
        fontSize: 12,
        color: colors.neutralSecondary,
        fontStyle: "italic" as const,
    },
};

function getStatusMessage(
    status: AuditStatusKind,
    labels: { statusOrgAuditDisabled: string; statusTableAuditDisabled: string; statusNoAuditedFields: string; statusNoAuditRecords: string },
): string | null {
    switch (status) {
        case "orgAuditDisabled": return labels.statusOrgAuditDisabled;
        case "tableAuditDisabled": return labels.statusTableAuditDisabled;
        case "noAuditedFields": return labels.statusNoAuditedFields;
        case "noAuditRecords": return labels.statusNoAuditRecords;
        default: return null;
    }
}

export const AuditHistoryApp: React.FC<IAuditHistoryAppProps> = ({
    context,
    hostFieldLogicalName,
}) => {
    const serviceRef = React.useRef(new DataverseService());

    // Hook 1: Entity context
    const entityContext = useEntityContext(context);

    // Hook 2: Config + metadata
    const {
        config,
        tableConfig,
        displayNameMap,
        auditedFields,
        metadataLoading,
        auditStatus,
    } = useAuditConfig(context, entityContext, serviceRef.current);

    const statusMessage = getStatusMessage(auditStatus, config.labels);

    // Hook 3: Portal injection
    const { portalTargets } = usePortalInjection(
        hostFieldLogicalName,
        tableConfig,
        auditedFields,
        metadataLoading,
        entityContext
    );

    // Hook 4: Restore
    const restore = useRestore(
        serviceRef.current,
        entityContext,
        context as unknown as ComponentFramework.Context<Record<string, unknown>>,
        config,
    );

    // Hook 5: Deep Dive (declared before Quick Peek — QP needs openFieldDeepDive)
    const deepDive = useDeepDive(
        serviceRef.current,
        entityContext,
        context,
        config
    );

    // Hook 6: Quick Peek
    const quickPeek = useQuickPeek(
        serviceRef.current,
        entityContext,
        context,
        config,
        portalTargets,
        deepDive.openFieldDeepDive
    );

    // Copy to clipboard handler
    const handleCopy = React.useCallback((text: string) => {
        void navigator.clipboard.writeText(text).catch(() => {
            // Clipboard API may not be available in all environments
        });
    }, []);

    // CSV export handler
    const handleExport = React.useCallback(() => {
        const entriesToExport = deepDive.filteredEntries;
        if (entriesToExport.length > 0) {
            exportAuditCsv(entriesToExport);
        }
    }, [deepDive.filteredEntries]);

    // Unsaved records have no entityId — show a disabled status indicator
    if (!entityContext) {
        return (
            <Stack
                horizontal
                verticalAlign="center"
                tokens={{ childrenGap: 6 }}
                styles={{ root: { padding: "4px 0", minHeight: 24 } }}
            >
                <Icon
                    iconName="ComplianceAudit"
                    styles={{ root: { color: colors.neutralTertiary, fontSize: 14 } }}
                />
                <Text styles={{ root: { fontSize: 12, color: colors.neutralTertiary } }}>
                    Save the record to view audit history
                </Text>
            </Stack>
        );
    }

    return (
        <>
            {/* STATUS INDICATOR — clickable, opens record-level audit */}
            <Stack
                horizontal
                verticalAlign="center"
                tokens={{ childrenGap: 6 }}
                styles={statusContainerStyles}
                onClick={deepDive.openRecordAudit}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        deepDive.openRecordAudit();
                    }
                }}
            >
                {metadataLoading ? (
                    <Spinner
                        size={SpinnerSize.xSmall}
                        label={config.labels.statusLoadingLabel}
                        labelPosition="right"
                        styles={{ label: statusTextStyles.root }}
                    />
                ) : statusMessage ? (
                    <>
                        <Icon iconName="Info" styles={infoIconStyles} />
                        <Text styles={infoTextStyles}>
                            {statusMessage}
                        </Text>
                    </>
                ) : (
                    <>
                        <Icon
                            iconName="ComplianceAudit"
                            styles={statusIconStyles}
                        />
                        <Text styles={statusTextStyles}>
                            {config.labels.statusLabel}
                            {portalTargets.length > 0
                                ? ` · ${portalTargets.length} field${
                                      portalTargets.length !== 1 ? "s" : ""
                                  }`
                                : ""}
                        </Text>
                        <Link
                            styles={viewAllLinkStyles}
                            onClick={(ev) => {
                                ev.stopPropagation();
                                deepDive.openRecordAudit();
                            }}
                        >
                            View All &rsaquo;
                        </Link>
                    </>
                )}
            </Stack>

            {/* REACT PORTALS — exactly one AuditIcon per field logical name */}
            {portalTargets.map((target) =>
                document.body.contains(target.portalElement)
                    ? ReactDOM.createPortal(
                          <AuditIcon
                              fieldLogicalName={target.fieldLogicalName}
                              fieldDisplayName={
                                  target.fieldDisplayName ||
                                  target.fieldLogicalName
                              }
                              tooltip={config.display.iconTooltip}
                              onClick={quickPeek.handleIconClick}
                          />,
                          target.portalElement,
                          target.fieldLogicalName
                      )
                    : null
            )}

            {/* QUICK PEEK CALLOUT — compact popup for single field (UC1) */}
            {quickPeek.quickPeek && (
                <QuickPeekCallout
                    target={quickPeek.quickPeek.anchorElement}
                    fieldDisplayName={quickPeek.quickPeek.fieldDisplayName}
                    entries={quickPeek.quickPeek.entries}
                    loading={quickPeek.quickPeek.loading}
                    error={quickPeek.quickPeek.error}
                    config={config}
                    onDismiss={quickPeek.handleQuickPeekDismiss}
                    onViewFullHistory={quickPeek.handleQuickPeekViewFull}
                    onRetry={quickPeek.handleQuickPeekRetry}
                    onRestore={restore.requestRestore}
                    onCopy={handleCopy}
                    auditStatus={auditStatus}
                />
            )}

            {/* DEEP DIVE PANEL — 80% sidecar with filters and timeline (UC2) */}
            <AuditPanel
                isOpen={deepDive.deepDive !== null}
                onDismiss={deepDive.handleDismiss}
                entries={deepDive.deepDive?.entries ?? []}
                filteredEntries={deepDive.filteredEntries}
                loading={deepDive.deepDive?.loading ?? false}
                loadingMore={deepDive.deepDive?.loadingMore ?? false}
                error={deepDive.deepDive?.error ?? null}
                totalCount={deepDive.deepDive?.totalCount ?? 0}
                moreRecords={deepDive.canLoadMore}
                onLoadMore={deepDive.handleLoadMore}
                onRetry={deepDive.handleRetry}
                title={deepDive.panelTitle}
                config={config}
                filterState={deepDive.filterState}
                onFilterChange={deepDive.handleFilterChange}
                displayNameMap={displayNameMap}
                mode={deepDive.deepDive?.mode}
                fieldDisplayName={deepDive.deepDive?.fieldDisplayName}
                onViewAllFields={deepDive.handleViewAllFields}
                onViewField={
                    deepDive.deepDive?.fieldLogicalName
                        ? deepDive.handleViewField
                        : undefined
                }
                onRestore={restore.requestRestore}
                onCopy={handleCopy}
                onExport={handleExport}
                auditStatus={auditStatus}
            />

            {/* RESTORE CONFIRMATION DIALOG */}
            <RestoreConfirmDialog
                isOpen={restore.restoreState.dialogOpen}
                change={restore.restoreState.change}
                restoring={restore.restoreState.restoring}
                successMessage={restore.restoreState.successMessage}
                errorMessage={restore.restoreState.errorMessage}
                config={config}
                onConfirm={restore.confirmRestore}
                onCancel={restore.cancelRestore}
                onDismiss={restore.dismissResult}
            />
        </>
    );
};
