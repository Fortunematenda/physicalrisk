# Validation Report

## Source methodology coverage

The project seed was generated from the supplied SCLI v1.1 workbook.

| Item | Count |
|---|---:|
| Calibration inputs | 23 |
| Executive questions | 20 |
| Controlled response options | 93 |
| Model assumptions | 33 |
| Recommendation rules | 9 |
| Total questionnaire weight | 157 |

## Workbook parity test

The application formulas were independently recalculated using the example values and selected responses contained in the supplied workbook. The outputs match the workbook's cached calculation values.

| Output | Application calculation | Workbook value | Difference |
|---|---:|---:|---:|
| Overall SCLI risk score | 71.3057324841 | 71.3057324841 | 0 |
| Minimum leakage rate | 5.8631230032% | 5.8631230032% | 0 |
| Likely leakage rate | 12.0000000000% | 12.0000000000% | 0 |
| Maximum exposure rate | 20.0000000000% | 20.0000000000% | 0 |
| Minimum leakage value | R28,142,990.42 | R28,142,990.42 | R0.00 |
| Likely leakage value | R57,600,000.00 | R57,600,000.00 | R0.00 |
| Maximum exposure value | R96,000,000.00 | R96,000,000.00 | R0.00 |
| Methodology confidence | 53.7500000000% | 53.7500000000% | floating-point epsilon only |
| Recoverable low | R12,664,345.69 | R12,664,345.69 | R0.00 |
| Recoverable high | R37,440,000.00 | R37,440,000.00 | R0.00 |

## Source validation performed

- All JSON files parse successfully.
- All TypeScript and TSX files parse with zero syntax diagnostics.
- The shared scoring and leakage library compiles with the installed TypeScript compiler.
- Published methodology versions are immutable after initial seeding.
- Evidence, reports and CRM synchronisation perform assessment access checks.
- Docker build stages build the shared package before the API and web applications.

## Environment limitation

A complete dependency installation and Docker image build could not be executed in the artifact environment because outbound access to the npm registry was unavailable. The repository includes pinned package ranges, Dockerfiles and deployment instructions for validation on the target VPS or a connected development workstation.
