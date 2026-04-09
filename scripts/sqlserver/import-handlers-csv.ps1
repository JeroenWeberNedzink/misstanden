param(
    [string]$CsvPath,
    [string]$SqlHost = $env:SQLSERVER_HOST,
    [int]$SqlPort = $(if ($env:SQLSERVER_PORT) { [int]$env:SQLSERVER_PORT } else { 1433 }),
    [string]$SqlDatabase = $env:SQLSERVER_DATABASE,
    [string]$SqlUsername = $env:SQLSERVER_USERNAME,
    [string]$SqlPassword = $env:SQLSERVER_PASSWORD,
    [string]$PromoteEmail = 'jeroen.weber@nedzink.nl',
    [switch]$PromoteToSuperAdmin = $true,
    [string]$EnvPath
)

$ErrorActionPreference = 'Stop'

function Import-DotEnv {
    param(
        [string]$Path
    )

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

function Resolve-DefaultCsvPath {
    $downloads = [Environment]::GetFolderPath('UserProfile')
    if (-not $downloads) {
        $downloads = 'C:\Users\jeroen.weber'
    }
    $downloads = Join-Path $downloads 'Downloads'
    $candidates = Get-ChildItem -Path $downloads -Filter 'handlers_rows*.csv' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    return ($candidates | Select-Object -First 1).FullName
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

function Test-GuidValue {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    $parsed = [Guid]::Empty
    return [Guid]::TryParse($Value, [ref]$parsed)
}

function Convert-ToBool {
    param($Value)

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $false
    }

    return @('1', 'true', 'yes', 'on') -contains $text.Trim().ToLowerInvariant()
}

function Convert-ToDateTimeOrNull {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $parsed = [DateTime]::MinValue
    if ([DateTime]::TryParse($Value, [ref]$parsed)) {
        return $parsed
    }

    return $null
}

function Convert-ToJsonObject {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return @{}
    }

    try {
        $obj = $Value | ConvertFrom-Json
        if ($null -eq $obj) {
            return @{}
        }

        if ($obj -is [System.Collections.IDictionary]) {
            $ht = @{}
            foreach ($property in $obj.GetEnumerator()) {
                $ht[[string]$property.Key] = $property.Value
            }
            return $ht
        }

        if ($obj.PSObject -and $obj.PSObject.Properties) {
            $ht = @{}
            foreach ($property in $obj.PSObject.Properties) {
                $ht[[string]$property.Name] = $property.Value
            }
            return $ht
        }
    } catch {
        return @{}
    }

    return @{}
}

function Normalize-Roles {
    param(
        [string]$RolesValue,
        [string]$RolesTmpValue,
        [bool]$MakeSuperAdmin
    )

    $rawRoles = @()
    foreach ($candidate in @($RolesValue, $RolesTmpValue)) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        try {
            $decoded = $candidate | ConvertFrom-Json
            if ($decoded -is [System.Collections.IEnumerable] -and -not ($decoded -is [string])) {
                foreach ($item in $decoded) {
                    $rawRoles += [string]$item
                }
                continue
            }
        } catch {
        }

        $rawRoles += ($candidate -split '[,\s]+')
    }

    $roles = New-Object System.Collections.Generic.List[string]
    foreach ($role in $rawRoles) {
        $normalized = ([string]$role).Trim().ToUpperInvariant()
        if ($normalized -eq '') {
            continue
        }
        if ($roles -notcontains $normalized) {
            [void]$roles.Add($normalized)
        }
    }

    if ($roles.Count -eq 0) {
        [void]$roles.Add('HANDLER')
    }

    if ($MakeSuperAdmin) {
        foreach ($role in @('HANDLER', 'ADMIN', 'SUPER_ADMIN')) {
            if ($roles -notcontains $role) {
                [void]$roles.Add($role)
            }
        }
    }

    return $roles.ToArray()
}

function Convert-RolesToJson {
    param([string[]]$Roles)

    $items = foreach ($role in ($Roles | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        '"' + $role.Replace('\', '\\').Replace('"', '\"') + '"'
    }

    return '[' + ($items -join ',') + ']'
}

function Convert-PermissionsObject {
    param(
        [string]$PermissionsValue,
        [string[]]$Roles
    )

    $parsed = Convert-ToJsonObject -Value $PermissionsValue
    $permissions = @{}

    foreach ($entry in $parsed.GetEnumerator()) {
        $key = ([string]$entry.Key).Trim()
        if ($key -eq '' -or $key -match '^\d+$') {
            continue
        }
        $boolValue = Convert-ToBool -Value $entry.Value
        $permissions[$key] = $boolValue
    }

    if ($Roles -contains 'HANDLER') {
        $permissions['canViewTickets'] = $true
        $permissions['canEditTickets'] = $true
    }

    if ($Roles -contains 'ADMIN' -or $Roles -contains 'SUPER_ADMIN') {
        foreach ($key in @(
            'canViewTickets',
            'canEditTickets',
            'canDeleteTickets',
            'canManageUsers',
            'canExportData',
            'canManageWorkflows',
            'admin',
            'manage_users',
            'manage_workflows',
            'manage_settings',
            'manage_translations'
        )) {
            $permissions[$key] = $true
        }
    }

    return ($permissions | ConvertTo-Json -Compress -Depth 10)
}

function Invoke-HandlerUpsert {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [System.Data.SqlClient.SqlTransaction]$Transaction,
        [pscustomobject]$Row
    )

    $cmd = $Connection.CreateCommand()
    $cmd.Transaction = $Transaction
    $cmd.CommandText = @'
MERGE dbo.handlers AS target
USING (
    SELECT
        @id AS id,
        @name AS name,
        @email AS email,
        @active AS active,
        @phone AS phone,
        @created_at AS created_at,
        @updated_at AS updated_at,
        @roles AS roles,
        @last_login AS last_login,
        @user_id AS user_id,
        @picture AS picture,
        @permissions AS permissions
) AS source
ON target.id = source.id
WHEN MATCHED THEN
    UPDATE SET
        name = source.name,
        email = source.email,
        active = source.active,
        phone = source.phone,
        created_at = COALESCE(source.created_at, target.created_at),
        updated_at = COALESCE(source.updated_at, target.updated_at),
        roles = source.roles,
        last_login = source.last_login,
        user_id = source.user_id,
        picture = source.picture,
        permissions = source.permissions
WHEN NOT MATCHED THEN
    INSERT (id, name, email, active, phone, created_at, updated_at, roles, last_login, user_id, picture, permissions)
    VALUES (source.id, source.name, source.email, source.active, source.phone, COALESCE(source.created_at, SYSUTCDATETIME()), COALESCE(source.updated_at, SYSUTCDATETIME()), source.roles, source.last_login, source.user_id, source.picture, source.permissions);
'@

    $null = $cmd.Parameters.Add('@id', [System.Data.SqlDbType]::UniqueIdentifier)
    $null = $cmd.Parameters.Add('@name', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@email', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@active', [System.Data.SqlDbType]::Bit)
    $null = $cmd.Parameters.Add('@phone', [System.Data.SqlDbType]::NVarChar, 50)
    $null = $cmd.Parameters.Add('@created_at', [System.Data.SqlDbType]::DateTime2)
    $null = $cmd.Parameters.Add('@updated_at', [System.Data.SqlDbType]::DateTime2)
    $null = $cmd.Parameters.Add('@roles', [System.Data.SqlDbType]::NVarChar, -1)
    $null = $cmd.Parameters.Add('@last_login', [System.Data.SqlDbType]::DateTime2)
    $null = $cmd.Parameters.Add('@user_id', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@picture', [System.Data.SqlDbType]::NVarChar, 1024)
    $null = $cmd.Parameters.Add('@permissions', [System.Data.SqlDbType]::NVarChar, -1)

    $cmd.Parameters['@id'].Value = [Guid]$Row.id
    $cmd.Parameters['@name'].Value = $Row.name
    $cmd.Parameters['@email'].Value = if ($Row.email) { $Row.email } else { [DBNull]::Value }
    $cmd.Parameters['@active'].Value = $Row.active
    $cmd.Parameters['@phone'].Value = if ($Row.phone) { $Row.phone } else { [DBNull]::Value }
    $cmd.Parameters['@created_at'].Value = if ($Row.created_at) { $Row.created_at } else { [DBNull]::Value }
    $cmd.Parameters['@updated_at'].Value = if ($Row.updated_at) { $Row.updated_at } else { [DBNull]::Value }
    $cmd.Parameters['@roles'].Value = $Row.roles
    $cmd.Parameters['@last_login'].Value = if ($Row.last_login) { $Row.last_login } else { [DBNull]::Value }
    $cmd.Parameters['@user_id'].Value = if ($Row.user_id) { $Row.user_id } else { [DBNull]::Value }
    $cmd.Parameters['@picture'].Value = if ($Row.picture) { $Row.picture } else { [DBNull]::Value }
    $cmd.Parameters['@permissions'].Value = $Row.permissions

    [void]$cmd.ExecuteNonQuery()
}

function Invoke-UserProfileUpsert {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [System.Data.SqlClient.SqlTransaction]$Transaction,
        [pscustomobject]$Row
    )

    if ([string]::IsNullOrWhiteSpace($Row.user_id)) {
        return
    }

    $cmd = $Connection.CreateCommand()
    $cmd.Transaction = $Transaction
    $cmd.CommandText = @'
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

    $null = $cmd.Parameters.Add('@id', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@email', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@name', [System.Data.SqlDbType]::NVarChar, 255)
    $null = $cmd.Parameters.Add('@picture', [System.Data.SqlDbType]::NVarChar, 1024)

    $cmd.Parameters['@id'].Value = $Row.user_id
    $cmd.Parameters['@email'].Value = if ($Row.email) { $Row.email } else { [DBNull]::Value }
    $cmd.Parameters['@name'].Value = $Row.name
    $cmd.Parameters['@picture'].Value = if ($Row.picture) { $Row.picture } else { [DBNull]::Value }

    [void]$cmd.ExecuteNonQuery()
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

if (-not $CsvPath) {
    $CsvPath = Resolve-DefaultCsvPath
}

if (-not $SqlHost -or -not $SqlDatabase -or -not $SqlUsername -or -not $SqlPassword) {
    throw 'Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USERNAME, and SQLSERVER_PASSWORD in your shell or .env before running this script.'
}

if (-not $CsvPath -or -not (Test-Path -LiteralPath $CsvPath)) {
    throw 'Could not find handlers CSV export. Pass -CsvPath or place handlers_rows.csv in Downloads.'
}

$rows = Import-Csv -LiteralPath $CsvPath
if (-not $rows -or $rows.Count -eq 0) {
    throw "No rows found in $CsvPath"
}

$connection = New-SqlConnection
try {
    $transaction = $connection.BeginTransaction()
    try {
        $imported = 0
        foreach ($csvRow in $rows) {
            $id = [string]$csvRow.id
            if (-not (Test-GuidValue -Value $id)) {
                Write-Warning "Skipping handler row with invalid id: $id"
                continue
            }

            $email = ([string]$csvRow.email).Trim().ToLowerInvariant()
            $shouldPromote = $PromoteToSuperAdmin -and -not [string]::IsNullOrWhiteSpace($PromoteEmail) -and $email -eq $PromoteEmail.Trim().ToLowerInvariant()
            $roles = Normalize-Roles -RolesValue ([string]$csvRow.roles) -RolesTmpValue ([string]$csvRow.roles_tmp) -MakeSuperAdmin $shouldPromote
            $permissions = Convert-PermissionsObject -PermissionsValue ([string]$csvRow.permissions) -Roles $roles
            $name = ([string]$csvRow.name).Trim()
            if ($name -eq '') {
                $name = if ($email) { ($email -split '@')[0] } else { 'Nieuwe gebruiker' }
            }

            $row = [pscustomobject]@{
                id = $id
                name = $name
                email = if ($email) { $email } else { $null }
                active = Convert-ToBool -Value $csvRow.active
                phone = ([string]$csvRow.phone).Trim()
                created_at = Convert-ToDateTimeOrNull -Value ([string]$csvRow.created_at)
                updated_at = Convert-ToDateTimeOrNull -Value ([string]$csvRow.updated_at)
                roles = (Convert-RolesToJson -Roles $roles)
                last_login = Convert-ToDateTimeOrNull -Value ([string]$csvRow.last_login)
                user_id = ([string]$csvRow.user_id).Trim()
                picture = ([string]$csvRow.picture).Trim()
                permissions = $permissions
            }

            Invoke-HandlerUpsert -Connection $connection -Transaction $transaction -Row $row
            Invoke-UserProfileUpsert -Connection $connection -Transaction $transaction -Row $row
            Sync-HandlerRoles -Connection $connection -Transaction $transaction -HandlerId ([Guid]$row.id) -Roles $roles
            $imported++
        }

        $transaction.Commit()
        Write-Host "Imported $imported handler row(s) from $CsvPath into $SqlDatabase"
    } catch {
        $transaction.Rollback()
        throw
    }
} finally {
    $connection.Dispose()
}
