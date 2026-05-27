# Inputs and Flags

V1 supports `string`, `boolean`, and `enum` inputs.

String and enum inputs use `--name=value`. Boolean inputs accept `--flag`,
`--flag=true`, and `--flag=false`.

Skillrouter rejects unknown flags, duplicate flags, `--no-flag`, bare string or
enum flags, invalid enum values, and empty string or enum values.

<Example id="boolean-bare" />
<Example id="invalid-enum-value" />
