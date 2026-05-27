# Includes

`include` reads another file and processes Skillrouter syntax inside it.
`include-raw` reads another file literally without evaluating directives or
interpolation.

Include paths are relative to the file containing the directive. Skillrouter
rejects absolute paths, `~`, paths escaping the project root, `.env`, and
`.env.*`.

<Example id="include-fragment" />
<Example id="include-raw" />
<Example id="include-env-rejected" />
