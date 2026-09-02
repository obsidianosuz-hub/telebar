# Telebar Windows Desktop Installer
$url = "http://192.168.100.37:5174"
$exeUrl = "$url/telebar.exe"
$localDir = "$env:LOCALAPPDATA\Telebar"
$exePath = "$localDir\telebar.exe"
$shortcutPath = "$env:USERPROFILE\Desktop\Telebar.lnk"

# Create installation folder
if (!(Test-Path $localDir)) {
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
}

# Download the compiled launcher executable bypassing browser warning
Write-Host "Downloading Telebar Desktop Client..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $exeUrl -OutFile $exePath -UseBasicParsing

# Register Desktop Shortcut via COM
Write-Host "Registering Desktop Shortcut..." -ForegroundColor Cyan
$wshell = New-Object -ComObject Wscript.Shell
$shortcut = $wshell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $localDir
$shortcut.Description = "Telebar Desktop Application"
$shortcut.Save()

Write-Host "Telebar Desktop has been successfully installed on your system!" -ForegroundColor Green
Write-Host "Launching Telebar..." -ForegroundColor Yellow

# Start the launcher
Start-Process -FilePath $exePath
