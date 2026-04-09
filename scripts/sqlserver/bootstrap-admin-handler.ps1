param(
    [string]$Email = 'jeroen.weber@nedzink.nl',
    [string]$Name = 'Jeroen Weber',
    [string]$UserId,
    [string]$Picture,
    [string]$SqlHost = $env:SQLSERVER_HOST,
    [int]$SqlPort = $(if ($env:SQLSERVER_PORT) { [int]$env:SQLSERVER_PORT } else { 1433 }),
    [string]$SqlDatabase = $env:SQLSERVER_DATABASE,
    [string]$SqlUsername = $env:SQLSERVER_USERNAME,
    [string]$SqlPassword = $env:SQLSERVER_PASSWORD,
    [string]$EnvPath
)

$ErrorActionPreference = 'Stop'

function Import-DotEnv {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf('=')
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()

        if ($value.Length -ge 2) {
            $firstChar = $value.Substring(0, 1)
            $lastChar = $value.Substring($value.Length - 1, 1)
            if (($firstChar -eq '"' -and $lastChar -eq '"') -or ($firstChar -eq "'" -and $lastChar -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

function New-SqlConnection {
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source'] = '{0},{1}' -f $SqlHost, $SqlPort
    $builder['Initial Catalog'] = $SqlDatabase
    $builder['User ID'] = $SqlUsername
    $builder['Password'] = $SqlPassword
    $builder['Encrypt'] = $true
    $builder['TrustServerCertificate'] = $true
    $builder['Connect Timeout'] = 15
    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    $connection.Open()
    return $connection
}

function Get-Auth0ManagementToken {
    $domain = [string]$env:VITE_AUTH0_DOMAIN
    $clientId = [string]$env:AUTH0_MGMT_CLIENT_ID
    $clientSecret = [string]$env:AUTH0_MGMT_CLIENT_SECRET
    $audience = [string]$env:AUTH0_MGMT_AUDIENCE

    if ([string]::IsNullOrWhiteSpace($domain) -or [string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret) -or [string]::IsNullOrWhiteSpace($audience)) {
        return $null
    }

    $tokenResponse = Invoke-RestMethod -Method Post -Uri ("https://{0}/oauth/token" -f $domain) -ContentType 'application/json' -Body (@{
        client_id = $clientId
        client_secret = $clientSecret
        audience = $audience
        grant_type = 'client_credentials'
    } | ConvertTo-Json -Compress)

    return [string]$tokenResponse.access_token
}

function Get-Auth0UserByEmail {
    param([string]$LookupEmail)

    if ([string]::IsNullOrWhiteSpace($LookupEmail)) {
        return $null
    }

    try {
        $token = Get-Auth0ManagementToken
        if ([string]::IsNullOrWhiteSpace($token)) {
            return $null
        }

        $domain = [string]$env:VITE_AUTH0_DOMAIN
        $uri = "https://$domain/api/v2/users-by-email?email=$([uri]::EscapeDataString($LookupEmail))"
        $users = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
            Authorization = "Bearer $token"
        }

        return @($users) | Select-Object -First 1
    } catch {
        Write-Warning "Auth0 lookup failed for ${LookupEmail}: $($_.Exception.Message)"
        return $null
    }
}

function Sync-HandlerRoles {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [System.Data.SqlClient.SqlTransaction]$Transaction,
        [Guid]$HandlerId,
        [string[]]$Roles
    )

    $deleteCmd = $Connection.CreateCommand()
    $deleteCmd.Transaction = $Transaction
    $deleteCmd.CommandText = 'DELETE FROM dbo.handler_roles WHERE handler_id = @handler_id'
    $null = $deleteCmd.Parameters.Add('@handler_id', [System.Data.SqlDbType]::UniqueIdentifier)
    $deleteCmd.Parameters['@handler_id'].Value = $HandlerId
    [void]$deleteCmd.ExecuteNonQuery()

    foreach ($role in $Roles) {
        $insertCmd = $Connection.CreateCommand()
        $insertCmd.Transaction = $Transaction
        $insertCmd.CommandText = @'
INSERT INTO dbo.handler_roles (id, handler_id, role_id, created_at)
SELECT NEWID(), @handler_id, r.id, SYSUTCDATETIME()
FROM dbo.roles r
WHERE r.code = @role_code
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.handler_roles hr
      WHERE hr.handler_id = @handler_id
        AND hr.role_id = r.id
  );
'@
        $null = $insertCmd.Parameters.Add('@handler_id', [System.Data.SqlDbType]::UniqueIdentifier)
        $null = $insertCmd.Parameters.Add('@role_code', [System.Data.SqlDbType]::NVarChar, 100)
        $insertCmd.Parameters['@handler_id'].Value = $HandlerId
        $insertCmd.Parameters['@role_code'].Value = $role
        [void]$insertCmd.ExecuteNonQuery()
    }
}

if (-not $EnvPath) {
    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    foreach ($candidate in @(
        (Join-Path $repoRoot '.env'),
        (Join-Path $repoRoot '.env.local')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            $EnvPath = $candidate
            break
        }
    }
}

Import-DotEnv -Path $EnvPath

if (-not $SqlHost) { $SqlHost = $env:SQLSERVER_HOST }
if (-not $SqlPort -and $env:SQLSERVER_PORT) { $SqlPort = [int]$env:SQLSERVER_PORT }
if (-not $SqlDatabase) { $SqlDatabase = $env:SQLSERVER_DATABASE }
if (-not $SqlUsername) { $SqlUsername = $env:SQLSERVER_USERNAME }
if (-not $SqlPassword) { $SqlPassword = $env:SQLSERVER_PASSWORD }

if (-not $SqlHost -or -not $SqlDatabase -or -not $SqlUsername -or -not $SqlPassword) {
    throw 'Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USERNAME, and SQLSERVER_PASSWORD in your shell or .env before running this script.'
}

$normalizedEmail = $Email.Trim().ToLowerInvariant()
$auth0User = Get-Auth0UserByEmail -LookupEmail $normalizedEmail
if (-not $UserId -and $auth0User) {
    $UserId = [string]$auth0User.user_id
}
if (-not $Name -and $auth0User) {
    $Name = [string]$auth0User.name
}
if (-not $Picture -and $auth0User) {
    $Picture = [string]$auth0User.picture
}

if (-not $Name) {
    $Name = 'Administrator'
}

$roles = @('HANDLER', 'ADMIN', 'SUPER_ADMIN')
$permissions = @{
    canViewTickets = $true
    canEditTickets = $true
    canDeleteTickets = $true
    canManageUsers = $true
    canExportData = $true
    canManageWorkflows = $true
    admin = $true
    manage_users = $true
    manage_workflows = $true
    manage_settings = $true
    manage_translations = $true
} | ConvertTo-Json -Compress

$connection = New-SqlConnection
try {
    $transaction = $connection.BeginTransaction()
    try {
        $findCmd = $connection.CreateCommand()
        $findCmd.Transaction = $transaction
        $findCmd.CommandText = @'
SELECT TOP 1 id
FROM dbo.handlers
WHERE (@user_id IS NOT NULL AND user_id = @user_id)
   OR (@email IS NOT NULL AND LOWER(email) = LOWER(@email))
'@
        $null = $findCmd.Parameters.Add('@user_id', [System.Data.SqlDbType]::NVarChar, 255)
        $null = $findCmd.Parameters.Add('@email', [System.Data.SqlDbType]::NVarChar, 255)
        $findCmd.Parameters['@user_id'].Value = if ($UserId) { $UserId } else { [DBNull]::Value }
        $findCmd.Parameters['@email'].Value = if ($normalizedEmail) { $normalizedEmail } else { [DBNull]::Value }
        $existingId = $findCmd.ExecuteScalar()
        $handlerId = if ($existingId) { [Guid]$existingId } else { [Guid]::NewGuid() }

        $upsertCmd = $connection.CreateCommand()
        $upsertCmd.Transaction = $transaction
        $upsertCmd.CommandText = @'
MERGE dbo.handlers AS target
USING (
    SELECT
        @id AS id,
        @name AS name,
        @email AS email,
        @user_id AS user_id,
        @picture AS picture,
        @roles AS roles,
        @permissions AS permissions
) AS source
ON target.id = source.id
WHEN MATCHED THEN
    UPDATE SET
        name = source.name,
        email = source.email,
        user_id = COALESCE(source.user_id, target.user_id),
        picture = COALESCE(source.picture, target.picture),
        roles = source.roles,
        permissions = source.permissions,
        active = 1,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, name, email, user_id, picture, roles, permissions, active, created_at, updated_at)
    VALUES (source.id, source.name, source.email, source.user_id, source.picture, source.roles, source.permissions, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
'@
        $null = $upsertCmd.Parameters.Add('@id', [System.Data.SqlDbType]::UniqueIdentifier)
        $null = $upsertCmd.Parameters.Add('@name', [System.Data.SqlDbType]::NVarChar, 255)
        $null = $upsertCmd.Parameters.Add('@email', [System.Data.SqlDbType]::NVarChar, 255)
        $null = $upsertCmd.Parameters.Add('@user_id', [System.Data.SqlDbType]::NVarChar, 255)
        $null = $upsertCmd.Parameters.Add('@picture', [System.Data.SqlDbType]::NVarChar, 1024)
        $null = $upsertCmd.Parameters.Add('@roles', [System.Data.SqlDbType]::NVarChar, -1)
        $null = $upsertCmd.Parameters.Add('@permissions', [System.Data.SqlDbType]::NVarChar, -1)
        $upsertCmd.Parameters['@id'].Value = $handlerId
        $upsertCmd.Parameters['@name'].Value = $Name
        $upsertCmd.Parameters['@email'].Value = if ($normalizedEmail) { $normalizedEmail } else { [DBNull]::Value }
        $upsertCmd.Parameters['@user_id'].Value = if ($UserId) { $UserId } else { [DBNull]::Value }
        $upsertCmd.Parameters['@picture'].Value = if ($Picture) { $Picture } else { [DBNull]::Value }
        $upsertCmd.Parameters['@roles'].Value = ($roles | ConvertTo-Json -Compress)
        $upsertCmd.Parameters['@permissions'].Value = $permissions
        [void]$upsertCmd.ExecuteNonQuery()

        if ($UserId) {
            $profileCmd = $connection.CreateCommand()
            $profileCmd.Transaction = $transaction
            $profileCmd.CommandText = @'
MERGE dbo.user_profiles AS target
USING (
    SELECT
        @id AS id,
        @email AS email,
        @name AS name,
        @picture AS picture
) AS source
ON target.id = source.id
WHEN MATCHED THEN
    UPDATE SET
        email = source.email,
        name = source.name,
        picture = source.picture,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, email, name, picture, metadata, created_at, updated_at)
    VALUES (source.id, source.email, source.name, source.picture, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());
'@
            $null = $profileCmd.Parameters.Add('@id', [System.Data.SqlDbType]::NVarChar, 255)
            $null = $profileCmd.Parameters.Add('@email', [System.Data.SqlDbType]::NVarChar, 255)
            $null = $profileCmd.Parameters.Add('@name', [System.Data.SqlDbType]::NVarChar, 255)
            $null = $profileCmd.Parameters.Add('@picture', [System.Data.SqlDbType]::NVarChar, 1024)
            $profileCmd.Parameters['@id'].Value = $UserId
            $profileCmd.Parameters['@email'].Value = if ($normalizedEmail) { $normalizedEmail } else { [DBNull]::Value }
            $profileCmd.Parameters['@name'].Value = $Name
            $profileCmd.Parameters['@picture'].Value = if ($Picture) { $Picture } else { [DBNull]::Value }
            [void]$profileCmd.ExecuteNonQuery()
        }

        Sync-HandlerRoles -Connection $connection -Transaction $transaction -HandlerId $handlerId -Roles $roles
        $transaction.Commit()

        Write-Host "Admin handler bootstrapped: $normalizedEmail"
        if ($UserId) {
            Write-Host "Auth0 user_id linked: $UserId"
        }
        Write-Host "Handler ID: $handlerId"
    } catch {
        $transaction.Rollback()
        throw
    }
} finally {
    $connection.Dispose()
}
