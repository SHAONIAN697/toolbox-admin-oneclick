param(
  [string]$Url = "http://localhost:5088/",
  [string]$AdminToken = $env:TOOLBOX_ADMIN_TOKEN
)

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  $AdminToken = "dev-token"
}

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WwwRoot = Join-Path $Root "wwwroot"
$DataDir = Join-Path $Root "data"
$ConfigPath = Join-Path $DataDir "config.json"
$UsersPath = Join-Path $DataDir "users.json"
$UserTemplatePath = Join-Path $DataDir "user-template.json"
$UserDataDir = Join-Path $DataDir "users"
$ClientTemplateDir = Join-Path $Root "client-template"
$Sessions = @{}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null

function New-DefaultConfig {
  return @{
    app = @{
      title = "Toolbox"
      subtitle = ""
      version = "V1.0"
      logo_text = "Y"
      window_width = 1080
      window_height = 700
      password = ""
      theme = "glacier"
      bg_path = ""
      output_dir = ""
    }
    license = @{
      enabled = $false
      api_base = ""
      product_code = ""
    }
    sidebar = @()
    toolbox_tabs = @()
    pages = @{}
  }
}

if (!(Test-Path -LiteralPath $ConfigPath)) {
  New-DefaultConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Read-BodyText {
  param([System.Net.HttpListenerRequest]$Request)
  $buffer = [IO.MemoryStream]::new()
  try {
    $Request.InputStream.CopyTo($buffer)
    return [Text.Encoding]::UTF8.GetString($buffer.ToArray())
  } finally {
    $buffer.Dispose()
  }
}

function Read-JsonBody {
  param([System.Net.HttpListenerRequest]$Request)
  $text = Read-BodyText $Request
  if ([string]::IsNullOrWhiteSpace($text)) { return [pscustomobject]@{} }
  $parsed = $text | ConvertFrom-Json
  if ($parsed -is [string]) {
    return $parsed | ConvertFrom-Json
  }
  return $parsed
}

function Get-UserConfigPath {
  param([string]$UserId)
  if ([string]::IsNullOrWhiteSpace($UserId)) {
    return $ConfigPath
  }

  $safe = ($UserId -replace '[^a-zA-Z0-9_\-]', '_')
  $dir = Join-Path $UserDataDir $safe
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  return (Join-Path $dir "config.json")
}

function Read-Config {
  param([string]$UserId = "")
  $path = Get-UserConfigPath $UserId
  if (!(Test-Path -LiteralPath $path)) {
    if (![string]::IsNullOrWhiteSpace($UserId) -and (Test-Path -LiteralPath $UserTemplatePath)) {
      Copy-Item -LiteralPath $UserTemplatePath -Destination $path -Force
    } elseif (Test-Path -LiteralPath $ConfigPath) {
      Copy-Item -LiteralPath $ConfigPath -Destination $path -Force
    } else {
      New-DefaultConfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding UTF8
    }
  }
  return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-Config {
  param($Config, [string]$UserId = "")
  $path = Get-UserConfigPath $UserId
  $tmp = "$path.tmp"
  $Config | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Read-UserTemplateConfig {
  if (!(Test-Path -LiteralPath $UserTemplatePath)) {
    Write-UserTemplateConfig (New-DefaultConfig)
  }
  return (Get-Content -LiteralPath $UserTemplatePath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-UserTemplateConfig {
  param($Config)
  $tmp = "$UserTemplatePath.tmp"
  $Config | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $UserTemplatePath -Force
}

function Test-ShouldSyncDefaultConfig {
  param($Actor, [string]$UserId)
  if ($null -eq $Actor -or $Actor.role -ne "super") { return $false }
  $target = Find-UserById $UserId
  return ($null -ne $target -and $target.role -eq "super")
}

function Write-ConfigForActor {
  param($Config, [string]$UserId = "", $Actor = $null)
  Write-Config $Config $UserId
}

function Send-Bytes {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [byte[]]$Bytes,
    [string]$ContentType = "application/octet-stream",
    [int]$StatusCode = 200
  )
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Response.Headers["Access-Control-Allow-Headers"] = "Authorization, X-Admin-Token, Content-Type"
  $Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  $Response.ContentLength64 = $Bytes.Length
  if ($Bytes.Length -gt 0) {
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  }
  $Response.OutputStream.Close()
}

function Send-Text {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [string]$Text,
    [string]$ContentType = "text/plain; charset=utf-8",
    [int]$StatusCode = 200
  )
  Send-Bytes $Response ([Text.Encoding]::UTF8.GetBytes($Text)) $ContentType $StatusCode
}

function Send-Json {
  param(
    [System.Net.HttpListenerResponse]$Response,
    $Value,
    [int]$StatusCode = 200
  )
  $json = $Value | ConvertTo-Json -Depth 100
  Send-Text $Response $json "application/json; charset=utf-8" $StatusCode
}

function Send-DownloadBytes {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [byte[]]$Bytes,
    [string]$FileName,
    [string]$ContentType = "application/octet-stream"
  )
  $safeName = $FileName -replace '[\r\n"]', "_"
  $Response.Headers["Content-Disposition"] = "attachment; filename=`"$safeName`""
  Send-Bytes $Response $Bytes $ContentType 200
}

function Test-Authorized {
  param([System.Net.HttpListenerRequest]$Request)
  $auth = $Request.Headers["Authorization"]
  $headerToken = $Request.Headers["X-Admin-Token"]
  $queryToken = $Request.QueryString["token"]
  return ($auth -eq "Bearer $AdminToken") -or ($headerToken -eq $AdminToken) -or ($queryToken -eq $AdminToken)
}

function Get-Text {
  param($Object, [string]$Name, [string]$Default = "")
  if ($null -eq $Object) { return $Default }
  if ($Object.PSObject.Properties.Name -contains $Name -and $null -ne $Object.$Name) {
    return [string]$Object.$Name
  }
  return $Default
}

function Get-Int {
  param($Object, [string]$Name, [int]$Default = 0)
  if ($null -eq $Object) { return $Default }
  if ($Object.PSObject.Properties.Name -contains $Name -and $null -ne $Object.$Name) {
    return [int]$Object.$Name
  }
  return $Default
}

function Get-Target {
  param($Button)
  $action = (Get-Text $Button "action" "link").ToLowerInvariant()
  switch ($action) {
    "script" { return Get-Text $Button "script" }
    "cmd" { return Get-Text $Button "command" }
    "winget" {
      $v = Get-Text $Button "winget"
      if ($v) { return $v }
      $v = Get-Text $Button "package"
      if ($v) { return $v }
      return Get-Text $Button "command"
    }
    default {
      $v = Get-Text $Button "url"
      if ($v) { return $v }
      return Get-Text $Button "command"
    }
  }
}

function New-ButtonObject {
  param($Source)
  $name = (Get-Text $Source "name").Trim()
  if (!$name) { throw "button.name is required." }

  $action = (Get-Text $Source "action" "link").Trim().ToLowerInvariant()
  $target = (Get-Text $Source "target").Trim()
  $button = [ordered]@{
    name = $name
    action = $action
  }

  if ($Source.PSObject.Properties.Name -contains "icon" -and $null -ne $Source.icon) {
    $button.icon = $Source.icon
  }

  switch ($action) {
    "script" {
      $v = Get-Text $Source "script"
      if (!$v) { $v = $target }
      $button.script = $v
    }
    "cmd" {
      $v = Get-Text $Source "command"
      if (!$v) { $v = $target }
      $button.command = $v
    }
    "winget" {
      $v = Get-Text $Source "winget"
      if (!$v) { $v = Get-Text $Source "package" }
      if (!$v) { $v = Get-Text $Source "command" }
      if (!$v) { $v = $target }
      $button.winget = $v
    }
    default {
      $v = Get-Text $Source "url"
      if (!$v) { $v = $target }
      if (!$v) { $v = Get-Text $Source "command" }
      $button.url = $v
    }
  }

  return [pscustomobject]$button
}

function Get-ButtonCollection {
  param($Config, $Request, [switch]$RequireButtonIndex)

  $scope = (Get-Text $Request "scope" "page").Trim().ToLowerInvariant()
  $sectionIndex = Get-Int $Request "sectionIndex"

  if ($scope -eq "toolbox") {
    $tabIndex = Get-Int $Request "tabIndex"
    if ($tabIndex -lt 0 -or $tabIndex -ge $Config.toolbox_tabs.Count) {
      throw "tabIndex is out of range."
    }
    $container = $Config.toolbox_tabs[$tabIndex]
  } else {
    $pageId = Get-Text $Request "pageId"
    if (!$pageId) { throw "pageId is required." }
    if (!($Config.pages.PSObject.Properties.Name -contains $pageId)) {
      throw "pageId '$pageId' was not found."
    }
    $container = $Config.pages.$pageId
  }

  if ($sectionIndex -lt 0 -or $sectionIndex -ge $container.sections.Count) {
    throw "sectionIndex is out of range."
  }

  $section = $container.sections[$sectionIndex]
  if (!($section.PSObject.Properties.Name -contains "buttons") -or $null -eq $section.buttons) {
    $section | Add-Member -NotePropertyName buttons -NotePropertyValue @() -Force
  }

  if ($RequireButtonIndex) {
    $buttonIndex = Get-Int $Request "buttonIndex"
    if ($buttonIndex -lt 0 -or $buttonIndex -ge $section.buttons.Count) {
      throw "buttonIndex is out of range."
    }
  }

  return $section
}

function Get-ButtonRows {
  param($Config)
  $rows = New-Object System.Collections.Generic.List[object]

  foreach ($pageProp in $Config.pages.PSObject.Properties) {
    $pageId = $pageProp.Name
    $page = $pageProp.Value
    $area = Get-Text $page "title" $pageId
    for ($sectionIndex = 0; $sectionIndex -lt $page.sections.Count; $sectionIndex++) {
      $section = $page.sections[$sectionIndex]
      $sectionTitle = Get-Text $section "title"
      if (!($section.PSObject.Properties.Name -contains "buttons") -or $null -eq $section.buttons) { continue }
      for ($buttonIndex = 0; $buttonIndex -lt $section.buttons.Count; $buttonIndex++) {
        $button = $section.buttons[$buttonIndex]
        $action = Get-Text $button "action" "link"
        $rows.Add([pscustomobject]@{
          scope = "page"
          pageId = $pageId
          tabIndex = $null
          sectionIndex = $sectionIndex
          buttonIndex = $buttonIndex
          area = $area
          section = $sectionTitle
          name = Get-Text $button "name"
          icon = Get-Text $button "icon"
          action = $action
          target = Get-Target $button
          raw = $button
        })
      }
    }
  }

  if ($Config.PSObject.Properties.Name -contains "toolbox_tabs" -and $null -ne $Config.toolbox_tabs) {
    for ($tabIndex = 0; $tabIndex -lt $Config.toolbox_tabs.Count; $tabIndex++) {
      $tab = $Config.toolbox_tabs[$tabIndex]
      $area = Get-Text $tab "name" "Toolbox $($tabIndex + 1)"
      for ($sectionIndex = 0; $sectionIndex -lt $tab.sections.Count; $sectionIndex++) {
        $section = $tab.sections[$sectionIndex]
        $sectionTitle = Get-Text $section "title"
        if (!($section.PSObject.Properties.Name -contains "buttons") -or $null -eq $section.buttons) { continue }
        for ($buttonIndex = 0; $buttonIndex -lt $section.buttons.Count; $buttonIndex++) {
          $button = $section.buttons[$buttonIndex]
          $action = Get-Text $button "action" "link"
          $rows.Add([pscustomobject]@{
            scope = "toolbox"
            pageId = $null
            tabIndex = $tabIndex
            sectionIndex = $sectionIndex
            buttonIndex = $buttonIndex
            area = $area
            section = $sectionTitle
            name = Get-Text $button "name"
            icon = Get-Text $button "icon"
            action = $action
            target = Get-Target $button
            raw = $button
          })
        }
      }
    }
  }

  return $rows
}

function New-StoredPassword {
  param([string]$Password)
  $bytes = New-Object byte[] 16
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $salt = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
  $sha = [Security.Cryptography.SHA256]::Create()
  $hashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($salt + $Password))
  $hash = ([BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  return "sha256`$$salt`$$hash"
}

function Test-StoredPassword {
  param([string]$Password, [string]$Stored)
  if ([string]::IsNullOrWhiteSpace($Stored)) { return $false }
  $parts = $Stored -split '\$'
  if ($parts.Count -ne 3 -or $parts[0] -ne "sha256") { return $false }
  $sha = [Security.Cryptography.SHA256]::Create()
  $hashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($parts[1] + $Password))
  $hash = ([BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  return $hash -eq $parts[2]
}

function New-RandomHex {
  param([int]$Bytes = 24)
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return ([BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
}

function Read-Users {
  if (!(Test-Path -LiteralPath $UsersPath)) {
    return [pscustomobject]@{ users = @(); inviteCodes = @() }
  }

  $store = Get-Content -LiteralPath $UsersPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (!($store.PSObject.Properties.Name -contains "users") -or $null -eq $store.users) {
    $store | Add-Member -NotePropertyName users -NotePropertyValue @() -Force
  }
  if (!($store.PSObject.Properties.Name -contains "inviteCodes") -or $null -eq $store.inviteCodes) {
    $store | Add-Member -NotePropertyName inviteCodes -NotePropertyValue @() -Force
  }
  return $store
}

function Write-Users {
  param($Store)
  $tmp = "$UsersPath.tmp"
  $Store | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $UsersPath -Force
}

function Get-UsersArray {
  param($Store)
  return @($Store.users)
}

function Get-InviteCodesArray {
  param($Store)
  return @($Store.inviteCodes)
}

function Find-UserById {
  param([string]$UserId)
  $store = Read-Users
  return (Get-UsersArray $store | Where-Object { $_.id -eq $UserId } | Select-Object -First 1)
}

function Find-UserByUsername {
  param([string]$Username)
  $store = Read-Users
  return (Get-UsersArray $store | Where-Object { $_.username -eq $Username } | Select-Object -First 1)
}

function Ensure-UserApiKey {
  param([string]$UserId)
  $store = Read-Users
  $users = Get-UsersArray $store
  $user = $users | Where-Object { $_.id -eq $UserId } | Select-Object -First 1
  if ($null -eq $user) { return $null }
  if ([string]::IsNullOrWhiteSpace([string]$user.apiKey)) {
    $user | Add-Member -NotePropertyName apiKey -NotePropertyValue (New-RandomHex 20) -Force
    $store.users = @($users)
    Write-Users $store
  }
  return $user
}

function New-UserAccount {
  param(
    [string]$Username,
    [string]$Password,
    [string]$DisplayName = "",
    [string]$Role = "user",
    $TemplateUser = $null
  )

  $username = ([string]$Username).Trim()
  $password = [string]$Password
  $displayName = ([string]$DisplayName).Trim()
  $role = ([string]$Role).Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($displayName)) { $displayName = $username }
  if ($role -ne "super") { $role = "user" }
  if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
    throw "Username and password are required."
  }
  if ($null -ne (Find-UserByUsername $username)) { throw "Username already exists." }

  $idBase = ($username.ToLowerInvariant() -replace '[^a-z0-9_\-]', '_')
  if (!$idBase) { $idBase = "user" }
  $id = $idBase
  while ($null -ne (Find-UserById $id)) {
    $id = "$idBase-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  }

  $store = Read-Users
  $newUser = [pscustomobject]@{
    id = $id
    username = $username
    displayName = $displayName
    role = $role
    active = $true
    passwordHash = New-StoredPassword $password
    apiKey = New-RandomHex 20
    createdAt = [DateTimeOffset]::UtcNow.ToString("o")
  }
  $userList = New-Object System.Collections.Generic.List[object]
  @(Get-UsersArray $store) | ForEach-Object { $userList.Add($_) }
  $userList.Add($newUser)
  $store.users = $userList.ToArray()
  Write-Users $store

  if ($null -ne $TemplateUser) {
    $template = Read-Config $TemplateUser.id
    Write-Config $template $id
  } else {
    $template = Read-UserTemplateConfig
    Write-Config $template $id
  }
  return $newUser
}

function New-InvitePublicView {
  param($Invite)
  return [pscustomobject]@{
    code = $Invite.code
    active = $Invite.active
    maxUses = $Invite.maxUses
    usedCount = $Invite.usedCount
    createdAt = $Invite.createdAt
    createdBy = $Invite.createdBy
    usedBy = @($Invite.usedBy)
  }
}

function New-UserPublicView {
  param($User)
  return [pscustomobject]@{
    id = $User.id
    username = $User.username
    displayName = $User.displayName
    role = $User.role
    active = $User.active
    apiKey = $User.apiKey
  }
}

function Initialize-Users {
  $store = Read-Users
  $users = Get-UsersArray $store
  if ($users.Count -gt 0) { return }

  $adminUser = [pscustomobject]@{
    id = "admin"
    username = "admin"
    displayName = "Super Admin"
    role = "super"
    active = $true
    passwordHash = New-StoredPassword $AdminToken
    apiKey = New-RandomHex 20
    createdAt = [DateTimeOffset]::UtcNow.ToString("o")
  }

  $store.users = @($adminUser)
  Write-Users $store

  $adminConfigPath = Get-UserConfigPath "admin"
  if (!(Test-Path -LiteralPath $adminConfigPath) -and (Test-Path -LiteralPath $ConfigPath)) {
    Copy-Item -LiteralPath $ConfigPath -Destination $adminConfigPath -Force
  }
}

function New-Session {
  param($User)
  $token = New-RandomHex 32
  $script:Sessions[$token] = [pscustomobject]@{
    userId = $User.id
    username = $User.username
    role = $User.role
    createdAt = [DateTimeOffset]::UtcNow
  }
  return $token
}

function Get-AuthContext {
  param([System.Net.HttpListenerRequest]$Request)
  $auth = $Request.Headers["Authorization"]
  $token = ""
  if ($auth -and $auth.StartsWith("Bearer ")) {
    $token = $auth.Substring(7)
  } elseif ($Request.QueryString["token"]) {
    $token = $Request.QueryString["token"]
  }

  if ($script:Sessions.ContainsKey($token)) {
    $session = $script:Sessions[$token]
    $user = Find-UserById $session.userId
    if ($null -ne $user -and $user.active -ne $false) {
      return [pscustomobject]@{ token = $token; user = $user }
    }
  }

  # Backward compatibility for the old single-token local setup.
  if ($token -eq $AdminToken) {
    $user = Find-UserById "admin"
    if ($null -ne $user) {
      return [pscustomobject]@{ token = $token; user = $user }
    }
  }

  return $null
}

function Get-TargetUserId {
  param($Auth, [System.Net.HttpListenerRequest]$Request)
  $target = $Request.Headers["X-Target-User"]
  if (!$target) { $target = $Request.QueryString["targetUserId"] }
  if ($Auth.user.role -eq "super" -and $target) {
    $targetUser = Find-UserById $target
    if ($null -eq $targetUser) { throw "Target user not found." }
    return $targetUser.id
  }
  return $Auth.user.id
}

function Get-UserByApiKey {
  param([string]$ApiKey)
  if ([string]::IsNullOrWhiteSpace($ApiKey)) { return $null }
  $store = Read-Users
  return (Get-UsersArray $store | Where-Object { $_.apiKey -eq $ApiKey -and $_.active -ne $false } | Select-Object -First 1)
}

function Get-RequestBaseUrl {
  param([System.Net.HttpListenerRequest]$Request)
  $scheme = "http"
  if ($Request.IsSecureConnection) { $scheme = "https" }
  $hostName = $Request.Headers["Host"]
  if ([string]::IsNullOrWhiteSpace($hostName)) {
    $hostName = $Request.Url.Authority
  }
  return "${scheme}://$hostName"
}

function Get-SafeFilePart {
  param([string]$Value, [string]$Default = "user")
  $part = ([string]$Value).Trim() -replace '[^a-zA-Z0-9_\-]+', "_"
  $part = $part.Trim("_")
  if ([string]::IsNullOrWhiteSpace($part)) { $part = $Default }
  if ($part.Length -gt 48) { $part = $part.Substring(0, 48) }
  return $part
}

function ConvertTo-CSharpStringLiteral {
  param([string]$Value)
  $text = [string]$Value
  $text = $text.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
  return '"' + $text + '"'
}

function Get-CSharpCompiler {
  $candidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v3.5\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v3.5\csc.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw "C# compiler was not found on this machine."
}

function New-ClientExecutable {
  param($User, [System.Net.HttpListenerRequest]$Request)
  $sourceTemplate = Join-Path $ClientTemplateDir "ToolboxClient.cs"
  if (!(Test-Path -LiteralPath $sourceTemplate)) { throw "Client exe template was not found." }

  $apiKey = [string]$User.apiKey
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "User api key is empty."
  }

  $baseUrl = (Get-RequestBaseUrl $Request).TrimEnd("/")
  $configUrl = "$baseUrl/api/toolbox/config?key=$([Uri]::EscapeDataString($apiKey))"
  $safeUser = Get-SafeFilePart (Get-Text $User "username" (Get-Text $User "id" "user"))
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("toolbox-client-" + [Guid]::NewGuid().ToString("N"))
  $sourcePath = Join-Path $tempRoot "ToolboxClient.cs"
  $exePath = Join-Path $tempRoot ("toolbox-" + $safeUser + ".exe")

  try {
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    $source = Get-Content -LiteralPath $sourceTemplate -Raw -Encoding UTF8
    $source = $source.Replace('"__CONFIG_URL__"', (ConvertTo-CSharpStringLiteral $configUrl))
    $source = $source.Replace('"__BUILD_STAMP__"', (ConvertTo-CSharpStringLiteral ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString())))
    $source = $source.Replace('"__INTEGRITY_SEED__"', (ConvertTo-CSharpStringLiteral (New-RandomHex 16)))
    Set-Content -LiteralPath $sourcePath -Value $source -Encoding UTF8

    $compiler = Get-CSharpCompiler
    $compilerArgs = @(
      "/nologo",
      "/target:winexe",
      "/platform:anycpu",
      "/optimize+",
      "/out:$exePath",
      "/reference:System.dll",
      "/reference:System.Core.dll",
      "/reference:System.Windows.Forms.dll",
      "/reference:System.Drawing.dll",
      "/reference:System.Web.Extensions.dll",
      $sourcePath
    )
    $compileOutput = & $compiler $compilerArgs 2>&1
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $exePath)) {
      throw ("Client exe build failed. " + (($compileOutput | Out-String).Trim()))
    }

    return [pscustomobject]@{
      fileName = "toolbox-$safeUser.exe"
      configUrl = $configUrl
      bytes = [IO.File]::ReadAllBytes($exePath)
    }
  } finally {
    if ($tempRoot.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $tempRoot)) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

Initialize-Users

function Get-ContentType {
  param([string]$Path)
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".ico" { "image/x-icon" }
    default { "application/octet-stream" }
  }
}

function Send-Static {
  param([System.Net.HttpListenerResponse]$Response, [string]$RoutePath)
  $relative = $RoutePath.TrimStart("/")
  if (!$relative) { $relative = "index.html" }

  $candidate = Join-Path $WwwRoot $relative
  $full = [IO.Path]::GetFullPath($candidate)
  $wwwFull = [IO.Path]::GetFullPath($WwwRoot)
  if (!$full.StartsWith($wwwFull, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $full)) {
    $full = Join-Path $WwwRoot "index.html"
  }

  Send-Bytes $Response ([IO.File]::ReadAllBytes($full)) (Get-ContentType $full)
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Url)
$listener.Start()
Write-Host "Toolbox admin API started: $Url"
Write-Host "Admin token: $AdminToken"
Write-Host "Public config endpoint: $($Url.TrimEnd('/'))/api/toolbox/config"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $path = $request.Url.AbsolutePath
    $method = $request.HttpMethod.ToUpperInvariant()

    try {
      if ($method -eq "OPTIONS") {
        Send-Text $response "" "text/plain; charset=utf-8"
        continue
      }

      if ($path -eq "/api/health") {
        Send-Json $response @{ ok = $true; app = "ToolboxAdminApi"; time = [DateTimeOffset]::UtcNow.ToString("o") }
        continue
      }

      if ($path -eq "/api/login" -and $method -eq "POST") {
        $body = Read-JsonBody $request
        $username = (Get-Text $body "username").Trim()
        $password = [string](Get-Text $body "password")
        $user = Find-UserByUsername $username
        if ($null -eq $user -or $user.active -eq $false -or !(Test-StoredPassword $password $user.passwordHash)) {
          Send-Json $response @{ error = "Invalid username or password." } 401
          continue
        }

        $token = New-Session $user
        Send-Json $response @{
          token = $token
          user = (New-UserPublicView $user)
        }
        continue
      }

      if ($path -eq "/api/register" -and $method -eq "POST") {
        $body = Read-JsonBody $request
        $username = (Get-Text $body "username").Trim()
        $password = [string](Get-Text $body "password")
        $displayName = (Get-Text $body "displayName" $username).Trim()
        $inviteCode = (Get-Text $body "inviteCode").Trim()
        if (!$username -or !$password -or !$inviteCode) { throw "Username, password and invite code are required." }
        if ($password.Length -lt 6) { throw "Password must be at least 6 characters." }

        $store = Read-Users
        $users = Get-UsersArray $store
        if ($null -ne ($users | Where-Object { $_.username -eq $username } | Select-Object -First 1)) {
          throw "Username already exists."
        }
        $invite = Get-InviteCodesArray $store | Where-Object { $_.code -eq $inviteCode } | Select-Object -First 1
        if ($null -eq $invite -or $invite.active -eq $false) { throw "Invite code is invalid." }
        $maxUses = 1
        if ($invite.PSObject.Properties.Name -contains "maxUses" -and $null -ne $invite.maxUses) { $maxUses = [int]$invite.maxUses }
        $usedCount = 0
        if ($invite.PSObject.Properties.Name -contains "usedCount" -and $null -ne $invite.usedCount) { $usedCount = [int]$invite.usedCount }
        if ($maxUses -gt 0 -and $usedCount -ge $maxUses) { throw "Invite code has been used." }

        $newUser = New-UserAccount $username $password $displayName "user" $null

        $store = Read-Users
        $invite = Get-InviteCodesArray $store | Where-Object { $_.code -eq $inviteCode } | Select-Object -First 1
        if ($null -ne $invite) {
          if (!($invite.PSObject.Properties.Name -contains "usedBy") -or $null -eq $invite.usedBy) {
            $invite | Add-Member -NotePropertyName usedBy -NotePropertyValue @() -Force
          }
          $usedList = New-Object System.Collections.Generic.List[object]
          @($invite.usedBy) | ForEach-Object { $usedList.Add($_) }
          $usedList.Add([pscustomobject]@{ userId = $newUser.id; username = $newUser.username; usedAt = [DateTimeOffset]::UtcNow.ToString("o") })
          $invite.usedBy = $usedList.ToArray()
          $invite.usedCount = $usedCount + 1
          if ($maxUses -gt 0 -and $invite.usedCount -ge $maxUses) { $invite.active = $false }
          Write-Users $store
        }

        $token = New-Session $newUser
        Send-Json $response @{
          token = $token
          user = (New-UserPublicView $newUser)
        }
        continue
      }

      if ($path -eq "/api/toolbox/config" -or $path -eq "/api/config") {
        $apiKey = $request.QueryString["key"]
        $publicUser = Get-UserByApiKey $apiKey
        if ($null -eq $publicUser) {
          Send-Json $response @{ error = "Invalid or disabled toolbox key." } 403
          continue
        }
        Send-Json $response (Read-Config $publicUser.id)
        continue
      }

      if ($path.StartsWith("/api/super")) {
        $auth = Get-AuthContext $request
        if ($null -eq $auth) {
          Send-Json $response @{ error = "Please log in first." } 401
          continue
        }
        if ($auth.user.role -ne "super") {
          Send-Json $response @{ error = "Super admin only." } 403
          continue
        }

        if ($path -eq "/api/super/users" -and $method -eq "GET") {
          $store = Read-Users
          $users = Get-UsersArray $store | ForEach-Object { New-UserPublicView $_ }
          Send-Json $response @{ users = @($users) }
          continue
        }

        if ($path -eq "/api/super/invites" -and $method -eq "GET") {
          $store = Read-Users
          $invites = Get-InviteCodesArray $store | ForEach-Object { New-InvitePublicView $_ }
          Send-Json $response @{ invites = @($invites) }
          continue
        }

        if ($path -eq "/api/super/invites" -and $method -eq "POST") {
          $body = Read-JsonBody $request
          $code = (Get-Text $body "code").Trim()
          $maxUses = Get-Int $body "maxUses" 1
          if ($maxUses -lt 1) { $maxUses = 1 }
          if ([string]::IsNullOrWhiteSpace($code)) {
            $code = ("YQ-" + (New-RandomHex 4).ToUpperInvariant())
          }

          $store = Read-Users
          if ($null -ne (Get-InviteCodesArray $store | Where-Object { $_.code -eq $code } | Select-Object -First 1)) {
            throw "Invite code already exists."
          }
          $invite = [pscustomobject]@{
            code = $code
            active = $true
            maxUses = $maxUses
            usedCount = 0
            usedBy = @()
            createdAt = [DateTimeOffset]::UtcNow.ToString("o")
            createdBy = $auth.user.username
          }
          $inviteList = New-Object System.Collections.Generic.List[object]
          @(Get-InviteCodesArray $store) | ForEach-Object { $inviteList.Add($_) }
          $inviteList.Insert(0, $invite)
          $store.inviteCodes = $inviteList.ToArray()
          Write-Users $store
          Send-Json $response (New-InvitePublicView $invite)
          continue
        }

        if ($path -eq "/api/super/invites" -and $method -eq "PATCH") {
          $body = Read-JsonBody $request
          $code = Get-Text $body "code"
          if (!$code) { throw "Missing invite code." }
          $store = Read-Users
          $invites = Get-InviteCodesArray $store
          $invite = $invites | Where-Object { $_.code -eq $code } | Select-Object -First 1
          if ($null -eq $invite) { throw "Invite code not found." }
          if ($body.PSObject.Properties.Name -contains "active") {
            $invite.active = [bool]$body.active
          }
          if ($body.PSObject.Properties.Name -contains "maxUses") {
            $maxUses = [int]$body.maxUses
            if ($maxUses -lt 1) { $maxUses = 1 }
            $invite.maxUses = $maxUses
          }
          $store.inviteCodes = @($invites)
          Write-Users $store
          Send-Json $response (New-InvitePublicView $invite)
          continue
        }

        if ($path -eq "/api/super/invites" -and $method -eq "DELETE") {
          $body = Read-JsonBody $request
          $code = Get-Text $body "code"
          if (!$code) { throw "Missing invite code." }
          $store = Read-Users
          $store.inviteCodes = @(Get-InviteCodesArray $store | Where-Object { $_.code -ne $code })
          Write-Users $store
          Send-Json $response @{ ok = $true }
          continue
        }

        if ($path -eq "/api/super/users" -and $method -eq "POST") {
          $body = Read-JsonBody $request
          $username = (Get-Text $body "username").Trim()
          $password = [string](Get-Text $body "password")
          $displayName = (Get-Text $body "displayName" $username).Trim()
          $role = (Get-Text $body "role" "user").Trim().ToLowerInvariant()
          $newUser = New-UserAccount $username $password $displayName $role $auth.user
          Send-Json $response (New-UserPublicView $newUser)
          continue
        }

        if ($path -eq "/api/super/users" -and $method -eq "PATCH") {
          $body = Read-JsonBody $request
          $id = Get-Text $body "id"
          if (!$id) { throw "Missing user id." }
          $store = Read-Users
          $users = Get-UsersArray $store
          $user = $users | Where-Object { $_.id -eq $id } | Select-Object -First 1
          if ($null -eq $user) { throw "User not found." }

          if ($body.PSObject.Properties.Name -contains "displayName") {
            $user.displayName = Get-Text $body "displayName" $user.displayName
          }
          if ($body.PSObject.Properties.Name -contains "role") {
            $role = (Get-Text $body "role" $user.role).ToLowerInvariant()
            $user.role = $(if ($role -eq "super") { "super" } else { "user" })
          }
          if ($body.PSObject.Properties.Name -contains "active") {
            $user.active = [bool]$body.active
          }
          $newPassword = Get-Text $body "password"
          if ($newPassword) {
            $user.passwordHash = New-StoredPassword $newPassword
          }
          if ($body.PSObject.Properties.Name -contains "resetApiKey" -and [bool]$body.resetApiKey) {
            $user.apiKey = New-RandomHex 20
          }

          $store.users = @($users)
          Write-Users $store
          Send-Json $response (New-UserPublicView $user)
          continue
        }

        if ($path -eq "/api/super/users" -and $method -eq "DELETE") {
          $body = Read-JsonBody $request
          $id = Get-Text $body "id"
          if (!$id -or $id -eq "admin") { throw "Cannot delete default super admin." }
          $store = Read-Users
          $store.users = @(Get-UsersArray $store | Where-Object { $_.id -ne $id })
          Write-Users $store
          Send-Json $response @{ ok = $true }
          continue
        }

        Send-Json $response @{ error = "Not found" } 404
        continue
      }

      if ($path.StartsWith("/api/admin")) {
        $auth = Get-AuthContext $request
        if ($null -eq $auth) {
          Send-Json $response @{ error = "Please log in first." } 401
          continue
        }
        $targetUserId = Get-TargetUserId $auth $request

        if ($path -eq "/api/admin/client/download" -and $method -eq "GET") {
          $targetUser = Ensure-UserApiKey $targetUserId
          if ($null -eq $targetUser) { throw "Target user not found." }
          $package = New-ClientExecutable $targetUser $request
          Send-DownloadBytes $response $package.bytes $package.fileName "application/vnd.microsoft.portable-executable"
          continue
        }

        if ($path -eq "/api/admin/me" -and $method -eq "GET") {
          $targetUser = Find-UserById $targetUserId
          Send-Json $response @{
            user = (New-UserPublicView $auth.user)
            targetUser = (New-UserPublicView $targetUser)
          }
          continue
        }

        if ($path -eq "/api/admin/config" -and $method -eq "GET") {
          Send-Json $response (Read-Config $targetUserId)
          continue
        }

        if ($path -eq "/api/admin/config" -and $method -eq "PUT") {
          $body = Read-JsonBody $request
          Write-ConfigForActor $body $targetUserId $auth.user
          Send-Json $response @{ ok = $true }
          continue
        }

        if ($path -eq "/api/admin/app" -and $method -eq "PATCH") {
          $patch = Read-JsonBody $request
          $config = Read-Config $targetUserId
          foreach ($prop in $patch.PSObject.Properties) {
            if ($prop.Name -eq "password_enabled") {
              if (!([bool]$prop.Value)) {
                $config.app.password = ""
              }
            } elseif ($prop.Name -eq "password") {
              $pwd = [string]$prop.Value
              if (![string]::IsNullOrWhiteSpace($pwd)) {
                $config.app.password = New-StoredPassword $pwd
              }
            } else {
              $config.app | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
            }
          }
          Write-ConfigForActor $config $targetUserId $auth.user
          Send-Json $response $config
          continue
        }

        if ($path -eq "/api/admin/buttons" -and $method -eq "GET") {
          Send-Json $response (Get-ButtonRows (Read-Config $targetUserId))
          continue
        }

        if ($path -eq "/api/admin/buttons" -and $method -eq "POST") {
          $body = Read-JsonBody $request
          $config = Read-Config $targetUserId
          $section = Get-ButtonCollection $config $body
          $button = New-ButtonObject $body.button
          $items = @($section.buttons)
          $section.buttons = @($items + $button)
          Write-ConfigForActor $config $targetUserId $auth.user
          Send-Json $response $button
          continue
        }

        if ($path -eq "/api/admin/buttons" -and $method -eq "PATCH") {
          $body = Read-JsonBody $request
          $config = Read-Config $targetUserId
          $section = Get-ButtonCollection $config $body -RequireButtonIndex
          $buttonIndex = Get-Int $body "buttonIndex"
          $button = New-ButtonObject $body.button
          $items = @($section.buttons)
          $items[$buttonIndex] = $button
          $section.buttons = $items
          Write-ConfigForActor $config $targetUserId $auth.user
          Send-Json $response $button
          continue
        }

        if ($path -eq "/api/admin/buttons" -and $method -eq "DELETE") {
          $body = Read-JsonBody $request
          $config = Read-Config $targetUserId
          $section = Get-ButtonCollection $config $body -RequireButtonIndex
          $buttonIndex = Get-Int $body "buttonIndex"
          $items = New-Object System.Collections.Generic.List[object]
          @($section.buttons) | ForEach-Object { $items.Add($_) }
          $items.RemoveAt($buttonIndex)
          $section.buttons = $items.ToArray()
          Write-ConfigForActor $config $targetUserId $auth.user
          Send-Json $response @{ ok = $true }
          continue
        }

        Send-Json $response @{ error = "Not found" } 404
        continue
      }

      Send-Static $response $path
    } catch {
      Send-Json $response @{ error = $_.Exception.Message } 500
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
