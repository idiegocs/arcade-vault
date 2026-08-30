$json = [Console]::In.ReadToEnd() | ConvertFrom-Json
$file = $json.tool_input.file_path
if (-not $file -or -not (Test-Path -LiteralPath $file)) { exit 0 }

if ($file -match '\.(tsx|ts|jsx|js|mjs|cjs|md|mdx)$') {
    npx prettier --write --ignore-unknown -- $file *> $null
}
if ($file -match '\.(tsx|ts|jsx|js|mjs|cjs)$') {
    npx eslint --fix -- $file *> $null
}
exit 0
