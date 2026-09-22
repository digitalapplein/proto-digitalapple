# Trigger Render deploy after git push. Requires RENDER_API_KEY and RENDER_PROTO_SERVICE_ID env vars.
param(
  [string]$ServiceId = $env:RENDER_PROTO_SERVICE_ID,
  [string]$ApiKey = $env:RENDER_API_KEY
)

if (-not $ApiKey) { throw "Set RENDER_API_KEY (never commit the key to git)" }
if (-not $ServiceId) { throw "Set RENDER_PROTO_SERVICE_ID (srv-... from Render dashboard)" }

$h = @{
  Authorization = "Bearer $ApiKey"
  Accept        = "application/json"
  "Content-Type" = "application/json"
}
$body = '{"clearCache":"clear"}'
$r = Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Headers $h -Body $body
Write-Host "Deploy started: $($r.id) status=$($r.status)"
