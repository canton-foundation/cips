// 1. Define types based on the provided JSON schema
interface PackageHash {
  algorithm: string;
  value: string;
}

interface AuditResult {
  auditor_name: string;
  audit_date: string;
  audit_report_url: string;
  audit_status: 'passed' | 'conditionally_passed' | 'failed';
  severity_rating?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  expiration_date?: string;
}

interface AuditReportSummary {
  schema_version: string;
  package_id: string;
  package_version: string;
  package_hash: PackageHash;
  audit_results: AuditResult[];
}

// 2. Helper functions for formatting
function formatDate(isoString: string): string {
  return isoString.split('T')[0];
}

function formatStatus(status: AuditResult['audit_status']): string {
  switch (status) {
    case 'passed':
      return '✓ Passed';
    case 'conditionally_passed':
      return '⚠ Conditionally Passed';
    case 'failed':
      return '✗ Failed';
    default:
      // Fallback for unexpected values
      return status;
  }
}

// 3. Main function to generate the Markdown table
export function generateAuditMarkdownTable(reports: AuditReportSummary[]): string {
  let markdown = '| Version | Auditor | Date | Status | Report |\n';
  markdown += '|---------|---------|------|--------|--------|\n';

  for (const report of reports) {
    const version = report.package_version;
    
    for (const result of report.audit_results) {
      const auditor = result.auditor_name;
      const date = formatDate(result.audit_date);
      const status = formatStatus(result.audit_status);
      const reportLink = `[Audit Report](${result.audit_report_url})`;

      // Append row to table
      markdown += `| ${version} | ${auditor} | ${date} | ${status} | ${reportLink} |\n`;
    }
  }

  return markdown.trim();
}

// --- Usage Example ---

const mockData: AuditReportSummary[] = [
  {
    "schema_version": "1.0",
    "package_id": "app-provider-name",
    "package_version": "1.0.0",
    "package_hash": {
      "algorithm": "sha256",
      "value": "fakehash1"
    },
    "audit_results": [
      {
        "auditor_name": "Security Auditor Company",
        "audit_date": "2026-02-20T00:00:00Z",
        "audit_report_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider-name/1.0.0/audit-report.json",
        "audit_status": "passed",
        "severity_rating": "none",
        "expiration_date": "2027-02-20T00:00:00Z"
      }
    ]
  },
  {
    "schema_version": "1.0",
    "package_id": "app-provider-name",
    "package_version": "1.1.0",
    "package_hash": {
      "algorithm": "sha256",
      "value": "fakehash2"
    },
    "audit_results": [
      {
        "auditor_name": "Security Auditor Company",
        "audit_date": "2026-02-26T00:00:00Z",
        "audit_report_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider-name/1.1.0/audit-report.json",
        "audit_status": "passed"
      },
      {
        "auditor_name": "AnotherAuditor",
        "audit_date": "2026-02-25T00:00:00Z",
        "audit_report_url": "https://github.com/another-auditor/audits/blob/main/reports/app-provider/1.1.0/audit.json",
        "audit_status": "passed"
      }
    ]
  }
];

const markdownOutput = generateAuditMarkdownTable(mockData);
console.log(markdownOutput);
