# CLI Workflow Reference

This packaged document is the compact workflow, output, and freshness
reference for public commands and review evidence.

## Configured reports

Configured commands discover the nearest `unslide.json` from the current
directory or its parents.

| Command                        | Reads                                | Publishes                              | Freshness behavior                                    |
| ------------------------------ | ------------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `unslide`                      | project configuration and path state | nothing                                | observes paths only                                   |
| `unslide report <name>`        | one report's path state              | nothing                                | observes paths only                                   |
| `unslide build <name>`         | report source                        | standalone HTML                        | evaluates current source                              |
| `unslide inspect <name>`       | existing HTML                        | nothing                                | never rebuilds HTML                                   |
| `unslide capture <name>`       | existing HTML                        | managed HTML page PNGs                 | never rebuilds HTML                                   |
| `unslide export <name>`        | existing HTML                        | validated PDF                          | never rebuilds HTML                                   |
| `unslide inspect-pdf <name>`   | existing PDF                         | managed PDF page PNGs                  | never exports PDF                                     |
| `unslide review <name>`        | report source                        | HTML, HTML captures, manifest          | rebuilds HTML in this invocation                      |
| `unslide review <name> --pdf`  | report source                        | HTML, both capture sets, PDF, manifest | derives every recorded artifact from the rebuilt HTML |
| `unslide review --all [--pdf]` | all configured reports               | each report's requested outputs        | runs reports independently in lexical order           |

Use `--page-id <id>` or one-based `--page-number <number>` with `capture` or a
single-report `review`. Use one-based `--page-number` with `inspect-pdf`.
Selection limits rasterization, not validation. A focused run replaces the
managed `page-*.png` set with exactly the selected scope.

`review` publishes its manifest last. If a later step fails, earlier successful
steps may already be published while the previous manifest remains unchanged.
Verify the manifest's bytes and SHA-256 evidence before trusting an older
manifest after failure.

## Standalone artifacts

These forms require no project and resolve relative paths from the invocation
directory:

```sh
unslide inspect --artifact report.html
unslide capture --artifact report.html --output .tmp/html-pages
unslide export --artifact report.html --output artifacts/report.pdf
unslide inspect-pdf --artifact artifacts/report.pdf --output .tmp/pdf-pages
```

Capture and PDF inspection also accept page selectors. Artifact capture and
export apply the same whole-input validation, readiness, geometry, canonical
input/output separation, symlink-overlap protection, and transactional
publication guarantees as configured reports.

## Output and exit status

Every invocation writes exactly one result-schema-v1 document plus a newline.
TOON is the default; add `--format json` anywhere in the invocation for compact
JSON. Both encodings contain the same semantic envelope and direct absolute
paths.

| Exit | Meaning                     |
| ---- | --------------------------- |
| `0`  | success or idempotent no-op |
| `1`  | operational failure         |
| `2`  | invalid command usage       |

Default stderr is empty. `--log-level info|debug` writes sensitive JSON Lines
diagnostics to stderr. `--full` expands bounded authored diagnostics only on
commands that accept it; it never exposes raw dependency causes.

## What evidence means

- Path timestamps from home or `report` are observations, not dependency
  freshness claims.
- Primitive commands consume existing upstream artifacts and do not rebuild
  them.
- Successful `review` binds captured evidence to HTML rebuilt in that
  invocation by exact hashes.
- Successful PDF export proves structural delivery invariants, not visual
  fidelity.
- Review manifests and command results are evidence, not acceptance decisions.
  Inspect every selected HTML image and every selected PDF-native image.
