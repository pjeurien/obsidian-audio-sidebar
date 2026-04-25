# Get the version number from the user
$version = Read-Host "Enter version number (e.g., 1.0.1)"

if (-not $version) {
    Write-Host "Version cannot be empty. Exiting." -ForegroundColor Red
    exit
}

Write-Host "Updating manifest.json to version $version..." -ForegroundColor Cyan

# Update the version inside manifest.json automatically
$manifestPath = "./manifest.json"
if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath | ConvertFrom-Json
    $manifest.version = $version
    $manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath
} else {
    Write-Host "manifest.json not found!" -ForegroundColor Yellow
}

# Git Commands
Write-Host "Staging changes..." -ForegroundColor Cyan
git add .

Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "Prepare release $version"

Write-Host "Pushing to main..." -ForegroundColor Cyan
git push origin main

Write-Host "Creating tag $version..." -ForegroundColor Cyan
git tag $version

Write-Host "Pushing tag to trigger GitHub Action..." -ForegroundColor Cyan
git push origin $version

Write-Host "Done! Check your GitHub Actions tab for the build status." -ForegroundColor Green
