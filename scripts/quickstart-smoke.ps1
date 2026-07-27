$ErrorActionPreference = "Stop"

function Get-DotEnvValue {
  param([string]$Name, [string]$Default)
  $line = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return $Default }
  return ($line -split "=", 2)[1]
}

function Split-CurlResponse {
  param([string[]]$Response)
  if (-not $Response -or $Response.Count -lt 1) { throw "curl returned an empty response." }
  $statusCode = [int]$Response[-1]
  $body = ($Response | Select-Object -SkipLast 1) -join "`n"
  return @{ StatusCode = $statusCode; Body = $body }
}

function Invoke-CurlGet {
  param([string]$Uri, [hashtable]$Headers = @{})
  $args = @("-sS", "-w", "`n%{http_code}")
  foreach ($header in $Headers.GetEnumerator()) { $args += @("-H", "$($header.Key): $($header.Value)") }
  $args += $Uri
  return Split-CurlResponse -Response (& curl.exe @args)
}

function Invoke-CurlPostJson {
  param([string]$Uri, [hashtable]$Headers, [string]$Body)
  $args = @("-sS", "-w", "`n%{http_code}", "-X", "POST")
  foreach ($header in $Headers.GetEnumerator()) { $args += @("-H", "$($header.Key): $($header.Value)") }
  $args += @("--data-binary", "@-", $Uri)
  return Split-CurlResponse -Response ($Body | & curl.exe @args)
}

$apiPort = Get-DotEnvValue -Name "API_PORT" -Default "3000"
$workerMetricsPort = Get-DotEnvValue -Name "WORKER_METRICS_PORT" -Default "9091"
$apiBaseUrl = "http://localhost:$apiPort"
$workerMetricsUrl = "http://localhost:$workerMetricsPort/metrics"
$requestId = [guid]::NewGuid().ToString()
$correlationId = [guid]::NewGuid().ToString()
$idempotencyKey = [guid]::NewGuid().ToString()

Write-Host "Checking Docker Compose services..."
$composeServices = docker compose ps --format json | ConvertFrom-Json
foreach ($serviceName in @("postgres", "redis", "rabbitmq", "api", "worker")) {
  $service = $composeServices | Where-Object { $_.Service -eq $serviceName } | Select-Object -First 1
  if (-not $service) { throw "Docker Compose service $serviceName was not found. Run docker compose up --build --wait first." }
  if ($service.State -ne "running") { throw "Docker Compose service $serviceName is not running. Current state: $($service.State)" }
}

$traceHeaders = @{ "x-request-id" = $requestId; "x-correlation-id" = $correlationId }

Write-Host "Requesting catalog..."
$productsResponse = Invoke-CurlGet -Uri "$apiBaseUrl/products" -Headers $traceHeaders
if ($productsResponse.StatusCode -eq 204) { throw "Catalog returned 204. Smoke expects seeded products from docker compose migrate." }
if ($productsResponse.StatusCode -ne 200) { throw "Catalog returned unexpected status $($productsResponse.StatusCode): $($productsResponse.Body)" }
$products = $productsResponse.Body | ConvertFrom-Json
if (-not $products -or $products.Count -lt 1) { throw "Catalog returned no products." }
$product = $products | Where-Object { $_.availableQuantity -ge 1 } | Select-Object -First 1
if (-not $product) { throw "Catalog has no available product for checkout smoke." }

$checkoutPayload = @{ items = @(@{ productId = $product.id; quantity = 1 }) } | ConvertTo-Json -Depth 5 -Compress
$checkoutHeaders = @{
  "content-type" = "application/json"
  "idempotency-key" = $idempotencyKey
  "x-request-id" = $requestId
  "x-correlation-id" = $correlationId
}

Write-Host "Starting checkout..."
$checkoutResponseRaw = Invoke-CurlPostJson -Uri "$apiBaseUrl/checkout" -Headers $checkoutHeaders -Body $checkoutPayload
if ($checkoutResponseRaw.StatusCode -ne 202) { throw "Checkout returned unexpected status $($checkoutResponseRaw.StatusCode): $($checkoutResponseRaw.Body)" }
$checkoutResponse = $checkoutResponseRaw.Body | ConvertFrom-Json
if (-not $checkoutResponse.orderId) { throw "Checkout response did not include orderId." }

Write-Host "Replaying idempotent checkout..."
$replayResponseRaw = Invoke-CurlPostJson -Uri "$apiBaseUrl/checkout" -Headers $checkoutHeaders -Body $checkoutPayload
if ($replayResponseRaw.StatusCode -ne 202) { throw "Idempotency replay returned unexpected status $($replayResponseRaw.StatusCode): $($replayResponseRaw.Body)" }
$replayResponse = $replayResponseRaw.Body | ConvertFrom-Json
if ($replayResponse.orderId -ne $checkoutResponse.orderId) { throw "Idempotency replay returned a different orderId." }

Write-Host "Checking order status..."
$statusResponseRaw = Invoke-CurlGet -Uri "$apiBaseUrl/orders/$($checkoutResponse.orderId)/status" -Headers $traceHeaders
if ($statusResponseRaw.StatusCode -ne 200) { throw "Status returned unexpected status $($statusResponseRaw.StatusCode): $($statusResponseRaw.Body)" }
$statusResponse = $statusResponseRaw.Body | ConvertFrom-Json
if ($statusResponse.orderId -ne $checkoutResponse.orderId) { throw "Status response returned a different orderId." }
if (@("pending", "processing", "retrying", "confirmed", "failed") -notcontains $statusResponse.status) { throw "Status response returned invalid status $($statusResponse.status)." }

Write-Host "Checking metrics endpoints..."
$apiMetricsResponse = Invoke-CurlGet -Uri "$apiBaseUrl/metrics"
if ($apiMetricsResponse.StatusCode -ne 200) { throw "API metrics returned unexpected status $($apiMetricsResponse.StatusCode)." }
$workerMetricsResponse = Invoke-CurlGet -Uri $workerMetricsUrl -Headers $traceHeaders
if ($workerMetricsResponse.StatusCode -ne 200) { throw "Worker metrics returned unexpected status $($workerMetricsResponse.StatusCode)." }

Write-Host "Smoke completed successfully."
Write-Host "orderId=$($checkoutResponse.orderId) status=$($statusResponse.status) productId=$($product.id)"
