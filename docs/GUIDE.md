# Field Audit History - Technical Guide

This guide covers every feature of Field Audit History with screenshots. For a quick overview, see the [README](../README.md).

---

## Table of Contents

- [Audit Icons on Form Fields](#audit-icons-on-form-fields)
- [Quick Peek - Single-Field History](#quick-peek--single-field-history)
- [Deep Dive - Full Audit Panel](#deep-dive--full-audit-panel)
- [Filtering](#filtering)
- [Restore](#restore)
- [Copy and Export](#copy-and-export)
- [Configuration](#configuration)
- [Control Properties](#control-properties)

---

## Audit Icons on Form Fields

Once the control is added to a form, every audited field gets a small clock icon in its label. No per-field setup - the control reads entity metadata and detects audited fields automatically.

![Form with audit icons on every audited field](../screenshots/01-form-with-audit-icons.webp)

The host field (bottom-right) shows a status indicator: **"Audit tracking - 24 fields"** with a **View All** link to open the full record audit panel.

Hover over any icon to see the field name in the tooltip.

![Audit icon hover state with tooltip](../screenshots/02-audit-icon-hover-state.webp)

---

## Quick Peek - Single-Field History

Click any audit icon to open a Quick Peek popup showing the last 8 changes for that field. No navigation, no new page - the popup appears inline.

![Quick Peek showing recent changes for Middle Name](../screenshots/03-quick-peek-recent-changes.webp)

### User Filter in Quick Peek

The popup includes a user filter dropdown. Select a specific user to narrow the list.

![Quick Peek with user filter dropdown expanded](../screenshots/04-quick-peek-user-filter-dropdown.webp)

Click **"View full history"** at the bottom to open the Deep Dive panel for that field.

---

## Deep Dive - Full Audit Panel

The Deep Dive panel is a right-side sidecar that shows the complete audit timeline - either for a single field or the entire record.

### Field-Level Deep Dive

Open from Quick Peek → "View full history". Shows all changes for one field with filters, copy, restore, and CSV export.

![Email field audit history - full panel with 3 changes](../screenshots/05-email-field-audit-history.webp)

### Record-Level Deep Dive

Open from the host field's **View All** link. Shows every change across all fields on the record.

![Default deep dive view - 17 changes, no filters](../screenshots/19-deep-dive-default-view.webp)

### Timeline Entries

Each entry in the timeline shows:

- **Operation** - color-coded: green (Created), blue (Updated), orange (Cleared)
- **User** - who made the change
- **Timestamp** - when it happened
- **Field changes** - old value to new value for each field

Entries are collapsible. Click the chevron to expand or collapse. A badge shows the field count.

![Scrolled timeline with multiple entries and users](../screenshots/17-timeline-scrolled-multiple-entries.webp)

### Collapsible Groups

Multi-field entries collapse to save space. Expand to see every field that changed in that operation.

![Expanded entry showing 7 field changes with copy summary](../screenshots/09-collapsible-group-copy-summary.webp)

### Record Creation Entry

The "Created" entry shows every field value set when the record was first created. This can be a large list - the example below shows 79 fields.

![Created entry expanded - 79 fields set at record creation](../screenshots/15-record-created-79-fields-expanded.webp)

![Bottom of timeline showing creation entry with initial values](../screenshots/22-created-entry-all-initial-values.webp)

---

## Filtering

All filters are client-side - no additional API calls. The filter bar appears at the top of the Deep Dive panel.

### Field Filter

A searchable, multi-select dropdown of all fields in the loaded audit data. Type to search.

![Field filter dropdown - full alphabetical list](../screenshots/07-searchable-field-dropdown.webp)

![Type-to-search narrows the field list](../screenshots/08-field-search-type-to-filter.webp)

### User Filter

Multi-select dropdown of all users who made changes. Check or uncheck users to filter.

![Changed By dropdown with multi-select checkboxes](../screenshots/11-changed-by-user-filter-dropdown.webp)

### Operation Filter

Toggle buttons for **Created**, **Updated**, and **Cleared**. Combine them to narrow results.

**Created only** - isolate the record creation entry:

![Created filter active - showing 1 of 3 entries](../screenshots/06-created-filter-single-entry.webp)

**Cleared only** - find entries where values were set to empty:

![Cleared filter active - 4 entries where values were emptied](../screenshots/13-cleared-filter-values-to-empty.webp)

**Combined filters** - if no entries match, the panel shows a clear message:

![Created + Cleared filters combined - no matching entries](../screenshots/14-created-and-cleared-filter-combo.webp)

### Date Range Filter

Calendar pickers for **From** and **To** dates. Narrow the timeline to any window.

![Date range calendar picker open](../screenshots/20-date-range-calendar-picker.webp)

![Date range filtered to a single day - 11 of 17 entries](../screenshots/21-date-range-filtered-results.webp)

### Combined Filters

All filters work together. Stack user + date range + operation to find exactly what you need.

![User + date range filters combined - 2 matching entries](../screenshots/23-combined-user-and-date-filters.webp)

---

## Restore

Every audit entry has a **Restore** button (curved arrow icon). Click it to revert a field to its previous value.

![Restore button tooltip on a field change](../screenshots/10-restore-button-tooltip.webp)

![Restore hover on a cleared value entry](../screenshots/16-restore-hover-on-entry.webp)

The restore workflow:

1. Click the restore icon on any field change
2. A confirmation dialog appears showing the field name and previous value
3. Confirm to restore - the control patches the record via Web API
4. Success or error message appears
5. The form refreshes to reflect the restored value

Restore works on both standard fields and lookups. Clearing a value (restoring to empty) is also supported.

---

## Copy and Export

### Copy to Clipboard

Each field change row has a **Copy** button. Click to copy the old-to-new value transition. A "Copied!" toast confirms the action.

Each entry group has a **Copy Summary** button that copies the full entry - operation, user, date, and all field changes.

![Copy summary with "Copied!" confirmation toast](../screenshots/09-collapsible-group-copy-summary.webp)

### CSV Export

Click **Export CSV** at the top of the Deep Dive panel to download the currently loaded (and filtered) entries as a CSV file.

Columns: Date, User, Operation, Field, Old Value, New Value.

The export link is visible in the panel header:

![Panel header showing Export CSV link](../screenshots/05-email-field-audit-history.webp)

---

## Configuration

The control works out of the box with no configuration. Customize behavior via a JSON web resource named `vp365_AuditHistoryConfig`.

The control **auto-loads** that web resource when the form property **Config Web Resource** is blank. You may set the property to override the name. Do **not** attach the file as a form library — it is fetched as text and parsed as JSON (never executed).

**JSON rules:** keys and strings must use double quotes; no trailing commas; no comments inside the `{ ... }` block. Invalid JSON or a missing resource falls back to built-in defaults and logs `[FieldAuditHistory]` warnings in the browser console.

### Field Selection Modes

| Mode | Behavior | Best For |
|---|---|---|
| `audited` (default) | Icons on all audited fields | Most orgs |
| `include` | Only listed fields get icons | Show the 3-4 fields users care about |
| `exclude` | All audited fields except listed ones | Hide system noise like `modifiedon` |
| `all` | Icons on every visible field | Compliance reviews |

### Full Configuration Schema

```json
{
    "tables": {
        "*": { "mode": "audited", "fields": [] },
        "contact": {
            "mode": "include",
            "fields": ["emailaddress1", "telephone1", "jobtitle"]
        },
        "account": {
            "mode": "exclude",
            "fields": ["modifiedon", "modifiedby"]
        }
    },
    "features": {
        "allowRestore": true,
        "allowCopy": true,
        "allowExport": true
    },
    "audit": {
        "defaultPageSize": 25,
        "maxPages": 10,
        "visibleOperations": [1, 2],
        "dateFormat": "short"
    },
    "display": {
        "panelWidth": "80%",
        "showChangedBy": true,
        "showOperationType": true,
        "valuePreviewLength": 200,
        "iconTooltip": "View audit history",
        "showFilters": true
    },
    "quickPeek": {
        "maxEntries": 8,
        "showUserFilter": true
    },
    "labels": {
        "panelTitle": "Record Audit History",
        "fieldPanelTitle": "Audit History",
        "noRecordsMessage": "No audit history found.",
        "loadMoreButton": "Load More",
        "errorMessage": "Unable to load audit history.",
        "createdLabel": "Created",
        "updatedLabel": "Updated",
        "deletedLabel": "Deleted",
        "clearedLabel": "Cleared",
        "statusLabel": "Audit tracking",
        "restoreConfirmTitle": "Restore Value",
        "restoreConfirmMessage": "Restore {field} to its previous value?",
        "restoreSuccessMessage": "Value restored. Refresh the form to see the update.",
        "restoreButtonLabel": "Restore",
        "copySuccessLabel": "Copied!",
        "copySummaryLabel": "Copy summary",
        "exportButtonLabel": "Export CSV"
    }
}
```

Config changes take effect on next form load - no solution re-import needed.

### Operations Reference

| Code | Label | Color |
|---|---|---|
| 1 | Created | Green |
| 2 | Updated | Blue |
| 3 | Deleted | Gray |
| 4 | Accessed | Gray |

---

## Control Properties

These are set in the form editor when binding the control to a host field.

| Property | Type | Required | Description |
|---|---|---|---|
| `boundField` | SingleLine.Text | Yes | Host field the control binds to. Not displayed - serves as anchor. |
| `configWebResourceName` | SingleLine.Text | No | Logical name of JSON config web resource. Defaults to `vp365_AuditHistoryConfig` when blank. |
| `pageSize` | Whole.None | No | Audit entries per API page (1-1000). Default: 25. |

---

## Account Name History - Full Chain Example

The screenshots below show how the timeline captures a complete chain of changes to a single field over time - useful for tracking data lineage.

![Account name changes over time - full chain from empty to multiple values](../screenshots/18-timeline-account-name-changes.webp)

![Full timeline with mixed entries and multiple users](../screenshots/12-full-audit-timeline-entries.webp)
