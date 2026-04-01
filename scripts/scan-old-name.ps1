# scripts/scan-old-name.ps1
# Scan project for old app name leftovers (Photo to PDF variants)

$patterns = @(
    "Photo to PDF",
    "PhotoToPDF",
    "phototopdf",
    "photo-to-pdf",
    "photo_to_pdf",
    "photo2pdf"
)

Write-Host ""
Write-Host "Scanning for old app name leftovers..."
Write-Host ""

$total = 0

foreach ($pattern in $patterns) {
    $result = git grep -n -i "$pattern" 2>$null
    if ($LASTEXITCODE -eq 0 -and $result) {
        Write-Host "=== Matches for: $pattern ==="
        Write-Host $result
        Write-Host ""
        $total += ($result | Measure-Object -Line).Lines
    }
}

if ($total -eq 0) {
    Write-Host "No old app name references found. Clean!"
} else {
    Write-Host ""
    Write-Host "Total matches found: $total"
}
