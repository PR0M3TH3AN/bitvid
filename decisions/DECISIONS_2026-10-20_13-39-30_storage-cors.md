# storage-cors-1 proposed semantics (awaiting dispatch)
- Preserve every existing rule and field; do not union new origins into arbitrary rules (would grant their permissions to new origins).
- Read existing policy before writing; only explicit NoSuchCORSConfiguration indicates absent policy. Other failures propagate without PUT.
- Add the existing default rule for newly requested origins separately. Skip PUT when equivalent existing default rules already cover every requested origin.
- Preserve wildcard rules verbatim; never infer extra methods/headers or edit unknown fields. Exact equivalence/coverage details require routing before implementation.
- No dependencies/SDK version change. Inspect SDK export read-only until routing.
