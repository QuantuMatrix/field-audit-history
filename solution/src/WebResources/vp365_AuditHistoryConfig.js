// ============================================================================
// vp365_AuditHistoryConfig.js — Default configuration for Field Audit History
// ============================================================================
//
// This web resource provides default configuration for the Field Audit History
// PCF control. Admins can edit this file in their environment to customize
// behavior per-table.
//
// To customize: Solutions → vp365.ai | Field Audit History → Web Resources →
//               vp365.ai | Audit History Config → Edit
//
// USAGE:
//   1. Set the PCF control's "Config Web Resource" property to:
//      vp365_AuditHistoryConfig
//      (optional in recent builds — this name is auto-loaded when blank)
//   2. Edit this file to override defaults.
//   3. Save + Publish All Customizations, then hard-refresh the form.
//
// IMPORTANT — content inside the braces must be VALID JSON:
//   - Every key double-quoted: "mode": "audited"
//   - Double-quoted strings only (no single quotes)
//   - No trailing commas
//   - No // comments inside the { ... } block
// The control JSON.parses this file; it does NOT execute it as JavaScript.
//
// MODES:
//   "audited"  — show icons only on fields with auditing enabled (default)
//   "include"  — show icons ONLY on fields listed in `fields`
//   "exclude"  — show icons on all audited fields EXCEPT those in `fields`
//   "all"      — show icons on ALL visible fields
//
// EXAMPLE (per-table overrides):
//   "tables": {
//       "*": { "mode": "audited", "fields": [] },
//       "contact": { "mode": "include", "fields": ["emailaddress1", "telephone1"] },
//       "account": { "mode": "exclude", "fields": ["modifiedon", "modifiedby"] }
//   }
//
// INTERACTION:
//   Click icon → Quick Peek callout (last N changes, compact popup)
//   Click status indicator → Deep Dive panel (80% sidecar, full filters)
//   Quick Peek "View full history →" → opens Deep Dive for that field
// ============================================================================
var config = {
    "_version": "3.4.0",
    "features": {
        "allowRestore": true,
        "allowCopy": true,
        "allowExport": true
    },
    "tables": {
        "*": {
            "mode": "audited",
            "fields": []
        }
    },
    "quickPeek": {
        "maxEntries": 8,
        "showUserFilter": true
    },
    "display": {
        "iconTooltip": "View audit history"
    },
    "labels": {
        "statusLabel": "Audit tracking"
    }
};
