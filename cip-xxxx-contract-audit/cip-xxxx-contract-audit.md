<pre>
  CIP: CIP 0106
* Layer: Daml
  Title: Standard Package Validation and Distribution for Daml Applications
  Author: 
* Discussions-To: 
* Comments-Summary: 
* Comments-URI: 
  Status: Draft
  Type: Standards Track
  Created: 2026-02-27
  License: CC0-1.0
* License-Code: CC0-1.0
* Post-History: 
* Requires: 
</pre>

## Abstract

This CIP proposes a standardized protocol for secure interaction between three parties in the Daml application ecosystem: **App Providers**, **Validator Node Providers**, and **Security Auditors**. The standard defines how App Providers publish Daml packages (.dar files) with cryptographically verifiable build metadata, how they request security audits from independent Security Auditors, and how Validator Node Providers can discover and verify audit results to make informed security decisions before integrating third-party packages.

The protocol establishes transparent, Git-based publication channels for both App Provider packages and audit results, enabling Validator Node Providers to establish trust through verifiable security validations without requiring direct auditing capabilities.

## Specification

This CIP proposes a standardized protocol with three main components:

1. **Package Publication Standard**: App Providers publish Daml packages with structured metadata
2. **Audit Request and Response Protocol**: Standardized communication between App Providers and auditors
3. **Audit Result Publication**: Security Auditors and Validator Node Providers publish audit results in verifiable Git repositories

### Overview

#### Parties

- **App Provider**: An organization or individual developing Daml applications and publishing Daml packages (.dar files)
- **Validator Node Provider**: A service provider providing users with access to a Canton Network validator node hosting their parties.
- **Security Auditor**: An independent security firm or team validating the security properties of Daml packages

#### Problem Statement

As the Daml ecosystem grows, Validator Node Providers need a reliable mechanism to:
1. Discover what security validations have been performed on third-party packages
2. Verify the integrity and authenticity of security audit reports
3. Make informed decisions about package integration based on transparent audit results
4. Establish trust without performing redundant security validations
5. Understand version compatibility between composed applications

App Providers benefit from:
1. Clear specification of what information to provide for auditing
2. Decentralized publication of audit results
3. Reuse of existing audits across multiple Validator Node Providers

### Component 1: Package Publication Standard

#### App Provider Git Repository Structure

Each App Provider maintains a public or private Git repository with the following structure:

```
app-provider-repo/
├── README.md
├── apps/
│   ├── canton-coin/
│   │   ├── packages/
│   │   │   ├── splice-amulet-0.1.16_c208d7ead1e4e9b610fc2054d0bf00716144ad444011bce0b02dcd6cd0cb8a23/
│   │   │   │   ├── package.dar
│   │   │   │   ├── metadata.json
│   │   │   │   ├── audit-reports.json
│   │   │   │   └── build-config.json
│   │   │   └── splice-util-0.1.5_5a58024e2cc488ca9e0c952ec7ef41da3a1ed0a78ba23bacd819e5b30afb5546/
│   │   │       ├── package.dar
│   │   │       ├── metadata.json
│   │   │       ├── audit-reports.json
│   │   │       └── build-config.json
│   │   └── vetting-states/
│   │       ├── mainnet.json
│   │       ├── devnet.json
│   │       └── testnet.json
│   └── global-sync-governance/
│       ├── packages/
│       │   └── splice-dso-governance-0.1.22_5c28530209b9ab37c5f187132cd826709bb18b0efe28411488ab750870414738/
│       │       ├── package.dar
│       │       ├── metadata.json
│       │       ├── audit-reports.json
│       │       └── build-config.json
│       └── vetting-states/
│           ├── mainnet.json
│           ├── devnet.json
│           └── testnet.json
```

**Note on Directory Naming**: Directories under `packages/` must use the full package name, version, and an underscore-prefixed package hash (e.g., `package-name-1.2.3_hash`). This ensures uniqueness and avoids conflicts.

#### Package Metadata Format

The `metadata.json` file for each package version follows this JSON schema:

```json
{
  "schema_version": "1.0",
  "package_id": "string",
  "package_name": "string",
  "version": "string",
  "release_date": "2026-02-27T00:00:00Z",
  "description": "string",
  "publisher": {
    "name": "string",
    "email": "string",
    "organization": "string",
    "public_key_id": "string",
    "repository_url": "https://github.com/org/repo"
  },
  "package_hash": {
    "algorithm": "sha256",
    "value": "hex-encoded-hash"
  },
  "file_size_bytes": 12345,
  "dependencies": [
    {
      "package_id": "string",
      "package_name": "string",
      "version": "string",
      "package_hash": {
        "algorithm": "sha256",
        "value": "hex-encoded-hash"
      }
    }
  ],
  "build_reproducibility": {
    "daml_sdk_version": "3.3.0",
    "ghc_version": "9.2.4",
    "build_timestamp": "2026-02-27T00:00:00Z",
    "build_parameters": {
      "optimization_level": "release",
      "additional_flags": ["--ghc-option=-O2"]
    },
    "build_instructions_url": "https://github.com/org/repo/blob/main/BUILD.md#v1.0.0"
  },
  "security_properties": {
    "daml_stdlib_version": "3.3.0",
    "notable_modules": [
      {
        "module_name": "App.Security.Authorization",
        "description": "Custom authorization logic"
      }
    ]
  },
  "licenses": {
    "package_license": "Apache-2.0",
    "dependency_licenses": [
      {
        "package_name": "string",
        "license": "Apache-2.0"
      }
    ]
  },
  "contact": {
    "security_email": "security@example.com",
    "support_url": "https://example.com/support"
  }
}
```

##### Security Properties Definitions

- **`daml_stdlib_version`**: The version of the Daml Standard Library used to compile the package.
- **`notable_modules`**: A list of modules that are particularly important for security review (e.g., core business logic, authorization modules).

#### Build Configuration Format

The `build-config.json` file contains reproducible build information:

```json
{
  "schema_version": "1.0",
  "build_id": "unique-identifier",
  "package_version": "1.0.0",
  "build_timestamp": "2026-02-27T10:30:00Z",
  "daml_sdk_version": "3.3.0",
  "daml_sdk_hash": {
    "algorithm": "sha256",
    "value": "hex-encoded-hash"
  },
  "ghc_version": "9.2.4",
  "environment": {
    "os": "linux",
    "os_version": "Ubuntu 22.04",
    "architecture": "x86_64"
  },
  "source_hash": {
    "algorithm": "sha256",
    "value": "hex-encoded-hash-of-source-tree"
  },
  "build_script": "daml build --output package.dar",
  "build_flags": {
    "optimize": true,
    "enable_tests": true,
    "additional_options": []
  },
  "verification_instructions": "https://github.com/org/repo/blob/main/REPRODUCIBLE_BUILD.md",
  "build_artifacts_hash": {
    "algorithm": "sha256",
    "value": "hex-encoded-hash"
  }
}
```

#### Package Audit Reports

The `audit-reports.json` file in each package directory summarizes available audits:

```json
{
  "schema_version": "1.0",
  "package_id": "splice-amulet",
  "package_version": "0.1.16",
  "package_hash": {
    "algorithm": "sha256",
    "value": "c208d7ead1e4e9b610fc2054d0bf00716144ad444011bce0b02dcd6cd0cb8a23"
  },
  "audit_results": [
    {
      "auditor_name": "Security Auditor Company",
      "audit_date": "2026-02-20T00:00:00Z",
      "audit_report_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider-name/1.0.0/audit-report.json",
      "audit_status": "passed",
      "severity_rating": "none",
      "expiration_date": "2027-02-27T00:00:00Z"
    }
  ]
}
```

#### Vetting States Format

The `vetting-states/` directory contains JSON files (e.g., `mainnet.json`, `testnet.json`) that define the desired vetting state for the application on a specific network. This allows App Providers to communicate which package versions should be vetted or unvetted as part of a single application update.

```json
{
  "schema_version": "1.0",
  "app_name": "canton-coin",
  "network": "mainnet",
  "last_updated": "2026-03-01T10:00:00Z",
  "vetting_state": {
    "vet": [
      {
        "package_id": "splice-amulet",
        "package_version": "0.1.16",
        "package_hash": {
          "algorithm": "sha256",
          "value": "c208d7ead1e4e9b610fc2054d0bf00716144ad444011bce0b02dcd6cd0cb8a23"
        }
      },
      {
        "package_id": "splice-util",
        "package_version": "0.1.5",
        "package_hash": {
          "algorithm": "sha256",
          "value": "5a58024e2cc488ca9e0c952ec7ef41da3a1ed0a78ba23bacd819e5b30afb5546"
        }
      }
    ],
    "unvet": [
      {
        "package_id": "splice-amulet",
        "package_version": "0.1.15",
        "package_hash": {
          "algorithm": "sha256",
          "value": "..."
        }
      }
    ]
  }
}
```

#### App Provider README.md

The `README.md` should include a **Security Audits** section:

```markdown
## Security Audits

This package has been validated by the following security auditors:

| Version | Auditor | Date | Status | Report |
|---------|---------|------|--------|--------|
| 1.0.0 | Security Auditor Company | 2026-02-20 | ✓ Passed | [Audit Report](https://github.com/auditor/audit-reports/blob/main/reports/app-provider-name/1.0.0/audit-report.json) |
| 1.1.0 | Security Auditor Company | 2026-02-26 | ✓ Passed | [Audit Report](https://github.com/auditor/audit-reports/blob/main/reports/app-provider-name/1.1.0/audit-report.json) |
| 1.1.0 | AnotherAuditor | 2026-02-25 | ✓ Passed | [Audit Report](https://github.com/another-auditor/audits/blob/main/reports/app-provider/1.1.0/audit.json) |

**Note**: Audits are valid for one year from the date of issue.
```

### Component 2: Audit Request Protocol

#### Audit Request Format

When App Providers request an audit, they provide the following information:

```json
{
  "schema_version": "1.0",
  "request_id": "uuid-v4-identifier",
  "request_timestamp": "2026-02-27T00:00:00Z",
  "app_provider": {
    "name": "string",
    "email": "string",
    "organization": "string",
    "repository_url": "https://github.com/org/repo"
  },
  "package_information": {
    "package_id": "string",
    "package_name": "string",
    "version": "string",
    "package_hash": {
      "algorithm": "sha256",
      "value": "hex-encoded-hash"
    },
    "download_url": "https://github.com/org/repo/releases/download/v1.0.0/package.dar",
    "metadata_url": "https://raw.githubusercontent.com/org/repo/main/packages/v1.0.0/metadata.json"
  },
  "audit_scope": {
    "security_properties_to_verify": [
      "authorization_logic",
      "party_confidentiality",
      "contract_integrity",
      "dependency_safety",
      "daml_best_practices"
    ],
    "focus_areas": [
      "Custom authorization implementation",
      "Party-to-party data access control"
    ]
  },
  "timeline": {
    "requested_completion_date": "2026-03-27T00:00:00Z",
    "preferred_audit_start_date": "2026-03-01T00:00:00Z"
  }
}
```

### Component 3: Audit Result Publication

#### Security Auditor Repository Structure

Each Security Auditor maintains a public Git repository with published audit results:

```
security-auditor-reports/
├── README.md
├── reports/
│   ├── app-provider-name/
│   │   ├── 1.0.0/
│   │   │   ├── audit-report.json
│   │   │   ├── detailed-findings.md
│   │   │   └── evidence/
│   │   │       ├── code-sample-1.daml
│   │   │       └── analysis.md
│   │   └── 1.1.0/
│   │       └── audit-report.json
│   └── ...
└── index.json
```

#### Audit Report Format

```json
{
  "schema_version": "1.0",
  "audit_id": "uuid-v4-identifier",
  "audit_report_version": "1.0",
  "auditor": {
    "name": "string",
    "organization": "string",
    "email": "string",
    "public_key_id": "string",
    "repository_url": "https://github.com/auditor/audit-reports"
  },
  "package_under_review": {
    "package_id": "string",
    "package_name": "string",
    "version": "string",
    "package_hash": {
      "algorithm": "sha256",
      "value": "hex-encoded-hash"
    },
    "app_provider_name": "string",
    "app_provider_repository": "https://github.com/org/repo",
    "audit_request_url": "https://github.com/org/repo/issues/123"
  },
  "audit_metadata": {
    "audit_date": "2026-02-20T00:00:00Z",
    "audit_completion_date": "2026-02-26T00:00:00Z",
    "auditor_reviewer": "John Doe",
    "review_hours_spent": 45,
    "audit_scope": [
      "authorization_logic",
      "party_confidentiality",
      "contract_integrity",
      "dependency_safety",
      "daml_best_practices"
    ]
  },
  "overall_assessment": {
    "status": "passed|conditionally_passed|failed",
    "severity_rating": "none|low|medium|high|critical",
    "summary": "string",
    "recommendation": "recommended_for_production|acceptable_with_caveats|not_recommended"
  },
  "findings": [
    {
      "finding_id": "F001",
      "category": "authorization|confidentiality|integrity|dependency|best_practice|performance",
      "severity": "critical|high|medium|low|informational",
      "title": "string",
      "description": "string",
      "affected_components": [
        {
          "module": "App.Security.Authorization",
          "location": "line 42-58",
          "code_hash": "hex-encoded-hash"
        }
      ],
      "risk_assessment": "string",
      "remediation": "string",
      "remediation_status": "open|in_progress|resolved|accepted_risk",
      "evidence_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider/1.0.0/evidence/finding-F001.md"
    }
  ],
  "positives": [
    {
      "positive_id": "P001",
      "category": "security|best_practice|design|performance",
      "title": "string",
      "description": "string",
      "components_involved": ["module_name"]
    }
  ],
  "dependency_analysis": {
    "total_dependencies": 5,
    "dependencies_reviewed": [
      {
        "package_name": "string",
        "version": "string",
        "package_hash": "hex-encoded-hash",
        "security_status": "approved|warning|blocked",
        "notes": "string"
      }
    ],
    "transitive_risk_assessment": "string"
  },
  "reproducibility_verification": {
    "build_reproducible": true,
    "verification_status": "verified|failed|not_attempted",
    "verification_notes": "string",
    "reproduction_instructions_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider/1.0.0/reproducibility.md"
  },
  "compliance_checklist": {
    "daml_best_practices": true,
    "authorization_implemented": true,
    "party_confidentiality_maintained": true,
    "contract_invariants_preserved": true,
    "no_known_vulnerabilities": true,
    "dependencies_vetted": true
  },
  "validity": {
    "issued_date": "2026-02-26T00:00:00Z",
    "expiration_date": "2027-02-26T00:00:00Z",
    "audit_is_valid": true,
    "validity_notes": "string"
  },
  "signature": {
    "algorithm": "rsa-sha256|ecdsa-sha256",
    "public_key_id": "string",
    "signature_value": "hex-encoded-signature"
  },
  "additional_resources": {
    "detailed_findings_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider/1.0.0/detailed-findings.md",
    "evidence_artifacts_url": "https://github.com/auditor/audit-reports/tree/main/reports/app-provider/1.0.0/evidence"
  }
}
```

#### Security Auditor Index File

Each auditor maintains an `index.json` for discoverability:

```json
{
  "schema_version": "1.0",
  "auditor": {
    "name": "string",
    "organization": "string",
    "website": "https://example.com",
    "repository_url": "https://github.com/auditor/audit-reports",
    "contact_email": "audits@example.com"
  },
  "auditor_profile": {
    "daml_expertise_level": "expert|advanced|intermediate",
    "certifications": ["string"],
    "years_in_security": 10,
    "audit_methodology_url": "https://example.com/methodology"
  },
  "audit_statistics": {
    "total_audits_completed": 50,
    "packages_audited": 45,
    "audits_passed": 40,
    "audits_with_findings": 5,
    "audits_failed": 0
  },
  "recent_audits": [
    {
      "package_name": "string",
      "version": "string",
      "app_provider": "string",
      "audit_date": "2026-02-26T00:00:00Z",
      "status": "passed",
      "report_url": "https://github.com/auditor/audit-reports/blob/main/reports/app-provider/1.0.0/audit-report.json"
    }
  ]
}
```

### Component 4: Validator Node Provider Validation Process

#### Validator Node Provider Verification Procedure

Validator Node Providers implement the following process before integrating a third-party package:

```json
{
  "schema_version": "1.0",
  "verification_process": {
    "step_1_locate_package": {
      "description": "Find the package in the App Provider's apps/ directory",
      "checks": [
        "Package hash matches download",
        "Metadata.json is present and valid",
        "Repository is publicly accessible"
      ]
    },
    "step_2_gather_audits": {
      "description": "Fetch audit results from known auditors",
      "method": "Query audit-reports.json from the versioned package directory and fetch reports from referenced URLs"
    },
    "step_3_verify_audit_integrity": {
      "description": "Verify audit report signatures and validity",
      "checks": [
        "Report signature verifies against auditor's public key",
        "Audit is within validity period",
        "Package hash in audit matches actual package"
      ]
    },
    "step_4_assess_audit_results": {
      "description": "Analyze findings and make integration decision",
      "decision_matrix": {
        "status_passed_no_findings": "safe_for_integration",
        "status_passed_low_findings": "safe_with_monitoring",
        "status_passed_medium_findings": "requires_remediation_agreement",
        "status_failed": "do_not_integrate"
      }
    },
    "step_5_internal_verification": {
      "description": "Optional: perform own validation or use trusted auditor results",
      "options": [
        "self_audit",
        "trust_single_auditor",
        "require_multiple_audits",
        "combine_internal_and_external"
      ]
    }
  }
}
```

#### Validator Node Provider Integration Decision Document

Validator Node Providers maintain records of their integration decisions:

```json
{
  "schema_version": "1.0",
  "validator_node_provider": "string",
  "integration_decisions": [
    {
      "decision_id": "uuid-v4",
      "package_name": "string",
      "package_version": "string",
      "app_provider": "string",
      "decision_date": "2026-02-27T00:00:00Z",
      "decision": "integrated|rejected|conditionally_integrated",
      "integration_status": "active|suspended|deprecated",
      "decision_factors": {
        "audits_reviewed": 2,
        "audits_passed": 2,
        "critical_findings": 0,
        "high_findings": 0,
        "risk_assessment": "low",
        "trust_score": 0.95
      },
      "conditions": [
        "Quarterly re-audits required",
        "Must notify of major changes"
      ],
      "reviewed_by": "string",
      "decision_notes": "string"
    }
  ]
}
```

### Component 5: OCI Distribution (Optional)

As an alternative or complementary distribution method to Git, App Providers may publish their packages as OCI (Open Container Initiative) artifacts. This enables standard OCI registries to be used for storage and discovery.

#### OCI Artifact Mapping

Packages should be published to a registry at `oci://<registry>/<app-provider>/<package-name>:<version>`. The OCI artifact should contain the same file structure as the Git repository under the versioned package directory:

```
/
├── package.dar
├── metadata.json
├── audit-reports.json
└── build-config.json
```

#### OCI Annotations

To enable efficient discovery without downloading the entire artifact, key metadata from `metadata.json` should be mapped to OCI annotations:

```json
{
  "org.opencontainers.image.title": "splice-amulet",
  "org.opencontainers.image.version": "0.1.16",
  "org.opencontainers.image.licenses": "Apache-2.0",
  "org.opencontainers.image.vendor": "App Provider Name",
  "com.package.hash": "c208d7ead1e4e9b610fc2054d0bf00716144ad444011bce0b02dcd6cd0cb8a23",
  "com.sdk.version": "3.3.0",
  "com.security.properties": "{\"daml_stdlib_version\":\"3.3.0\",\"notable_modules\":[...]}",
  "com.audit.status": "passed"
}
```

### JSON Schemas

The following JSON schemas formally define the metadata formats used in this CIP:

- **Package Metadata**: `schemas/metadata.schema.json`
- **Build Configuration**: `schemas/build-config.schema.json`
- **Package Audit Reports**: `schemas/audit-reports.schema.json`
- **Application Vetting State**: `schemas/vetting-state.schema.json`
- **Audit Request**: `schemas/audit-request.schema.json`
- **Security Audit Report**: `schemas/audit-report.schema.json`
- **Security Auditor Index**: `schemas/auditor-index.schema.json`
- **Verification Procedure**: `schemas/verification-procedure.schema.json`
- **Integration Decision Document**: `schemas/integration-decision.schema.json`

## Motivation

As Daml applications and validator nodes proliferate in the Canton ecosystem, Validator Node Providers face a critical challenge: how to safely integrate third-party packages while maintaining security standards. Currently:

1. Each Validator Node Provider must either audit packages independently (expensive and duplicative) or trust App Providers without verification (risky)
2. Security audits lack standardization, making it difficult to compare results across different auditors
3. There is no transparent way for audits to be discovered and verified
4. Audit results cannot be reused across multiple Validator Node Providers, leading to wasted effort

This CIP solves these problems by establishing a transparent, standardized ecosystem where:

- App Providers clearly communicate what they're publishing and how it was built
- Security Auditors can publish results in verifiable repositories
- Validator Node Providers can discover and verify audits without conducting redundant validations
- All parties operate with cryptographic verification and transparency

In recent conversations between Digital Asset and wallet providers (both retail and enterprise) who host their own validator nodes, the following feedback was consistently communicated:

**Security Risks and Malicious Code**

Node operators are highly concerned about uploading malicious DAR files. There are two primary concerns here:

1. Risk to their validator and environment: They fear potential exploits and the risk that a DAR could break their validator. 

2. Risk to their end-users: unknowingly signing malicious transactions.
Node operators also want to ensure that source code which has been vetted equates exactly to the DAR files uploaded to their nodes.

**Version Control, Composability & Operational Overhead**
There is anxiety surrounding the continual maintenance and testing required for initial DARs and subsequent new versions. Providers specifically called out "version hell", the sparse matrix of version compatibility for composability, and how dependencies are handled and enforced.
Providers are concerned about the operational effort required to load DARs onto validators. They’d like this as automated as possible.

## Rationale

### Design Decisions

#### Why Git-based Publishing

Git provides:
- **Cryptographic verification** via commit signatures
- **Immutable audit trails** of all changes
- **Decentralized distribution** without single points of failure
- **Familiar tooling** for developers and organizations
- **Cost effectiveness** using free services like GitHub

#### Why JSON for Metadata

JSON provides:
- **Human readability** for transparency
- **Machine parsability** for automation
- **Wide tool support** across ecosystems
- **Schema validation** capabilities
- **Extensibility** through standard mechanisms (schema versioning)

#### Why No Centralized Registry

We reject a centralized audit registry because:
- Introduces a single point of failure
- Requires governance overhead
- Creates unnecessary trust bottleneck
- Contradicts the distributed nature of Canton

#### Why Standardized vs. Custom Formats

Standardization enables:
- **Validator node software** to parse any auditor's reports
- **Auditors** to focus on security analysis, not format design
- **Cross-auditor comparison** without custom integration
- **Reduced friction** for all participants

#### Why Audit Expiration

Audit expiration (1 year) is necessary because:
- **Code evolves** and old audits become less relevant
- **Vulnerabilities are discovered** over time
- **Dependencies may have security updates** that weren't audited
- **Standards improve** and old audits may not cover new best practices
- Encourages **continuous security engagement**

### Alternatives Considered

#### Centralized Smart Contract Registry

A smart contract on Canton could store all audit results. We rejected this because:
- Adds unnecessary on-ledger traffic costs
- Creates governance complexity
- Forces all participants to trust the registry operator
- Less suitable for immutable, long-lived audit trails
- Privacy concerns with on-ledger audit records

#### OAuth/Authentication for APIs

We do not require authentication on audit result URLs because:
- All data is expected to be public
- Package hashes are part of the publicly available topology state
- Authentication adds operational complexity for auditors
- Validator node software would need credential management
- Decentralized auditors may not have unified authentication

#### Single Standardized Audit Template

We provide flexibility in audit findings because:
- Different auditors have different expertise and methodologies
- Findings should be tailored to the package's specific risks
- Overly rigid templates lead to lower quality audits
- Standard provides sufficient structure (schema) while allowing content flexibility

## Backwards Compatibility

This is a new standard introducing no backwards compatibility concerns. All participants can adopt it incrementally:

- App Providers can begin publishing metadata without affecting existing processes
- Security Auditors can start using the standard format for new audits
- Validator Node Providers can adopt verification procedures at their own pace

Existing packages without audits remain usable; Validator Node Providers simply cannot leverage audit information for integration decisions.

## Implementation

An implementation of this standard should include:

1. **App Provider tooling**:
   - CLI tool to generate `metadata.json` and `build-config.json` from .dar files
   - Validation scripts to verify JSON schema compliance
   - Documentation for setting up audit requests

2. **Security Auditor tooling**:
   - Templates for `audit-report.json` generation
   - Signature generation and verification utilities
   - Batch reporting tools for multiple packages

3. **Validator Node Provider tooling**:
   - Library to fetch and verify audit reports
   - Decision engine implementing verification procedures
   - UI components for displaying audit results to users

4. **Common utilities**:
   - JSON schema validators for all formats
   - Hash verification utilities (SHA-256)
   - Cryptographic signature verification (RSA-SHA256, ECDSA-SHA256)
   - Command-line tools for repository validation



## Changelog

* **2026-03-05:** Initial Draft
