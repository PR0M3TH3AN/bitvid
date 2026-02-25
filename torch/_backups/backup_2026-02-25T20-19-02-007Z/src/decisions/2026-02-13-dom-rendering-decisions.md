# Decisions (Example)

- **Decision:** Replace string-based DOM rendering with explicit element creation APIs.
- **Alternatives considered:** Keep existing template string rendering with additional escaping.
- **Rationale:** Reduces injection risk and improves maintainability.
- **Consequences:** Requires small helper methods and minor test updates.
